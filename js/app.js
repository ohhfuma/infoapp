let currentHistoryDate = null;
let currentFinanzaRegion = 'italia';
let weatherInitialized = false;
const historyCache = {};

async function loadJSON(path) {
  const res = await fetch(`${path}?_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${path}`);
  return res.json();
}

async function loadJSONWithRetry(path, retries = 2, delayMs = 800) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await loadJSON(path);
    } catch (e) {
      lastError = e;
      console.warn(`Tentativo ${i + 1} fallito per ${path}:`, e.message);
      if (i < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderNewsList(items, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
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

function renderFinanzaRegions(finanzaData) {
  const regions = ['italia', 'europa', 'usa', 'mondo'];
  regions.forEach(region => {
    renderNewsList(finanzaData ? finanzaData[region] : [], `finanza-${region}-list`);
  });
}

function switchFinanzaRegion(region) {
  currentFinanzaRegion = region;
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.region === region);
  });
  document.querySelectorAll('.region-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `finanza-${region}-list`);
  });
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
  if (tab === 'cinema' || tab === 'meteo') {
    sidebar.classList.add('hidden');
  } else {
    sidebar.classList.remove('hidden');
  }

  if (tab === 'meteo' && !weatherInitialized) {
    weatherInitialized = true;
    initWeather();
  }
}

async function loadAllData() {
  currentHistoryDate = null;
  try {
    const news = await loadJSONWithRetry('data/news.json');
    renderFinanzaRegions(news.finanza);
    renderNewsList(news.attualita, 'attualita-list');
    renderNewsList(news.sport, 'sport-list');
    document.getElementById('last-update').textContent = 'Ultimo aggiornamento: ' + formatDate(news.lastUpdated);
  } catch (e) {
    console.error('Errore caricamento news.json:', e);
    document.getElementById('last-update').textContent = 'Errore caricamento notizie (' + e.message + ')';
  }

  try {
    const cinema = await loadJSONWithRetry('data/cinema.json');
    renderCinema(cinema);
  } catch (e) {
    console.error('Errore caricamento cinema.json:', e);
    document.getElementById('cinema-list').innerHTML = '<p class="empty">Errore caricamento cinema</p>';
  }

  updateHistoryActiveState();
}

