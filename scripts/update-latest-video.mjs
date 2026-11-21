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

async function getRecording(entry) {
  const { videoId } = entry;
  const html = await fetchText('https://www.youtube.com/watch?v=' + videoId);
  const payload = html.match(/\bytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!payload) throw new Error('Missing YouTube player response');
  const player = JSON.parse(payload[1]);
  const status = player.playabilityStatus?.status;
  if (!status || status === 'LOGIN_REQUIRED') throw new Error('Player status unavailable: ' + status);
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
const recordings = [];
const unavailable = new Set();
// Replay publication order can differ from the order of services on the same day.
for (const entry of entries) {
  try {
    const recording = await getRecording(entry);
    if (recording) recordings.push(recording);
  } catch (error) {
    unavailable.add(entry.videoId);
    console.warn('Could not check ' + entry.videoId + ': ' + error.message);
  }
}
recordings.sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt));
const recording = recordings[0];
if (!recording) throw new Error('No playable recording found. Keeping the published link.');
if (unavailable.has(previous.videoId) && Date.parse(previous.recordedAt) > Date.parse(recording.recordedAt)) {
  throw new Error('Could not recheck the current recording. Keeping the newer published link.');
}

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
