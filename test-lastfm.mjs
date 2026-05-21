// Prototype: Listenbrainz quality signal
// Tests listen counts on a real Spotify candidate pool pulled from genre search.
// No API key required.
// Run: node test-lastfm.mjs


// Hardcoded test set covering the spectrum we care about:
// mega-hit, known album cut, mid-tier, obscure-but-real, truly unknown
const candidates = [
  { name: 'Bohemian Rhapsody',       artist: 'Queen',            genre: 'classic rock'  }, // should be huge
  { name: 'Jesus, Etc.',             artist: 'Wilco',            genre: 'indie rock'    }, // well known
  { name: 'Holland, 1945',           artist: 'Neutral Milk Hotel', genre: 'indie folk'  }, // cult
  { name: 'Lua',                     artist: 'Bright Eyes',      genre: 'indie folk'    }, // beloved album cut
  { name: 'The Calculation',         artist: 'Regina Spektor',   genre: 'chamber pop'   }, // deep cut
  { name: 'Minor Swing',             artist: 'Django Reinhardt', genre: 'gypsy jazz'    }, // famous in genre
  { name: 'In The Wee Small Hours Of The Morning', artist: 'Frank Sinatra', genre: 'vocal jazz' },
  { name: 'Nardis',                  artist: 'Bill Evans',       genre: 'cool jazz'     }, // jazz standard
  { name: 'Passing Afternoon',       artist: 'Iron & Wine',      genre: 'indie folk'    }, // deep cut
  { name: 'Sea of Love',             artist: 'Cat Power',        genre: 'indie folk'    }, // cover, known
  { name: 'Naked As We Came',        artist: 'Iron & Wine',      genre: 'indie folk'    }, // album cut
  { name: 'Helplessness Blues',      artist: 'Fleet Foxes',      genre: 'indie folk'    }, // title track
  { name: 'White Winter Hymnal',     artist: 'Fleet Foxes',      genre: 'indie folk'    }, // most known
  { name: 'Ragged Wood',             artist: 'Fleet Foxes',      genre: 'indie folk'    }, // deep cut
];

console.log(`Test set: ${candidates.length} tracks (hardcoded — Spotify API flaky today)`);

const MB_UA = 'UnderSung/1.0 (bobarke@gmail.com)';
const delay = ms => new Promise(r => setTimeout(r, ms));

// Step 1: MusicBrainz recording search → get MBID
async function getMbid(artist, track) {
  const q = encodeURIComponent(`recording:"${track}" AND artist:"${artist}"`);
  const url = `https://musicbrainz.org/ws/2/recording?query=${q}&limit=1&fmt=json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': MB_UA } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.recordings?.[0]?.id || null;
  } catch { return null; }
}

// Step 2: Listenbrainz popularity lookup — no key required
async function lbzListeners(mbid) {
  try {
    const res = await fetch(`https://api.listenbrainz.org/1/popularity/recording/${mbid}`, {
      headers: { 'User-Agent': MB_UA }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.payload;
    if (!p) return null;
    return {
      listeners: p.total_user_count  || 0,
      playcount: p.total_listen_count || 0,
    };
  } catch { return null; }
}

// Sequential with 60ms gap to respect MusicBrainz rate limit (max ~10 req/s)
console.log(`\nLooking up MusicBrainz + Listenbrainz data (sequential, ~60ms gap)...`);
const results = [];
for (const c of candidates) {
  const mbid = await getMbid(c.artist, c.name);
  const lfm  = mbid ? await lbzListeners(mbid) : null;
  console.log(`  ${c.artist} — ${c.name}`);
  console.log(`    mbid: ${mbid ?? 'NOT FOUND'}`);
  console.log(`    lbz:  ${lfm ? JSON.stringify(lfm) : 'NO DATA'}`);
  results.push({ ...c, mbid, lfm });
  await delay(60);
}
console.log();

// --- Score each track and display ---
function sweetSpotScore(listeners) {
  if (!listeners || listeners === 0) return 0;
  // Target band: 2k–150k
  // Soft ramp up from 2k, plateau through 150k, penalize above
  if (listeners < 2000)  return listeners / 2000 * 0.3;         // below floor: weak signal
  if (listeners < 10000) return 0.3 + (listeners - 2000) / 8000 * 0.4; // ramp up
  if (listeners < 150000) return 0.7 + (listeners - 10000) / 140000 * 0.3; // sweet spot
  if (listeners < 500000) return 1.0 - (listeners - 150000) / 350000 * 0.5; // fading
  return Math.max(0, 0.5 - (listeners - 500000) / 500000 * 0.5); // too known
}

const scored = results
  .filter(r => r.lfm !== null)
  .map(r => ({
    ...r,
    sweetSpot: sweetSpotScore(r.lfm.listeners),
    ratio: r.lfm.listeners > 0 ? (r.lfm.playcount / r.lfm.listeners).toFixed(1) : '?',
  }))
  .sort((a, b) => b.sweetSpot - a.sweetSpot);

const noData = results.filter(r => r.lfm === null).length;

console.log(`\n${'lbz users'.padStart(10)}  ${'score'.padStart(5)}  ${'ratio'.padStart(5)}  artist — track  [genre]`);
console.log('─'.repeat(90));

for (const r of scored) {
  const listeners = r.lfm.listeners.toLocaleString().padStart(10);
  const score = r.sweetSpot.toFixed(2).padStart(5);
  const ratio = String(r.ratio).padStart(5);
  const label = `${r.artist} — ${r.name}`.slice(0, 45).padEnd(45);
  console.log(`${listeners}  ${score}  ${ratio}  ${label}  [${r.genre}]`);
}

console.log(`\n${noData} tracks had no Last.fm data (not in their catalog).`);

// Show the distribution
const bands = { 'no data': 0, '<2k': 0, '2k–10k': 0, '10k–150k (sweet spot)': 0, '150k–500k': 0, '>500k (too known)': 0 };
for (const r of results) {
  if (!r.lfm) { bands['no data']++; continue; }
  const l = r.lfm.listeners;
  if (l < 2000)   bands['<2k']++;
  else if (l < 10000)  bands['2k–10k']++;
  else if (l < 150000) bands['10k–150k (sweet spot)']++;
  else if (l < 500000) bands['150k–500k']++;
  else                 bands['>500k (too known)']++;
}
console.log('\nListener distribution:');
for (const [band, count] of Object.entries(bands)) {
  console.log(`  ${band.padEnd(25)} ${count}`);
}
