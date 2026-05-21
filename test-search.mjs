// Minimal Spotify search test — no LBZ, no cap logic.
// Just verifies resolveSpotifyTrack + pacing against 3 known tracks.
// Run: node test-search.mjs

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
console.log('Token refreshed OK\n');

const TRACKS = [
  { artist: 'Django Reinhardt', title: 'Minor Swing' },
  { artist: 'Yo La Tengo',      title: 'Autumn Sweater' },
  { artist: 'Beirut',           title: 'Nantes' },
];

for (const { artist, title } of TRACKS) {
  const t0 = Date.now();
  try {
    const result = await UnderSungAnalyzer.resolveSpotifyTrack(spotify, artist, title);
    const ms = Date.now() - t0;
    if (result?._searchError) {
      console.log(`✗ [${ms}ms] HTTP ${result._searchError}: ${artist} — ${title}`);
    } else if (result) {
      console.log(`✓ [${ms}ms] ${artist} — ${title}  →  ${result.album?.album_type}, ${result.album?.total_tracks} tracks`);
    } else {
      console.log(`✗ [${ms}ms] not found: ${artist} — ${title}`);
    }
  } catch (e) {
    console.log(`! [${Date.now() - t0}ms] ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1500));
}
