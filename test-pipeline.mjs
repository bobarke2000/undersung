// End-to-end pipeline test with the new rate-limit structure:
//   - LBZ count=10 per genre
//   - Tier-proportional candidate cap at 120
//   - 300ms inter-query gap in resolveSpotifyTrack
//
// Uses hardcoded genre tiers that mirror real user taste so the cap logic
// actually fires. Run: node test-pipeline.mjs

import UnderSungAnalyzer from './analyzer.js';
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

// Mirrors a real genre walk — enough genres to push past the 120 cap
const GENRE_TIERS = [
  // core (user's actual detected genres)
  { genre: 'indie folk',     isAdjacent: false, isTwoStep: false, isThreeStep: false },
  { genre: 'chamber pop',    isAdjacent: false, isTwoStep: false, isThreeStep: false },
  { genre: 'dream pop',      isAdjacent: false, isTwoStep: false, isThreeStep: false },
  { genre: 'gypsy jazz',     isAdjacent: false, isTwoStep: false, isThreeStep: false },
  { genre: 'soul jazz',      isAdjacent: false, isTwoStep: false, isThreeStep: false },
  { genre: 'baroque pop',    isAdjacent: false, isTwoStep: false, isThreeStep: false },
  // adjacent
  { genre: 'folk rock',      isAdjacent: true,  isTwoStep: false, isThreeStep: false },
  { genre: 'twee pop',       isAdjacent: true,  isTwoStep: false, isThreeStep: false },
  { genre: 'lo-fi',          isAdjacent: true,  isTwoStep: false, isThreeStep: false },
  { genre: 'jazz manouche',  isAdjacent: true,  isTwoStep: false, isThreeStep: false },
  { genre: 'hard bop',       isAdjacent: true,  isTwoStep: false, isThreeStep: false },
  { genre: 'post-rock',      isAdjacent: true,  isTwoStep: false, isThreeStep: false },
  // two-step
  { genre: 'americana',      isAdjacent: false, isTwoStep: true,  isThreeStep: false },
  { genre: 'slowcore',       isAdjacent: false, isTwoStep: true,  isThreeStep: false },
  { genre: 'shoegaze',       isAdjacent: false, isTwoStep: true,  isThreeStep: false },
  { genre: 'modal jazz',     isAdjacent: false, isTwoStep: true,  isThreeStep: false },
  { genre: 'free jazz',      isAdjacent: false, isTwoStep: true,  isThreeStep: false },
  // three-step
  { genre: 'ambient',        isAdjacent: false, isTwoStep: false, isThreeStep: true  },
  { genre: 'afrobeat',       isAdjacent: false, isTwoStep: false, isThreeStep: true  },
  { genre: 'tropicalia',     isAdjacent: false, isTwoStep: false, isThreeStep: true  },
];

const tierLabel = f =>
  f.isThreeStep ? 'three-step' : f.isTwoStep ? 'two-step' : f.isAdjacent ? 'adjacent' : 'core';

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Step 1: LBZ ──────────────────────────────────────────────────────────────
console.log(`\n── Step 1: LBZ (count=10, pop 5–40%) ───────────────────────────────────────`);
const lbzResults = await Promise.all(
  GENRE_TIERS.map(({ genre }) => UnderSungAnalyzer.lbzGenreTracks(genre, 10))
);
let totalLbz = 0;
for (let i = 0; i < GENRE_TIERS.length; i++) {
  const count = lbzResults[i].length;
  totalLbz += count;
  console.log(`  [${tierLabel(GENRE_TIERS[i]).padEnd(10)}] ${GENRE_TIERS[i].genre.padEnd(18)} ${count} recordings`);
}
console.log(`  Total: ${totalLbz} recordings across ${GENRE_TIERS.length} genres`);

// ── Step 2: Deduplicate ───────────────────────────────────────────────────────
console.log(`\n── Step 2: Deduplicate by MBID ──────────────────────────────────────────────`);
const mbidToFlags = new Map();
for (let i = 0; i < GENRE_TIERS.length; i++) {
  for (const rec of lbzResults[i]) {
    if (!mbidToFlags.has(rec.recording_mbid))
      mbidToFlags.set(rec.recording_mbid, { ...GENRE_TIERS[i], lbzPercent: rec.percent });
  }
}
console.log(`  ${mbidToFlags.size} unique MBIDs (${totalLbz - mbidToFlags.size} duplicates dropped)`);

