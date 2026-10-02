import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure']
    ]
  }
});

const FEEDS = {
  finanza: {
    italia: [
      { name: "Il Sole 24 Ore", url: "https://www.ilsole24ore.com/rss/italia.xml" },
      { name: "ANSA Economia", url: "https://www.ansa.it/sito/notizie/economia/economia_rss.xml" },
      { name: "Repubblica Economia", url: "https://www.repubblica.it/rss/economia/rss2.0.xml" },
      { name: "Investing.com Italia", url: "https://it.investing.com/rss/news_25.rss", translate: false }
    ],
    europa: [
      { name: "Il Sole 24 Ore Mondo", url: "https://www.ilsole24ore.com/rss/mondo.xml" },
      { name: "Investing.com Eurozona", url: "https://www.investing.com/rss/news_1064.rss", translate: true }
    ],
    usa: [
      { name: "Investing.com USA", url: "https://www.investing.com/rss/news_285.rss", translate: true }
    ],
    mondo: [
      { name: "ANSA Mondo", url: "https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml" },
      { name: "Repubblica Esteri", url: "https://www.repubblica.it/rss/esteri/rss2.0.xml" },
      { name: "Investing.com Commodities", url: "https://www.investing.com/rss/news_11.rss", translate: true }
    ]
  },
  attualita: [
    { name: "Corriere della Sera", url: "https://xml2.corriereobjects.it/rss/homepage.xml" },
    { name: "Repubblica", url: "https://www.repubblica.it/rss/homepage/rss2.0.xml" },
    { name: "ANSA", url: "https://www.ansa.it/sito/ansait_rss.xml" }
  ],
  sport: [
    { name: "Gazzetta dello Sport", url: "https://www.gazzetta.it/rss/home.xml" },
    { name: "ANSA Sport", url: "https://www.ansa.it/sito/notizie/sport/sport_rss.xml" }
  ]
};

const MAX_ITEMS_PER_SOURCE = 8;
const MAX_ITEMS_PER_DAY = 60;
const HISTORY_DAYS_TO_KEEP = 7;
const HISTORY_DIR = 'data/history';
const TRANSLATE_DELAY_MS = 400;
const MAX_AGE_DAYS = 30;

function cleanExcerpt(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function getValidPubDate(item) {
  const candidates = [item.isoDate, item.pubDate];
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function isTooOld(pubDateIso) {
  const d = new Date(pubDateIso);
  const ageMs = Date.now() - d.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > MAX_AGE_DAYS;
}

// NUOVO: estrae l'URL immagine da varie possibili posizioni nel feed RSS
function getImageUrl(item) {
  try {
    if (item.mediaContent && item.mediaContent.length > 0) {
      const withImage = item.mediaContent.find(m => m.$ && m.$.url);
      if (withImage) return withImage.$.url;
    }
    if (item.mediaThumbnail && item.mediaThumbnail.$ && item.mediaThumbnail.$.url) {
      return item.mediaThumbnail.$.url;
    }
    if (item.enclosure && item.enclosure.url) {
      const type = item.enclosure.type || '';
      if (type.startsWith('image') || !type) return item.enclosure.url;
    }
    // Fallback: cerca un tag <img> dentro il contenuto HTML della descrizione
    const html = item.content || item['content:encoded'] || '';
    const match = html.match(/<img[^>]+src="([^">]+)"/);
    if (match) return match[1];
  } catch (e) {
    // nessuna immagine trovata, va bene così
  }
  return null;
}

function getRomeDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(date);
}

