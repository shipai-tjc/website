import { readFile, writeFile } from 'node:fs/promises';

const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCk8zggAqSLPpgpTlR75Ju6w';
const feedUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId);
const entriesPath = 'data/latest-video.json';

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('YouTube returned HTTP ' + response.status);
  return response.text();
}

function readTag(entry, name) {
  const value = entry.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'))?.[1] || '';
  return value.trim().replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&#39;', "'").replaceAll('&amp;', '&');
}

// The channel's Latest order follows service order even when morning and afternoon
// replays enter the RSS feed in reverse order. Require a past date and a fixed duration.
async function listedRecordings(tab, feed) {
  const html = await fetchText('https://www.youtube.com/channel/' + channelId + '/' + tab + '?hl=en');
  const payload = html.match(/\bytInitialData\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!payload) throw new Error('Missing public channel listing: ' + tab);
  const data = JSON.parse(payload[1]);
  if (data.metadata?.channelMetadataRenderer?.externalId !== channelId) throw new Error('Unexpected channel');
  const tabs = data.contents.twoColumnBrowseResultsRenderer.tabs;
  const selected = tabs.map(item => item.tabRenderer).find(item => item?.selected);
  const path = selected?.endpoint?.commandMetadata?.webCommandMetadata?.url;
  if (!path?.endsWith('/' + tab)) throw new Error('Unexpected channel tab: ' + tab);

  const recordings = [];
  for (const item of selected.content.richGridRenderer.contents) {
    const video = item.richItemRenderer?.content?.lockupViewModel;
    const entry = feed.get(video?.contentId);
    if (!entry) continue;
    const meta = video.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel;
    const parts = meta?.metadataRows?.flatMap(row => row.metadataParts || []) || [];
    const pastDate = tab === 'streams' ? /^Streamed .+ ago$/i : / ago$/i;
    if (!parts.some(part => pastDate.test(part.text?.content))) continue;
    const overlays = video.contentImage?.thumbnailViewModel?.overlays || [];
    const badges = overlays.flatMap(overlay => overlay.thumbnailBottomOverlayViewModel?.badges || []);
    const duration = badges.map(badge => badge.thumbnailBadgeViewModel)
      .find(badge => badge?.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT' && /^\d+(?::[0-5]\d){1,2}$/.test(badge.text));
    if (!duration) continue;
    const seconds = duration.text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    if (seconds > 0) recordings.push({ ...entry, durationSeconds: seconds });
  }
  return recordings;
}

async function getRecording(entry, previous) {
  const { videoId } = entry;
  const html = await fetchText('https://www.youtube.com/watch?v=' + videoId + '&hl=en');
  const payload = html.match(/\bytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!payload) throw new Error('Missing YouTube player response');
  const player = JSON.parse(payload[1]);
  const status = player.playabilityStatus?.status;
  // Hosted runners can receive a sign-in prompt even for public replays. Confirm
  // the listed recording also has public YouTube embed metadata in that case.
  if (status === 'LOGIN_REQUIRED' && /bot/i.test(player.playabilityStatus.reason || '')) {
    const url = 'https://www.youtube.com/watch?v=' + videoId;
    const embed = JSON.parse(await fetchText('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(url)));
    if (embed.type !== 'video') return null;
    if (previous.videoId === videoId && previous.recordedAt && previous.durationSeconds > 0) {
      return { ...entry, recordedAt: previous.recordedAt, durationSeconds: previous.durationSeconds };
    }
    return entry;
  }
  if (!status) throw new Error('Missing player status');
  if (status !== 'OK') return null;
  const video = player.videoDetails;
  if (video?.videoId !== videoId || video.channelId !== channelId) return null;
  const broadcast = player.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
  if (video.isUpcoming || video.isLive || broadcast?.isLiveNow) return null;
  if ((video.isLiveContent || broadcast) && !Number.isFinite(Date.parse(broadcast?.endTimestamp))) return null;
  const duration = Number(video.lengthSeconds);
  if (!Number.isSafeInteger(duration) || duration <= 0) return null;
  const recordedAt = broadcast?.endTimestamp || entry.publishedAt;
  return { ...entry, recordedAt, durationSeconds: duration };
}

const feed = await fetchText(feedUrl);
const entries = Array.from(feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g), ([, entry]) => ({
  videoId: readTag(entry, 'yt:videoId'),
  title: readTag(entry, 'title'),
  publishedAt: readTag(entry, 'published')
})).filter(entry => /^[\w-]{11}$/.test(entry.videoId) && Number.isFinite(Date.parse(entry.publishedAt)));

const previous = JSON.parse(await readFile(entriesPath, 'utf8'));
const byId = new Map(entries.map(entry => [entry.videoId, entry]));
const tabs = await Promise.all(['streams', 'videos'].map(tab => listedRecordings(tab, byId)));
const recordings = [];
for (const candidates of tabs) {
  for (const candidate of candidates) {
    const recording = await getRecording(candidate, previous);
    if (recording) {
      recordings.push(recording);
      break;
    }
  }
}
const timestamp = entry => Date.parse(entry.recordedAt || entry.publishedAt);
recordings.sort((a, b) => timestamp(b) - timestamp(a));
const recording = recordings[0];
if (!recording) throw new Error('No playable recording found. Keeping the published link.');

if (Object.keys(recording).some(key => previous[key] !== recording[key])) {
  const data = { ...recording, updatedAt: new Date().toISOString() };
  await writeFile(entriesPath, JSON.stringify(data, null, 2) + '\n');
}

// Keep the native link current even before JavaScript loads on a phone.
const home = await readFile('index.html', 'utf8');
const linkPattern = /(<a\b[^>]*\bid="shipai-gathering-link"[^>]*\bhref=")[^"]+(")/;
if (!linkPattern.test(home)) throw new Error('Missing gathering video link on the home page');
const href = 'https://www.youtube.com/watch?v=' + recording.videoId + '&amp;autoplay=1';
const updatedHome = home.replace(linkPattern, (_, prefix, suffix) => prefix + href + suffix);
if (updatedHome !== home) await writeFile('index.html', updatedHome);
console.log(recording.title + ' (' + recording.videoId + ', ' + recording.durationSeconds + 's)');
