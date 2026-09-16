import Parser from 'rss-parser';
import fs from 'fs';

const parser = new Parser({ timeout: 10000 });

const FEEDS = {
  finanza: [
    { name: "Il Sole 24 Ore", url: "https://www.ilsole24ore.com/rss/italia.xml" },
    { name: "ANSA Economia", url: "https://www.ansa.it/sito/notizie/economia/economia_rss.xml" },
    { name: "Repubblica Economia", url: "https://www.repubblica.it/rss/economia/rss2.0.xml" }
  ],
  attualita: [
    { name: "Corriere della Sera", url: "https://xml2.corriereobjects.it/rss/homepage.xml" },
    { name: "Repubblica", url: "https://www.repubblica.it/rss/homepage/rss2.0.xml" },
    { name: "ANSA", url: "https://www.ansa.it/sito/ansait_rss.xml" }
  ],
  sport: [
    { name: "Gazzetta dello Sport", url: "https://www.gazzetta.it/rss/home.xml" },
    { name: "Repubblica Sport", url: "https://www.repubblica.it/rss/sport/rss2.0.xml" },
    { name: "ANSA Sport", url: "https://www.ansa.it/sito/notizie/sport/sport_rss.xml" }
  ]
};

const MAX_ITEMS_PER_SOURCE = 8;

function cleanExcerpt(text) {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, 220);
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
      console.log(`✓ ${feed.name}: ${feedItems.length} notizie`);
    } catch (err) {
      console.error(`✗ Errore in ${feed.name} (${feed.url}): ${err.message}`);
    }
  }
  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  return items;
}

async function main() {
  const output = { lastUpdated: new Date().toISOString() };
  for (const [category, feeds] of Object.entries(FEEDS)) {
    console.log(`\n--- Categoria: ${category} ---`);
    output[category] = await fetchCategory(feeds);
  }
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/news.json', JSON.stringify(output, null, 2));
  console.log('\n✅ news.json aggiornato');
}

main();