function keyToLabel(dateKey) {
  const d = new Date(dateKey + 'T12:00:00Z');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function translateText(text) {
  if (!text || !text.trim()) return text;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|it`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (translated && !translated.toUpperCase().includes('QUERY LENGTH LIMIT')) {
      return translated;
    }
    return text;
  } catch (err) {
    console.warn(`  ⚠️ Traduzione fallita per "${text.slice(0, 40)}...": ${err.message}`);
    return text;
  }
}

async function translateItems(items) {
  const translated = [];
  for (const item of items) {
    const title = await translateText(item.title);
    await sleep(TRANSLATE_DELAY_MS);
    const excerpt = await translateText(item.excerpt);
    await sleep(TRANSLATE_DELAY_MS);
    translated.push({ ...item, title, excerpt });
  }
  return translated;
}

async function fetchCategory(feeds) {
  let items = [];
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      let feedItems = (parsed.items || []).slice(0, MAX_ITEMS_PER_SOURCE).map(item => ({
        title: item.title,
        link: item.link,
        source: feed.name,
        pubDate: getValidPubDate(item),
        excerpt: cleanExcerpt(item.contentSnippet || item.summary || ''),
        image: getImageUrl(item)
      }));

      const beforeFilter = feedItems.length;
      feedItems = feedItems.filter(i => !isTooOld(i.pubDate));
      const discarded = beforeFilter - feedItems.length;
      if (discarded > 0) {
        console.warn(`  ⚠️ ${feed.name}: scartate ${discarded} notizie più vecchie di ${MAX_AGE_DAYS} giorni`);
      }

      if (feed.translate && feedItems.length > 0) {
        console.log(`  🌍 Traduzione in corso per ${feed.name} (${feedItems.length} notizie)...`);
        feedItems = await translateItems(feedItems);
      }

      items = items.concat(feedItems);
      const withImages = feedItems.filter(i => i.image).length;
      console.log(`  ✓ ${feed.name}: ${feedItems.length} notizie valide (${withImages} con immagine)`);
    } catch (err) {
      console.error(`  ✗ Errore in ${feed.name} (${feed.url}): ${err.message}`);
    }
  }
  items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  return items;
}

async function fetchRegionGroup(regions) {
  const result = {};
  for (const [region, feeds] of Object.entries(regions)) {
    console.log(`  Area: ${region}`);
    result[region] = await fetchCategory(feeds);
  }
  return result;
}

function mergeUnique(existing, fresh, maxItems) {
  const merged = [...existing];
  const seenLinks = new Set(existing.map(i => i.link));
  for (const item of fresh) {
    if (!seenLinks.has(item.link)) {
      merged.push(item);
      seenLinks.add(item.link);
    }
  }
  merged.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  return merged.slice(0, maxItems);
}

function mergeCategoryData(existing, fresh, maxItems) {
  if (Array.isArray(fresh)) {
    return mergeUnique(existing || [], fresh, maxItems);
  }
  const merged = {};
  for (const key of Object.keys(fresh)) {
    merged[key] = mergeUnique((existing && existing[key]) || [], fresh[key], maxItems);
  }
  return merged;
}

function loadTodaySnapshot(todayKey) {
  const todayFile = path.join(HISTORY_DIR, `${todayKey}.json`);
  if (fs.existsSync(todayFile)) {
    try {
      return JSON.parse(fs.readFileSync(todayFile, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function applyFallbackIfEmpty(category, freshValue, snapshot) {
  if (!snapshot || !snapshot[category]) return freshValue;

  if (Array.isArray(freshValue)) {
    if (freshValue.length === 0 && Array.isArray(snapshot[category]) && snapshot[category].length > 0) {
      console.warn(`  🛡️ Categoria "${category}" vuota: ripristinati ${snapshot[category].length} elementi precedenti.`);
      return snapshot[category];
    }
    return freshValue;
  }

  const result = {};
  for (const key of Object.keys(freshValue)) {
    const prevRegionData = snapshot[category][key];
    if (freshValue[key].length === 0 && Array.isArray(prevRegionData) && prevRegionData.length > 0) {
      console.warn(`  🛡️ Area "${category}.${key}" vuota: ripristinati ${prevRegionData.length} elementi precedenti.`);
      result[key] = prevRegionData;
    } else {
      result[key] = freshValue[key];
    }
  }
  return result;
}

function updateTodayHistory(categoriesData, todayKey) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const todayFile = path.join(HISTORY_DIR, `${todayKey}.json`);

  let existing = {};
  if (fs.existsSync(todayFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(todayFile, 'utf-8'));
    } catch (e) {
      console.error('Attenzione: file storico odierno corrotto, verrà ricreato.');
    }
  }

  const merged = { date: todayKey, label: keyToLabel(todayKey) };
  for (const category of Object.keys(categoriesData)) {
    merged[category] = mergeCategoryData(existing[category], categoriesData[category], MAX_ITEMS_PER_DAY);
  }

  fs.writeFileSync(todayFile, JSON.stringify(merged, null, 2));
  console.log(`📁 Storico aggiornato: ${todayFile}`);
}

function cleanupOldHistory() {
  if (!fs.existsSync(HISTORY_DIR)) return;
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort()
    .reverse();

  const toDelete = files.slice(HISTORY_DAYS_TO_KEEP);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(HISTORY_DIR, file));
    console.log(`🗑️ Rimosso storico vecchio: ${file}`);
  }
}

function rebuildIndex() {
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .sort()
    .reverse();

  const dates = files.map(f => {
    const dateKey = f.replace('.json', '');
    return { date: dateKey, label: keyToLabel(dateKey) };
  });

  fs.writeFileSync(path.join(HISTORY_DIR, 'index.json'), JSON.stringify({ dates }, null, 2));
  console.log(`📇 Indice storico aggiornato: ${dates.length} giorni disponibili`);
}

async function main() {
  const todayKey = getRomeDateKey();
  const snapshot = loadTodaySnapshot(todayKey);
  const output = { lastUpdated: new Date().toISOString() };
  const categoriesData = {};

  console.log('\n--- Categoria: finanza (per area) ---');
  let finanzaData = await fetchRegionGroup(FEEDS.finanza);
  finanzaData = applyFallbackIfEmpty('finanza', finanzaData, snapshot);
  output.finanza = finanzaData;
  categoriesData.finanza = finanzaData;

  for (const category of ['attualita', 'sport']) {
    console.log(`\n--- Categoria: ${category} ---`);
    let items = await fetchCategory(FEEDS[category]);
    items = applyFallbackIfEmpty(category, items, snapshot);
    output[category] = items;
    categoriesData[category] = items;
  }

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/news.json', JSON.stringify(output, null, 2));
  console.log('\n✅ news.json aggiornato');

  updateTodayHistory(categoriesData, todayKey);
  cleanupOldHistory();
  rebuildIndex();
}

main();
