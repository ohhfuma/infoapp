import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';

const parser = new Parser({ timeout: 10000 });

const FEEDS = {
  finanza: {
    italia: [
      { name: "Il Sole 24 Ore", url: "https://www.ilsole24ore.com/rss/italia.xml" },
      { name: "ANSA Economia", url: "https://www.ansa.it/sito/notizie/economia/economia_rss.xml" },
      { name: "Repubblica Economia", url: "https://www.repubblica.it/rss/economia/rss2.0.xml" },
      { name: "Investing.com Italia", url: "https://it.investing.com/rss/news_25.rss" }
    ],
    europa: [
      { name: "Il Sole 24 Ore Mondo", url: "https://www.ilsole24ore.com/rss/mondo.xml" },
      { name: "Investing.com Eurozona", url: "https://www.investing.com/rss/news_1064.rss" }
    ],
    usa: [
      { name: "Investing.com USA", url: "https://www.investing.com/rss/news_285.rss" }
    ],
    mondo: [
      { name: "ANSA Mondo", url: "https://www.ansa.it/sito/notizie/mondo/mondo_rss.xml" },
      { name: "Repubblica Esteri", url: "https://www.repubblica.it/rss/esteri/rss2.0.xml" },
      { name: "Investing.com Commodities", url: "https://www.investing.com/rss/news_11.rss" }
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

function cleanExcerpt(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
}

function getRomeDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(date);
}

function keyToLabel(dateKey) {
  const d = new Date(dateKey + 'T12:00:00Z');
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

async function fetchCategory(feeds) {
  let items = [];
  for (const feed of feeds) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const feedItems = (parsed.items || []).slice(0, MAX_ITEMS_PER_SOURCE).map(item => ({
        title: item.title,
        link: item.link,
        source: feed.name,
        pubDate: item.pubDate || item.isoDate || null,
        excerpt: cleanExcerpt(item.contentSnippet || item.summary || '')
      }));
      items = items.concat(feedItems);
      console.log(`  ✓ ${feed.name}: ${feedItems.length} notizie`);
    } catch (err) {
      console.error(`  ✗ Errore in ${feed.name} (${feed.url}): ${err.message}`);
    }
  }
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
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
  merged.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
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
  const output = { lastUpdated: new Date().toISOString() };
  const categoriesData = {};

  console.log('\n--- Categoria: finanza (per area) ---');
  const finanzaData = await fetchRegionGroup(FEEDS.finanza);
  output.finanza = finanzaData;
  categoriesData.finanza = finanzaData;

  for (const category of ['attualita', 'sport']) {
    console.log(`\n--- Categoria: ${category} ---`);
    const items = await fetchCategory(FEEDS[category]);
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
