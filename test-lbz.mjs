// Prototype: LBZ lb-radio/tags as the quality-aware discovery source
// Flow: genre list → LBZ (percentile band) → MBrainz metadata → Spotify search → tracks
// No API key needed for LBZ or MBrainz.
// Run: node test-lbz.mjs

import SpotifyClient from './spotifyClient.js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const { refreshToken } = JSON.parse(fs.readFileSync('.token', 'utf8'));
const spotify = new SpotifyClient(
  process.env.SPOTIFY_CLIENT_ID,
  process.env.SPOTIFY_CLIENT_SECRET,
  process.env.SPOTIFY_REDIRECT_URI
);
spotify.refreshToken = refreshToken;
await spotify.refreshAccessToken();

const MB_UA  = 'UnderSung/1.0 (bobarke@gmail.com)';
const delay  = ms => new Promise(r => setTimeout(r, ms));

const TEST_GENRES = ['indie folk', 'chamber pop', 'neo soul', 'gypsy jazz', 'dream pop'];
const POP_BEGIN   = 5;   // 5th percentile floor  — proves real people listen
const POP_END     = 40;  // 40th percentile ceiling — not a hit

// Step 1: LBZ lb-radio/tags — genre + popularity percentile band
// Returns recording MBIDs with their percentile in that genre. Randomised each call.
async function lbzGenreTracks(genre, count = 10) {
  const tag = encodeURIComponent(genre);
  const url = `https://api.listenbrainz.org/1/lb-radio/tags?tag=${tag}&mode=easy&count=${count}&pop_begin=${POP_BEGIN}&pop_end=${POP_END}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': MB_UA } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// Step 2: MBrainz metadata — batch MBID → artist + title
async function resolveMetadata(mbids) {
  if (!mbids.length) return {};
  const ids = mbids.join(',');
  const url = `https://api.listenbrainz.org/1/metadata/recording/?recording_mbids=${ids}&inc=artist+release`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': MB_UA } });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

// Step 3: Spotify search by artist + title — get URI
// Tries progressively looser queries to handle punctuation, special chars, etc.
async function spotifySearch(artist, title) {
  const clean = s => s.replace(/['"()!?]/g, ' ').replace(/\s+/g, ' ').trim();
  const queries = [
    `track:"${title}" artist:"${artist}"`,          // exact
    `track:"${clean(title)}" artist:"${artist}"`,   // clean title
    `${clean(title)} ${artist}`,                    // plain text
    `${clean(title).split(' ').slice(0, 4).join(' ')} ${artist}`, // first 4 words
  ];
  for (const q of queries) {
    try {
      const r = await spotify.searchTracks(q, 3, 0);
      const items = r?.tracks?.items || [];
      // Verify artist name matches to avoid false positives
      const match = items.find(t =>
        t.artists?.some(a => a.name.toLowerCase().includes(artist.toLowerCase().split(' ')[0]))
      );
      if (match) return match;
    } catch { /* try next query format */ }
  }
  return null;
}

// --- Main ---
console.log(`\nDisovery: LBZ lb-radio/tags  pop_begin=${POP_BEGIN}  pop_end=${POP_END}\n`);

const allCandidates = [];

for (const genre of TEST_GENRES) {
  const lbzTracks = await lbzGenreTracks(genre, 10);
  if (!lbzTracks.length) { console.log(`  ${genre}: no LBZ results`); continue; }

  const mbids    = lbzTracks.map(t => t.recording_mbid);
  const metadata = await resolveMetadata(mbids);

  for (const lbz of lbzTracks) {
    const meta = metadata[lbz.recording_mbid];
    if (!meta) continue;
    const artist = meta.artist?.artists?.[0]?.name;
    const title  = meta.recording?.name;
    const release = meta.release?.name;
    if (!artist || !title) continue;
    allCandidates.push({ genre, artist, title, release, percent: lbz.percent, mbid: lbz.recording_mbid });
  }

  console.log(`  ${genre}: ${lbzTracks.length} from LBZ`);
  await delay(100);
}

console.log(`\nTotal resolved: ${allCandidates.length}  — now searching Spotify...\n`);

const found = [], missing = [];

for (const c of allCandidates) {
  const track = await spotifySearch(c.artist, c.title);
  if (track) {
    found.push({ ...c, spotifyId: track.id, albumType: track.album?.album_type, totalTracks: track.album?.total_tracks });
    process.stdout.write('✓');
  } else {
    missing.push(c);
    process.stdout.write('✗');
  }
  await delay(1000); // slow test — ruling out rate limiting as cause of 502s
}

console.log(`\n\nSpotify found: ${found.length}  not found: ${missing.length}\n`);
console.log(`${'pct'.padStart(5)}  ${'album'.padEnd(12)}  ${'trks'.padStart(4)}  artist — title  [genre]`);
console.log('─'.repeat(85));

for (const t of found.sort((a, b) => a.percent - b.percent)) {
  const pct     = t.percent.toFixed(1).padStart(5);
  const alb     = (t.albumType || '?').padEnd(12);
  const trks    = String(t.totalTracks || '?').padStart(4);
  const label   = `${t.artist} — ${t.title}`.slice(0, 45).padEnd(45);
  console.log(`${pct}  ${alb}  ${trks}  ${label}  [${t.genre}]`);
}

if (missing.length) {
  console.log(`\nNot found (${missing.length}):`);
  for (const m of missing) console.log(`  ${m.artist} — ${m.title}  [${m.genre}]`);
}