// ── Step 3: LBZ metadata ──────────────────────────────────────────────────────
console.log(`\n── Step 3: LBZ metadata (batch, chunks of 50) ───────────────────────────────`);
const allMbids = [...mbidToFlags.keys()];
const metadata = await UnderSungAnalyzer.resolveLbzMetadata(allMbids);
const metaHits = allMbids.filter(
  m => metadata[m]?.artist?.artists?.[0]?.name && metadata[m]?.recording?.name
).length;
console.log(`  ${metaHits}/${allMbids.length} have valid artist+title`);

// ── Step 4: Tier-proportional cap ────────────────────────────────────────────
console.log(`\n── Step 4: Candidate cap (max 120, proportional per tier) ───────────────────`);
const CAP = 120;
const beforeCap = mbidToFlags.size;
if (mbidToFlags.size > CAP) {
  const byTier = new Map();
  for (const [mbid, flags] of mbidToFlags) {
    const t = flags.isThreeStep ? 'three' : flags.isTwoStep ? 'two' : flags.isAdjacent ? 'adj' : 'core';
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push([mbid, flags]);
  }
  mbidToFlags.clear();
  const tiers   = [...byTier.keys()];
  const perTier = Math.ceil(CAP / tiers.length);
  for (const t of tiers) {
    const pool = byTier.get(t).sort(() => Math.random() - 0.5).slice(0, perTier);
    for (const [k, v] of pool) mbidToFlags.set(k, v);
    console.log(`  [${t.padEnd(5)}] kept ${pool.length} of ${byTier.get(t).length + pool.length}`);
  }
  console.log(`  Capped ${beforeCap} → ${mbidToFlags.size} candidates`);
} else {
  console.log(`  ${mbidToFlags.size} candidates — under cap, no trimming needed`);
}

// ── Step 5: Spotify search ────────────────────────────────────────────────────
console.log(`\n── Step 5: Spotify search (1.5s between tracks, 300ms between query formats) ─`);
console.log(`  Searching ${mbidToFlags.size} candidates...\n`);

const found = [], missing = [], errors = [];
let i = 0;

for (const [mbid, flags] of mbidToFlags) {
  i++;
  const meta   = metadata[mbid];
  const artist = meta?.artist?.artists?.[0]?.name;
  const title  = meta?.recording?.name;
  if (!artist || !title) { process.stdout.write('·'); continue; }

  try {
    const track = await UnderSungAnalyzer.resolveSpotifyTrack(spotify, artist, title);
    if (track?._searchError) {
      errors.push({ artist, title, status: track._searchError });
      process.stdout.write('E');
    } else if (track) {
      found.push({
        artist, title,
        tier:       tierLabel(flags),
        genre:      flags.genre,
        percent:    flags.lbzPercent,
        albumType:  track.album?.album_type,
        totalTracks: track.album?.total_tracks,
      });
      process.stdout.write('✓');
    } else {
      missing.push({ artist, title, tier: tierLabel(flags), genre: flags.genre });
      process.stdout.write('✗');
    }
  } catch (e) {
    errors.push({ artist, title, status: e.message });
    process.stdout.write('!');
  }

  await delay(1500);
}

// ── Results ───────────────────────────────────────────────────────────────────
console.log(`\n\n── Results ──────────────────────────────────────────────────────────────────`);
console.log(`  Found: ${found.length}  Missing: ${missing.length}  Errors: ${errors.length}  No meta: ${i - found.length - missing.length - errors.length}`);
console.log(`  Hit rate: ${(found.length / (found.length + missing.length) * 100).toFixed(1)}%\n`);

console.log(`${'tier'.padEnd(10)} ${'pct'.padStart(5)}  ${'album'.padEnd(12)} ${'trks'.padStart(4)}  artist — title`);
console.log('─'.repeat(90));
for (const t of found.sort((a, b) => {
  const order = { core: 0, adjacent: 1, 'two-step': 2, 'three-step': 3 };
  return (order[a.tier] - order[b.tier]) || a.percent - b.percent;
})) {
  const tier  = t.tier.padEnd(10);
  const pct   = t.percent.toFixed(1).padStart(5);
  const alb   = (t.albumType || '?').padEnd(12);
  const trks  = String(t.totalTracks || '?').padStart(4);
  const label = `${t.artist} — ${t.title}`.slice(0, 48);
  console.log(`${tier} ${pct}  ${alb} ${trks}  ${label}  [${t.genre}]`);
}

if (missing.length) {
  console.log(`\nNot found (${missing.length}):`);
  for (const m of missing) console.log(`  [${m.tier}] ${m.artist} — ${m.title}  [${m.genre}]`);
}
if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  for (const e of errors) console.log(`  ${e.status}: ${e.artist} — ${e.title}`);
}
