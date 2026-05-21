// weekly.js — headless weekly playlist generator
// Runs without a browser using the saved refresh token from .token
// Schedule with: crontab -e → 0 9 * * 1 cd /path/to/undersung && node weekly.js

import fs from 'fs';
import dotenv from 'dotenv';
import SpotifyClient from './spotifyClient.js';
import UnderSungAnalyzer from './analyzer.js';

dotenv.config();

const TOKEN_FILE = './.token';
const TOTAL_TRACKS    = 50;
const ADJ_GENRES      = 6;
const TWO_STEP_GENRES   = 6;
const THREE_STEP_GENRES = 4;
const TWO_STEP_QUOTA  = 5;
const ERA_RANGES      = ['1960-1984', '1985-1999', '2000-2013'];

async function getArtistGenres(artistName) {
  try {
    const query = encodeURIComponent(`artist:"${artistName}"`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist?query=${query}&limit=1&fmt=json`,
      { headers: { 'User-Agent': 'UnderSung/1.0 (bobarke@gmail.com)' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.artists?.[0]?.tags || [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(t => t.name.toLowerCase());
  } catch {
    return [];
  }
}

async function run() {
  if (!fs.existsSync(TOKEN_FILE)) {
    console.error('No saved token found. Log in via the web app at least once first.');
    process.exit(1);
  }

  const { refreshToken } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));

  const spotify = new SpotifyClient(
    process.env.SPOTIFY_CLIENT_ID,
    process.env.SPOTIFY_CLIENT_SECRET,
    process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/callback'
  );
  spotify.refreshToken = refreshToken;

  console.log('Refreshing access token...');
  await spotify.refreshAccessToken();

  // Save updated refresh token in case Spotify rotated it
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({
    refreshToken: spotify.refreshToken,
    savedAt: new Date().toISOString()
  }));

  const analyzer = new UnderSungAnalyzer();
  const timeRanges = ['short_term', 'medium_term', 'long_term'];

  console.log('Fetching listening history...');
  const [artistResults, trackResults, recentlyPlayed] = await Promise.all([
    Promise.all(timeRanges.map(r => spotify.getUserTopArtists(50, 0, r))),
    Promise.all(timeRanges.map(r => spotify.getUserTopTracks(50, 0, r))),
    spotify.getUserRecentlyPlayed(50).catch(() => ({ items: [] })),
  ]);

  const artistsByTimeRange = Object.fromEntries(
    timeRanges.map((r, i) => [r, artistResults[i].items || []])
  );
  const tracksByTimeRange = Object.fromEntries(
    timeRanges.map((r, i) => [r, trackResults[i].items || []])
  );

  const { excludedTrackIds, excludedArtistIds } = analyzer.buildExclusionSets(
    tracksByTimeRange,
    recentlyPlayed.items || [],
    artistsByTimeRange
  );

  console.log('Looking up genres via MusicBrainz...');
  const artistRangeMap = new Map();
  for (const [range, rangeArtists] of Object.entries(artistsByTimeRange)) {
    for (const artist of rangeArtists) {
      if (!artistRangeMap.has(artist.id))
        artistRangeMap.set(artist.id, { name: artist.name, ranges: new Set() });
      artistRangeMap.get(artist.id).ranges.add(range);
    }
  }

  const sortedArtists = [...artistRangeMap.values()]
    .sort((a, b) =>
      (UnderSungAnalyzer.RANGE_WEIGHTS[UnderSungAnalyzer.rangeKey(b.ranges)] ?? 1) -
      (UnderSungAnalyzer.RANGE_WEIGHTS[UnderSungAnalyzer.rangeKey(a.ranges)] ?? 1)
    );
  const lookupArtists = sortedArtists.slice(0, 30);

  const mbTagArrays = await Promise.all(lookupArtists.map(a => getArtistGenres(a.name)));

  const tagCounts = {};
  lookupArtists.forEach(({ ranges }, i) => {
    const weight = UnderSungAnalyzer.RANGE_WEIGHTS[UnderSungAnalyzer.rangeKey(ranges)] ?? 1;
    mbTagArrays[i].forEach(tag => { tagCounts[tag] = (tagCounts[tag] || 0) + weight; });
  });

  let userGenres = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .filter(([g]) => !UnderSungAnalyzer.BROAD_GENRES.has(g))
    .slice(0, 6)
    .map(([g]) => g);

  const coreNeighbors = new Set(
    userGenres.flatMap(g => analyzer.GENRE_ADJACENCY[g] || [])
  );
  const genreSet = new Set(userGenres);
  let bonusCount = 0;
  for (let i = 0; i < lookupArtists.length && bonusCount < 6; i++) {
    if (lookupArtists[i].ranges.size < 2) continue;
    const bonus = mbTagArrays[i].find(
      t => !UnderSungAnalyzer.BROAD_GENRES.has(t) && !genreSet.has(t) &&
           !coreNeighbors.has(t) && analyzer.GENRE_ADJACENCY[t]
    );
    if (bonus) { genreSet.add(bonus); userGenres.push(bonus); bonusCount++; }
  }

  if (userGenres.length === 0) userGenres = ['indie rock', 'indie pop', 'dream pop', 'folk', 'jazz'];
  console.log(`Genres: ${userGenres.join(', ')}`);

  const adjacentGenres  = analyzer.getAdjacentGenres(userGenres, ADJ_GENRES);
  const adjGenreNames   = adjacentGenres.map(g => g.genre);
  const twoStepGenres   = analyzer.getTwoStepGenres(userGenres, adjGenreNames, TWO_STEP_GENRES);
  const threeStepGenres = analyzer.getThreeStepGenres(userGenres, adjGenreNames, twoStepGenres, THREE_STEP_GENRES);

  const HISTORY_FILE = './.history.json';
  const history    = fs.existsSync(HISTORY_FILE)
    ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
    : [];
  const historySet = new Set(history);

  const allGenreTiers = [
    ...userGenres.map(g          => ({ genre: g,   isAdjacent: false, isTwoStep: false, isThreeStep: false })),
    ...adjacentGenres.map(({genre}) => ({ genre,   isAdjacent: true,  isTwoStep: false, isThreeStep: false })),
    ...twoStepGenres.map(g       => ({ genre: g,   isAdjacent: false, isTwoStep: true,  isThreeStep: false })),
    ...threeStepGenres.map(g     => ({ genre: g,   isAdjacent: false, isTwoStep: false, isThreeStep: true  })),
  ];

  console.log(`Querying LBZ for ${allGenreTiers.length} genres (pop 5–40%)...`);
  const lbzResults = await Promise.all(
    allGenreTiers.map(({ genre }) => UnderSungAnalyzer.lbzGenreTracks(genre, 15))
  );

  const mbidToFlags = new Map();
  for (let i = 0; i < allGenreTiers.length; i++) {
    for (const rec of lbzResults[i]) {
      if (!mbidToFlags.has(rec.recording_mbid))
        mbidToFlags.set(rec.recording_mbid, { ...allGenreTiers[i], lbzPercent: rec.percent });
    }
  }

  const allMbids = [...mbidToFlags.keys()];
  console.log(`Resolving metadata for ${allMbids.length} unique recordings...`);
  const metadata = await UnderSungAnalyzer.resolveLbzMetadata(allMbids);

  console.log(`Resolving to Spotify URIs (1s between calls)...`);
  const candidates = [];
  let notFound = 0, filtered = 0;
  for (const [mbid, flags] of mbidToFlags) {
    const meta   = metadata[mbid];
    const artist = meta?.artist?.artists?.[0]?.name;
    const title  = meta?.recording?.name;
    if (!artist || !title) { filtered++; continue; }

    const track = await UnderSungAnalyzer.resolveSpotifyTrack(spotify, artist, title);
    await new Promise(r => setTimeout(r, 1000));

    if (!track)                                                          { notFound++;  continue; }
    if (excludedTrackIds.has(track.id))                                  { filtered++;  continue; }
    if ((track.artists || []).some(a => excludedArtistIds.has(a.id)))   { filtered++;  continue; }

    candidates.push({ track, queryGenre: flags.genre, isAdjacent: flags.isAdjacent,
      isTwoStep: flags.isTwoStep, isThreeStep: flags.isThreeStep, inHistory: historySet.has(track.id) });
  }
  console.log(`${candidates.length} candidates (${notFound} not on Spotify, ${filtered} filtered)`);

  console.log(`Scoring ${candidates.length} candidates...`);
  const topUnderSung = analyzer.scoreCandidates(candidates, TOTAL_TRACKS);

  const updatedHistory = [...new Set([...history, ...topUnderSung.map(t => t.id)])].slice(-500);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const time  = now.toTimeString().slice(0, 5).replace(':', 'h');
  const playlistName = `undersung-${today}-${time}`;

  console.log(`Creating playlist "${playlistName}"...`);
  const playlist = await spotify.createPlaylist({
    name: playlistName,
    description: `Under-sung finds for the week of ${today}. Auto-generated.`,
    public: true
  });

  const trackUris = topUnderSung.map(t => `spotify:track:${t.id}`).filter(Boolean);
  for (let i = 0; i < trackUris.length; i += 100) {
    await spotify.addTracksToPlaylist(playlist.id, trackUris.slice(i, i + 100));
  }

  console.log(`\n✅ Done — "${playlistName}" (${topUnderSung.length} tracks)`);
  console.log(`   ${playlist.external_urls?.spotify}`);

  // Print track list to log
  topUnderSung.forEach((t, i) => {
    const year = t.releaseDate?.split('-')[0] || '????';
    console.log(`   ${String(i+1).padStart(2,'0')} ${t.name} — ${t.artist} (${year})`);
  });
}

run().catch(e => {
  console.error('weekly.js failed:', e.message);
  process.exit(1);
});
