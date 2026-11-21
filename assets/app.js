// Mobile menu
const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');

if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
  });
}

// Blogger latest post with an on-page text preview. JSONP works on GitHub Pages without a backend.
(function loadLatestBloggerPost(){
  const summary = document.getElementById('latest-blog-summary');
  const link = document.getElementById('latest-blog-link');
  if (!summary || !link) return;

  window.handleShipaiBlogFeed = function(data){
    try {
      const entry = data.feed.entry && data.feed.entry[0];
      if (!entry) throw new Error('No post');

      const title = entry.title.$t;
      const href = entry.link.find(item => item.rel === 'alternate')?.href || 'https://tjcshipaiandtianmu.blogspot.com/';
      const published = new Date(entry.published.$t).toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const sourceHtml = entry.content?.$t || entry.summary?.$t || '';
      const previewBox = document.createElement('div');
      previewBox.innerHTML = sourceHtml;
      const preview = (previewBox.textContent || '').replace(/\s+/g, ' ').trim();
      const excerpt = preview.length > 150 ? preview.slice(0, 150) + '…' : preview;

      summary.replaceChildren();
      const heading = document.createElement('strong');
      heading.textContent = title;
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = published;
      const excerptNode = document.createElement('p');
      excerptNode.className = 'reading-preview';
      excerptNode.textContent = excerpt || '點擊閱讀最新完整內容。';
      summary.append(heading, document.createElement('br'), date, excerptNode);
      link.href = href;
    } catch (error) {
      summary.textContent = '目前無法自動讀取最新文章，請點擊進入每日讀經心得網站。';
    }
  };

  const script = document.createElement('script');
  script.src = 'https://tjcshipaiandtianmu.blogspot.com/feeds/posts/default?alt=json-in-script&max-results=1&callback=handleShipaiBlogFeed';
  script.onerror = function(){
    summary.textContent = '目前無法自動讀取最新文章，請點擊進入每日讀經心得網站。';
  };
  document.body.appendChild(script);
})();

// Refresh a home page left open between recordings. The HTML link works immediately.
(function loadShipaiGathering() {
  const link = document.getElementById('shipai-gathering-link');
  if (!link) return;

  async function refresh() {
    try {
      const response = await fetch('data/latest-video.json?t=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (!Number.isSafeInteger(data.durationSeconds) || data.durationSeconds <= 0 ||
          typeof data.videoId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(data.videoId)) return;
      link.href = 'https://www.youtube.com/watch?v=' + data.videoId + '&autoplay=1';
      link.title = '觀看最新崇拜聚會影片：' + data.title;
    } catch {
      // The last verified link stays usable if the update is unavailable.
    }
  }

  refresh();
  window.setInterval(refresh, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
})();
