async function loadJSON(path) {
  const res = await fetch(`${path}?_=${Date.now()}`);
  return res.json();
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderNewsList(items, containerId) {
  const container = document.getElementById(containerId);
  if (!items || !items.length) {
    container.innerHTML = '<p class="empty">Nessuna notizia disponibile al momento.</p>';
    return;
  }
  container.innerHTML = items.map(item => `
    <article class="news-card">
      <span class="source-tag">${item.source}</span>
      <h3><a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a></h3>
      <p>${item.excerpt || ''}</p>
      <time>${formatDate(item.pubDate)}</time>
    </article>
  `).join('');
}

function renderCinema(data) {
  const container = document.getElementById('cinema-list');
  container.innerHTML = `
    <div class="cinema-card">
      <h2>🎬 UCI Cinemas Lissone</h2>
      <p>La programmazione aggiornata (film, orari, prenotazioni) è disponibile direttamente sul sito ufficiale.</p>
      <a href="${data.sourceUrl}" target="_blank" rel="noopener noreferrer" class="cinema-btn">
        Vedi programmazione completa →
      </a>
    </div>
  `;
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
}

async function loadAllData() {
  try {
    const news = await loadJSON('data/news.json');
    renderNewsList(news.finanza, 'finanza-list');
    renderNewsList(news.attualita, 'attualita-list');
    renderNewsList(news.sport, 'sport-list');
    document.getElementById('last-update').textContent = 'Ultimo aggiornamento: ' + formatDate(news.lastUpdated);
  } catch (e) {
    document.getElementById('last-update').textContent = 'Errore caricamento notizie';
  }

  try {
    const cinema = await loadJSON('data/cinema.json');
    renderCinema(cinema);
  } catch (e) {
    document.getElementById('cinema-list').innerHTML = '<p class="empty">Errore caricamento cinema</p>';
  }
}

async function handleRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Aggiornamento...';
  await loadAllData();
  btn.textContent = '✅ Fatto!';
  setTimeout(() => {
    btn.textContent = '🔄 Aggiorna';
    btn.disabled = false;
  }, 1500);
}

function init() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('refresh-btn').addEventListener('click', handleRefresh);
  loadAllData();
}

init();