async function loadHistoryIndex() {
  try {
    const idx = await loadJSONWithRetry('data/history/index.json');
    renderHistorySidebar(idx.dates || []);
  } catch (e) {
    console.error('Errore caricamento history/index.json:', e);
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
      data = await loadJSONWithRetry(`data/history/${dateKey}.json`);
      historyCache[dateKey] = data;
    }
    renderFinanzaRegions(data.finanza);
    renderNewsList(data.attualita, 'attualita-list');
    renderNewsList(data.sport, 'sport-list');
    document.getElementById('last-update').textContent = `📅 Notizie del: ${data.label || dateKey}`;
  } catch (e) {
    console.error('Errore caricamento storico:', e);
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

/* ========== MODULO METEO ========== */

const WEATHER_STORAGE_KEY = 'infoapp_weather_location';
const DEFAULT_LOCATION = { name: 'Lissone', admin1: 'Lombardia', country: 'Italia', latitude: 45.6153, longitude: 9.2373 };

const WEATHER_CODES = {
  0: { icon: '☀️', label: 'Sereno' },
  1: { icon: '🌤️', label: 'Prevalentemente sereno' },
  2: { icon: '⛅', label: 'Parzialmente nuvoloso' },
  3: { icon: '☁️', label: 'Nuvoloso' },
  45: { icon: '🌫️', label: 'Nebbia' },
  48: { icon: '🌫️', label: 'Nebbia con brina' },
  51: { icon: '🌦️', label: 'Pioviggine leggera' },
  53: { icon: '🌦️', label: 'Pioviggine' },
  55: { icon: '🌦️', label: 'Pioviggine intensa' },
  56: { icon: '🌧️', label: 'Pioviggine gelata' },
  57: { icon: '🌧️', label: 'Pioviggine gelata intensa' },
  61: { icon: '🌧️', label: 'Pioggia leggera' },
  63: { icon: '🌧️', label: 'Pioggia' },
  65: { icon: '🌧️', label: 'Pioggia intensa' },
  66: { icon: '🌧️', label: 'Pioggia gelata' },
  67: { icon: '🌧️', label: 'Pioggia gelata intensa' },
  71: { icon: '❄️', label: 'Neve leggera' },
  73: { icon: '❄️', label: 'Neve' },
  75: { icon: '❄️', label: 'Neve intensa' },
  77: { icon: '🌨️', label: 'Granelli di neve' },
  80: { icon: '🌧️', label: 'Rovesci leggeri' },
  81: { icon: '🌧️', label: 'Rovesci' },
  82: { icon: '🌧️', label: 'Rovesci violenti' },
  85: { icon: '🌨️', label: 'Rovesci di neve leggeri' },
  86: { icon: '🌨️', label: 'Rovesci di neve intensi' },
  95: { icon: '⛈️', label: 'Temporale' },
  96: { icon: '⛈️', label: 'Temporale con grandine' },
  99: { icon: '⛈️', label: 'Temporale con grandine intensa' }
};

function getWeatherInfo(code) {
  return WEATHER_CODES[code] || { icon: '🌡️', label: 'N/D' };
}

function getSavedLocation() {
  try {
    const saved = localStorage.getItem(WEATHER_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_LOCATION;
  } catch (e) {
    return DEFAULT_LOCATION;
  }
}

function saveLocation(loc) {
  localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(loc));
}

async function searchLocations(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=it&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results || [];
}

function renderLocationResults(results) {
  const container = document.getElementById('weather-results');
  if (!results.length) {
    container.innerHTML = '<p class="empty-small">Nessuna città trovata.</p>';
    return;
  }
  container.innerHTML = results.map((r, i) => `
    <button class="weather-result-item" data-index="${i}">
      📍 ${r.name}${r.admin1 ? ', ' + r.admin1 : ''} (${r.country || ''})
    </button>
  `).join('');
  container.querySelectorAll('.weather-result-item').forEach((btn, i) => {
    btn.addEventListener('click', () => selectLocation(results[i]));
  });
}

async function selectLocation(loc) {
  saveLocation(loc);
  document.getElementById('weather-results').innerHTML = '';
  document.getElementById('weather-search-input').value = '';
  await loadForecastFor(loc);
}

async function loadForecastFor(loc) {
  const nameLabel = `📍 ${loc.name}${loc.admin1 ? ', ' + loc.admin1 : ''}`;
  document.getElementById('weather-location-name').textContent = nameLabel;
  document.getElementById('weather-forecast').innerHTML = '<p class="empty">Caricamento previsioni...</p>';

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=Europe%2FRome&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderForecast(data.daily);
  } catch (e) {
    console.error('Errore meteo:', e);
    document.getElementById('weather-forecast').innerHTML = '<p class="empty">Errore nel caricamento delle previsioni.</p>';
  }
}

function renderForecast(daily) {
  const container = document.getElementById('weather-forecast');
  if (!daily || !daily.time) {
    container.innerHTML = '<p class="empty">Dati non disponibili.</p>';
    return;
  }
  container.innerHTML = daily.time.map((dateStr, i) => {
    const d = new Date(dateStr + 'T12:00:00');
    const dayLabel = d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const info = getWeatherInfo(daily.weathercode[i]);
    const max = Math.round(daily.temperature_2m_max[i]);
    const min = Math.round(daily.temperature_2m_min[i]);
    const rain = daily.precipitation_sum[i];
    return `
      <div class="weather-day-card">
        <div class="day-label">${dayLabel}</div>
        <div class="day-icon">${info.icon}</div>
        <div class="day-desc">${info.label}</div>
        <div class="day-temps"><span class="max">${max}°</span> / <span class="min">${min}°</span></div>
        ${rain > 0 ? `<div class="day-rain">🌧️ ${rain.toFixed(1)}mm</div>` : ''}
      </div>
    `;
  }).join('');
}

async function handleWeatherSearch() {
  const input = document.getElementById('weather-search-input');
  const query = input.value.trim();
  if (!query) return;
  try {
    const results = await searchLocations(query);
    renderLocationResults(results);
  } catch (e) {
    console.error('Errore ricerca meteo:', e);
    document.getElementById('weather-results').innerHTML = '<p class="empty-small">Errore nella ricerca.</p>';
  }
}

function initWeather() {
  document.getElementById('weather-search-btn').addEventListener('click', handleWeatherSearch);
  document.getElementById('weather-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleWeatherSearch();
  });
  const savedLoc = getSavedLocation();
  loadForecastFor(savedLoc);
}

/* ========== INIZIALIZZAZIONE ========== */

function init() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('.sub-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchFinanzaRegion(btn.dataset.region));
  });
  document.getElementById('refresh-btn').addEventListener('click', handleRefresh);
  loadAllData();
  loadHistoryIndex();
}

init();
