import fs from 'fs';

const UCI_LISSONE_URL = 'https://ucicinemas.it/cinema/uci-cinemas-lissone-milano';

// Il sito UCI blocca le richieste automatiche (protezione anti-bot).
// Soluzione: card statica con link diretto, sempre aggiornata e funzionante.
const output = {
  lastUpdated: new Date().toISOString(),
  cinema: 'UCI Cinemas Lissone',
  sourceUrl: UCI_LISSONE_URL,
  movies: [],
  note: 'static-link'
};

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/cinema.json', JSON.stringify(output, null, 2));
console.log('✅ cinema.json aggiornato (modalità link diretto)');
