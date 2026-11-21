async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Cannot load ${path}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toParagraphs(value) {
  return String(value || '')
    .split(/\n{2,}|\r?\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part)}</p>`)
    .join('');
}

function getSlug(item) {
  return item.slug || item.number || item.title || '';
}

function normalizeSearch(value) {
  return String(value || '').toLowerCase();
}

function itemMatches(item, query) {
  if (!query) return true;
  return normalizeSearch([
    item.number,
    item.title,
    item.subtitle,
    item.author,
    item.excerpt,
    item.content
  ].join(' ')).includes(query);
}

function testimonyArticle(item) {
  const slug = getSlug(item);
  const image = item.image
    ? `<figure class="blog-figure"><img loading="lazy" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || item.title)}"></figure>`
    : '';
  const source = item.sourceUrl
    ? `<a class="card-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">查看原始來源 →</a>`
    : '';
  return `
    <article class="detail-article" id="${escapeHtml(slug)}" tabindex="-1">
      <a class="detail-back-link" href="#testimonies">返回標題清單</a>
      <h2>${escapeHtml(item.title)}</h2>
      ${item.author ? `<p class="meta">${escapeHtml(item.author)}</p>` : ''}
      ${image}
      <div class="content">${toParagraphs(item.content)}</div>
      ${source}
    </article>
  `;
}

async function renderNewsList() {
  const target = document.getElementById('news-list');
  if (!target) return;
  try {
    const data = await loadJson('data/news.json');
    target.innerHTML = data.items.map(item => `
      <a class="news-item" href="${escapeHtml(item.url)}">
        <span class="date">${escapeHtml(item.date)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.excerpt)}</span>
      </a>
    `).join('');
  } catch (error) {
    target.innerHTML = '<p class="notice-panel">目前無法讀取最新消息，請稍後再試。</p>';
  }
}

async function renderTestimonyBlog() {
  const target = document.getElementById('testimony-blog-list');
  if (!target) return;
  const empty = document.getElementById('testimony-empty');
  const search = document.getElementById('testimony-search');
  try {
    const data = await loadJson('data/testimonies.json');
    const directory = document.getElementById('testimony-directory');
    const detail = document.getElementById('testimony-detail');
    target.innerHTML = data.items.map(item => `
      <li><a href="#${encodeURIComponent(getSlug(item))}">${escapeHtml(item.title)}</a></li>
    `).join('');
    const rows = Array.from(target.children);

    function filterTitles() {
      const query = normalizeSearch(search?.value.trim());
      rows.forEach((row, index) => {
        row.hidden = !itemMatches(data.items[index], query);
      });
      if (empty) empty.hidden = rows.some(row => !row.hidden);
    }

    let selectedIndex = -1;
    function showSelection() {
      const hash = location.hash.slice(1);
      const index = data.items.findIndex(item => encodeURIComponent(getSlug(item)) === hash);
      directory.hidden = index >= 0;
      detail.hidden = index < 0;
      if (index >= 0) {
        detail.innerHTML = testimonyArticle(data.items[index]);
        const article = detail.firstElementChild;
        article.focus({ preventScroll: true });
        article.scrollIntoView({ block: 'start' });
      } else {
        detail.replaceChildren();
        if (selectedIndex >= 0 && !rows[selectedIndex].hidden) {
          rows[selectedIndex].firstElementChild.focus();
        }
      }
      selectedIndex = index;
    }

    filterTitles();
    showSelection();
    search?.addEventListener('input', filterTitles);
    window.addEventListener('hashchange', showSelection);
  } catch (error) {
    target.innerHTML = '<li class="notice-panel">目前無法讀取生命見證資料，請稍後再試。</li>';
  }
}

renderNewsList();
renderTestimonyBlog();
