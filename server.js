// Under-sung Server
// Express backend for Spotify analysis and discovery

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import SpotifyClient from './spotifyClient.js';
import UnderSungAnalyzer from './analyzer.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize Spotify client
const spotify = new SpotifyClient(
  process.env.SPOTIFY_CLIENT_ID,
  process.env.SPOTIFY_CLIENT_SECRET,
  process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:3000/callback'
);

const analyzer = new UnderSungAnalyzer();

// Store user sessions (in production, use a proper session store)
const sessions = new Map();

// Look up genre tags for an artist name via MusicBrainz (free, no key required).
// Spotify no longer returns genres from their API, so we source them here.
async function getArtistGenres(artistName) {
  try {
    const query = encodeURIComponent(`artist:"${artistName}"`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/artist?query=${query}&limit=1&fmt=json`,
      { headers: { 'User-Agent': `UnderSung/1.0 (${process.env.CONTACT_EMAIL || 'undersung-user'})` } }
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

// Routes

/**
 * Step 1: Get authorization URL
 */
app.get('/api/auth/login', (req, res) => {
  const authUrl = spotify.getAuthorizationUrl();
  res.json({ authUrl });
});

/**
 * Step 2: Handle OAuth callback
 */
app.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.send(`Error: ${error}`);
  }

  try {
    const tokens = await spotify.exchangeCodeForToken(code);
    const sessionId = Date.now().toString();
    sessions.set(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token
    });

    // Persist refresh token so weekly.js can run without a browser
    if (tokens.refresh_token) {
      fs.writeFileSync('.token', JSON.stringify({
        refreshToken: tokens.refresh_token,
        savedAt: new Date().toISOString()
      }));
    }

    res.redirect(`/?session=${sessionId}`);
  } catch (error) {
    res.send(`Authentication failed: ${error.message}`);
  }
});

/**
 * Step 3: Get user profile (requires session)
 */
app.get('/api/user', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  res.json({ authenticated: true, sessionId: req.query.session });
});

/**
 * Step 4: Analyze user's top artists, extract genre profile, and surface under-sung tracks
 */
app.get('/api/analyze', async (req, res) => {
  // SSE stream — client uses EventSource
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const emit = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  try {
    const session = getSession(req);
    if (!session) { emit('fail', { error: 'Unauthorized' }); return res.end(); }

    setSpotifyToken(spotify, session);

    emit('phase', { step: 1 });

    // Fetch listening history in parallel
    console.log('📊 Fetching listening history...');
    const timeRanges = ['short_term', 'medium_term', 'long_term'];
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

    // Load run history — tracks previously surfaced — downranked rather than excluded
    // so a depleted genre can still surface them rather than returning 0 results.
    const HISTORY_FILE = './.history.json';
    const history    = fs.existsSync(HISTORY_FILE)
      ? JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
      : [];
    const historySet = new Set(history);

    // Build artist map with time-range presence for weighted genre detection.
    // Artists consistent across multiple ranges signal stable taste and get
    // higher weight than artists that only appear in one window.
    const artistRangeMap = new Map();
    for (const [range, rangeArtists] of Object.entries(artistsByTimeRange)) {
      for (const artist of rangeArtists) {
        if (!artistRangeMap.has(artist.id))
          artistRangeMap.set(artist.id, { name: artist.name, ranges: new Set() });
        artistRangeMap.get(artist.id).ranges.add(range);
      }
    }

    // Sort by range weight descending so multi-range artists are looked up first,
    // then take top 30 — enough to catch outlier tastes like jazz that rank low
    // in short-term frequency but appear consistently across time ranges.
    const sortedArtists = [...artistRangeMap.values()]
      .sort((a, b) =>
        (UnderSungAnalyzer.RANGE_WEIGHTS[UnderSungAnalyzer.rangeKey(b.ranges)] ?? 1) -
        (UnderSungAnalyzer.RANGE_WEIGHTS[UnderSungAnalyzer.rangeKey(a.ranges)] ?? 1)
      );
    const lookupArtists = sortedArtists.slice(0, 30);

    emit('phase', { step: 2 });
    console.log('🎸 Looking up genres via MusicBrainz...');
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

    // Bonus genres: for each 2+ range artist, if their top non-broad tag is in
    // the adjacency map but didn't score into the top 6, add it anyway — this
    // surfaces isolated tastes (e.g. gypsy jazz, ambient) that get drowned out
    // by sheer frequency of more common genres.
    // Skip genres already reachable as 1-step neighbors of core genres — they'll
    // be discovered via adjacency expansion without needing a bonus slot.
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

    // Fallback if MusicBrainz returned nothing useful
    if (userGenres.length === 0) {
      userGenres = ['indie rock', 'indie pop', 'dream pop', 'folk', 'jazz'];
    }
    console.log(`🎵 Detected genres: ${userGenres.join(', ')}`);

    // ── tuning constants ────────────────────────────────────────────────────
    const TOTAL_TRACKS      = 50;
    const ADJ_GENRES        = 6;
    const TWO_STEP_GENRES   = 6;
    const THREE_STEP_GENRES = 4;
    // ────────────────────────────────────────────────────────────────────────

    const adjacentGenres   = analyzer.getAdjacentGenres(userGenres, ADJ_GENRES);
    const adjGenreNames    = adjacentGenres.map(g => g.genre);
    const twoStepGenres    = analyzer.getTwoStepGenres(userGenres, adjGenreNames, TWO_STEP_GENRES);
    const threeStepGenres  = analyzer.getThreeStepGenres(userGenres, adjGenreNames, twoStepGenres, THREE_STEP_GENRES);

    const allGenreTiers = [
      ...userGenres.map(g          => ({ genre: g,      isAdjacent: false, isTwoStep: false, isThreeStep: false })),
      ...adjacentGenres.map(({genre}) => ({ genre,      isAdjacent: true,  isTwoStep: false, isThreeStep: false })),
      ...twoStepGenres.map(g       => ({ genre: g,      isAdjacent: false, isTwoStep: true,  isThreeStep: false })),
      ...threeStepGenres.map(g     => ({ genre: g,      isAdjacent: false, isTwoStep: false, isThreeStep: true  })),
    ];

    emit('phase', { step: 3 });
    emit('genres', { core: userGenres, adjacent: adjGenreNames });

    // 1. Fetch LBZ recordings for all genres in parallel — no rate limit
    console.log(`🔍 Querying LBZ for ${allGenreTiers.length} genres (pop 5–40%)...`);
    const lbzResults = await Promise.all(
      allGenreTiers.map(({ genre }) => UnderSungAnalyzer.lbzGenreTracks(genre, 10))
    );
    for (let i = 0; i < allGenreTiers.length; i++) {
      console.log(`  ${allGenreTiers[i].genre}: ${lbzResults[i].length} recordings`);
    }

    // 2. Deduplicate by MBID, keeping the first-seen genre tier flags
    const mbidToFlags = new Map();
    for (let i = 0; i < allGenreTiers.length; i++) {
      for (const rec of lbzResults[i]) {
        if (!mbidToFlags.has(rec.recording_mbid))
          mbidToFlags.set(rec.recording_mbid, { ...allGenreTiers[i], lbzPercent: rec.percent });
      }
    }

    // 3. Batch-resolve MBIDs → artist + title via LBZ metadata
    const allMbids = [...mbidToFlags.keys()];
    console.log(`📋 Resolving metadata for ${allMbids.length} unique recordings...`);
    const metadata = await UnderSungAnalyzer.resolveLbzMetadata(allMbids);
    const metaHits = allMbids.filter(m => metadata[m]?.artist?.artists?.[0]?.name && metadata[m]?.recording?.name).length;
    console.log(`  ${metaHits}/${allMbids.length} have valid artist+title`);

    // Cap candidates before the expensive Spotify loop — 120 is enough headroom
    // for 50 final tracks at ~85% hit rate. Sample proportionally per tier so
    // all radius levels stay represented.
    const CAP          = 120;
    const MIN_PER_TIER = 8;  // floor so small tiers aren't zeroed by rounding
    if (mbidToFlags.size > CAP) {
      const byTier = new Map();
      for (const [mbid, flags] of mbidToFlags) {
        const t = flags.isThreeStep ? 'three' : flags.isTwoStep ? 'two' : flags.isAdjacent ? 'adj' : 'core';
        if (!byTier.has(t)) byTier.set(t, []);
        byTier.get(t).push([mbid, flags]);
      }
      mbidToFlags.clear();
      const tiers   = [...byTier.keys()];
      const perTier = Math.max(MIN_PER_TIER, Math.ceil(CAP / tiers.length));
      for (const t of tiers) {
        const pool = byTier.get(t).sort(() => Math.random() - 0.5).slice(0, perTier);
        for (const [k, v] of pool) mbidToFlags.set(k, v);
      }
      console.log(`  ✂ Capped to ${mbidToFlags.size} candidates (${perTier}/tier across ${tiers.length} tiers)`);
    }

    // 4. Search Spotify for each resolved track — sequential, 1500ms gap
    console.log(`🎵 Resolving to Spotify URIs (1.5s between calls)...`);
    emit('phase', { step: 4, total: mbidToFlags.size });

    const candidates = [];
    let notFound = 0, searchErrors = 0, noMeta = 0, excluded = 0;
    let i = 0;
    for (const [mbid, flags] of mbidToFlags) {
      i++;
      const meta   = metadata[mbid];
      const artist = meta?.artist?.artists?.[0]?.name;
      const title  = meta?.recording?.name;
      if (!artist || !title) { noMeta++; continue; }

      const tier = flags.isThreeStep ? 'three-step' : flags.isTwoStep ? 'two-step' : flags.isAdjacent ? 'adjacent' : 'core';
      const result = await UnderSungAnalyzer.resolveSpotifyTrack(spotify, artist, title);
      await new Promise(r => setTimeout(r, 1500));

      if (result?._searchError) {
        searchErrors++;
        console.log(`  ⚠ Spotify ${result._searchError}: ${artist} — ${title}`);
        continue;
      }
      if (!result)                                                              { notFound++;  emit('track', { artist, title, genre: flags.genre, tier, found: false }); continue; }
      if (excludedTrackIds.has(result.id))                                     { excluded++;  continue; }
      if ((result.artists || []).some(a => excludedArtistIds.has(a.id)))      { excluded++;  continue; }

      candidates.push({ track: result, queryGenre: flags.genre, isAdjacent: flags.isAdjacent,
        isTwoStep: flags.isTwoStep, isThreeStep: flags.isThreeStep, inHistory: historySet.has(result.id) });
      emit('track', { artist: result.artists?.[0]?.name || artist, title: result.name || title, genre: flags.genre, tier, found: true });
      console.log(`  ✓ ${result.artists?.[0]?.name} — ${result.name}  [${flags.genre}  ${flags.lbzPercent?.toFixed(1)}%]`);

      if (i % 25 === 0) {
        console.log(`  [${i}/${mbidToFlags.size}] ✓ ${candidates.length} found  ✗ ${notFound} not on Spotify  ⚠ ${searchErrors} errors  ⊘ ${excluded} excluded`);
      }
    }
    console.log(`📊 ${candidates.length} candidates  (✗ ${notFound} not on Spotify  ⚠ ${searchErrors} Spotify errors  ⊘ ${excluded} excluded  ~ ${noMeta} no metadata)`);
    console.log(`📈 Scoring ${candidates.length} candidates...`);
    const topUnderSung = analyzer.scoreCandidates(candidates, TOTAL_TRACKS);
    const insights = analyzer.generateInsights(userGenres, adjacentGenres.map(g => g.genre), topUnderSung);

    // Persist returned track IDs so they're excluded from future runs
    const updatedHistory = [...new Set([...history, ...topUnderSung.map(t => t.id)])].slice(-500);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(updatedHistory));

    emit('phase', { step: 5 });
    emit('complete', {
      success: true,
      profile: {
        topGenres: userGenres.map(g => ({ genre: g, weight: 1 })),
        adjacentGenres,
        totalArtistsAnalyzed: Object.values(artistsByTimeRange).flat().length,
        totalTracksKnown: excludedTrackIds.size,
      },
      insights,
      topUnderSung,
    });
    res.end();
  } catch (error) {
    console.error('Analysis error:', error.message);
    emit('fail', { error: error.message });
    res.end();
  }
});

/**
 * Step 5: Create playlist from under-sung tracks
 */
app.post('/api/create-playlist', async (req, res) => {
  try {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });

    setSpotifyToken(spotify, session);
    
    const { tracks, playlistName } = req.body;
    if (!tracks || !playlistName) {
      return res.status(400).json({ error: 'Missing tracks or playlistName' });
    }

    const playlist = await spotify.createPlaylist({
      name: playlistName,
      description: 'Under-sung gems discovered by the analysis engine',
      public: true
    });

    const trackUris = tracks.map(t => `spotify:track:${t.id}`).filter(Boolean);
    let tracksAdded = 0;
    for (let i = 0; i < trackUris.length; i += 100) {
      await spotify.addTracksToPlaylist(playlist.id, trackUris.slice(i, i + 100));
      tracksAdded += Math.min(100, trackUris.length - i);
    }

    res.json({
      success: true,
      tracksAdded,
      playlist: {
        id: playlist.id,
        name: playlist.name,
        url: playlist.external_urls?.spotify,
        trackCount: tracksAdded
      }
    });
  } catch (error) {
    console.error('Playlist creation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Helper functions

function getSession(req) {
  const sessionId = req.query.session || req.headers['x-session-id'];
  return sessionId ? sessions.get(sessionId) : null;
}

function setSpotifyToken(spotifyClient, session) {
  spotifyClient.accessToken = session.accessToken;
  spotifyClient.refreshToken = session.refreshToken;
}

// Start server
app.listen(PORT, () => {
  console.log(`🎵 Under-sung server running at http://localhost:${PORT}`);
  console.log(`📝 Make sure you have set these environment variables:`);
  console.log(`   - SPOTIFY_CLIENT_ID`);
  console.log(`   - SPOTIFY_CLIENT_SECRET`);
  console.log(`   - SPOTIFY_REDIRECT_URI (default: http://localhost:3000/callback)`);
});
