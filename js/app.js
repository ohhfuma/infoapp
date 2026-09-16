let currentHistoryDate = null; // null = vista live (oggi)
const historyCache = {};

async function loadJSON(path) {
  const res = await fetch(`${path}?_=${Date.now()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    container.innerHTML = '<p class="empty">Nessuna notizia disponibile.</p>';
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

  const sidebar = document.getElementById('history-sidebar');
  if (tab === 'cinema') {
    sidebar.classList.add('hidden');
  } else {
    sidebar.classList.remove('hidden');
  }
}

async function loadAllData() {
  currentHistoryDate = null;
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

  updateHistoryActiveState();
}

async function loadHistoryIndex() {
  try {
    const idx = await loadJSON('data/history/index.json');
    renderHistorySidebar(idx.dates || []);
  } catch (e) {
    document.getElementById('history-list').innerHTML = '<li class="empty-small">Storico non ancora disponibile</li>';
  }
}

function renderHistorySidebar(dates) {
  const list = document.getElementById('history-list');
  let html = `<li><button class="history-btn" data-date="today">📌 Oggi</button></li>`;
  html += dates
    .filter(d => d.date !== getTodayKeyGuess())
    .map(d => `<li><button class="history-btn" data-date="${d.date}">${d.label}</button></li>`)
    .join('');
  list.innerHTML = html;
  list.querySelectorAll('.history-btn').forEach(btn => {
    btn.addEventListener('click', () => selectHistoryDate(btn.dataset.date));
  });
  updateHistoryActiveState();
}

function getTodayKeyGuess() {
  // Stima approssimativa solo per evitare doppioni nella lista (fuso orario Europe/Rome)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

async function selectHistoryDate(dateKey) {
  if (dateKey === 'today') {
    await loadAllData();
    return;
  }

  currentHistoryDate = dateKey;
  try {
    let data = historyCache[dateKey];
    if (!data) {
      data = await loadJSON(`data/history/${dateKey}.json`);
      historyCache[dateKey] = data;
    }
    renderNewsList(data.finanza, 'finanza-list');
    renderNewsList(data.attualita, 'attualita-list');
    renderNewsList(data.sport, 'sport-list');
    document.getElementById('last-update').textContent = `📅 Notizie del: ${data.label || dateKey}`;
  } catch (e) {
    document.getElementById('last-update').textContent = 'Errore caricamento storico';
  }
  updateHistoryActiveState();
}

function updateHistoryActiveState() {
  document.querySelectorAll('.history-btn').forEach(btn => {
    const isToday = btn.dataset.date === 'today' && currentHistoryDate === null;
    const isMatch = btn.dataset.date === currentHistoryDate;
    btn.classList.toggle('active', isToday || isMatch);
  });
}

async function handleRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Aggiornamento...';
  await loadAllData();
  await loadHistoryIndex();
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
  loadHistoryIndex();
}

init();
