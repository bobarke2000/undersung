# UNDERSUNG — Claude context

## What this is

A Spotify playlist generator that fights popularity bias. Spotify's algorithm loops users in a shrinking circle of already-popular songs. Undersung breaks that loop by:

1. Detecting the user's genre fingerprint via MusicBrainz (Spotify removed genre fields from their API in ~Feb 2026)
2. Weighting genres by how consistently an artist appears across time ranges (SML=3×, 2-range=2×, 1-range=1×)
3. Adding "bonus" genres for multi-range artists whose primary genre is otherwise drowned out by frequency (e.g. gypsy jazz from Django Reinhardt)
4. Walking outward through a genre adjacency graph (1-step → 2-step → 3-step from the user's taste)
5. Querying Listenbrainz `lb-radio/tags` per genre with a popularity percentile band (5–40%) so results are undersung-but-real — not hits, not obscure junk
6. Resolving Listenbrainz recording MBIDs → artist+title via the LBZ metadata API, then searching Spotify for playable URIs
7. Scoring tracks for "undersung-ness" based on album type (single vs. full album)
8. Selecting the final 50 with era diversity + one-artist-per-slot constraints
9. Writing the playlist back to the user's Spotify account

## Key files

| File | Role |
|------|------|
| `server.js` | Express backend — OAuth flow, `/api/analyze`, `/api/create-playlist` |
| `analyzer.js` | Core logic — genre graph, scoring, quota selection, era diversity |
| `spotifyClient.js` | Thin Spotify API wrapper (axios-based, auto-refreshes tokens) |
| `index.html` | Frontend UI — ATLAS v1.04, dark space aesthetic, JetBrains Mono, Three.js |
| `weekly.js` | Headless weekly runner — reads `.token`, creates playlist, logs tracklist |
| `Undersung.standalone.html` | Self-contained single-file bundle for sharing/distribution |
| `~SHIP/index.html` | Release copy of the standalone bundle |
| `.token` | Persisted refresh token (written on first OAuth login, gitignored) |
| `.history.json` | Ring buffer (500 entries) of previously surfaced track IDs — penalized on re-runs |

## Architecture notes

- **No audio features.** Spotify deprecated `GET /audio-features` for new apps. Scoring uses `album_type` and `total_tracks` from search results; quality filtering is handled upstream by Listenbrainz percentile band.
- **Discovery via Listenbrainz.** `UnderSungAnalyzer.lbzGenreTracks()` queries `api.listenbrainz.org/1/lb-radio/tags` with `pop_begin=5&pop_end=40`. No API key required. Results randomise each call. `resolveLbzMetadata()` batch-resolves MBIDs to artist+title (chunks of 50). `resolveSpotifyTrack()` searches Spotify by artist+title with 4 progressively looser query formats.
- **Genre data via MusicBrainz.** `getArtistGenres()` hits `musicbrainz.org/ws/2/artist` with `User-Agent: UnderSung/1.0 (bobarke@gmail.com)`. Rate-limit: sequential with 50ms gaps.
- **Spotify URI resolution** is sequential with a 1000ms gap between calls — fast enough to avoid 502s, slow enough not to trigger rate limits. ~200 candidates ≈ ~3 minutes for the weekly runner (acceptable for a headless job).
- **Sessions are in-memory** (`Map`). Fine for single-user local use; not production-safe.
- **ESM throughout** (`"type": "module"` in package.json). Use `import`/`export`, not `require`.

## The genre graph

`analyzer.js` has a hand-curated `GENRE_ADJACENCY` map (~60 keys). Discovery radius:
- **Core** — user's detected genres (top 6 by weighted frequency from MusicBrainz)
- **Bonus** — primary genre of any 2+ range artist not already in core, not already reachable as a 1-step neighbor, and present in the adjacency map. Cap: 6. This surfaces isolated tastes (jazz, ambient) drowned out by indie rock frequency.
- **Adjacent (1-step)** — direct neighbors in the map
- **Two-step** — neighbors-of-neighbors; filtered to `neighborFreq >= 2` to exclude micro-labels Spotify can't search
- **Three-step** — furthest out; genuinely surprising territory

`BROAD_GENRES` (rock, pop, indie, etc.) are excluded from the user's detected genre set — they're catch-alls that swamp results.

### Genre detection weighting
Artists are weighted by how many Spotify time ranges they appear in:
`SML=3×` · `S·L/·ML=2×` · `SM·/··L=1.5×` · `S··/·M·=1×`

Top 30 artists (sorted by weight) are looked up on MusicBrainz.

### Listenbrainz genre tag notes
- LBZ tags come from MusicBrainz community tagging — same source as `getArtistGenres()`, so the genre names are compatible.
- `lb-radio/tags` uses genre-relative popularity percentiles, so a 30th-percentile track in jazz is different from 30th-percentile indie rock. The band is always within-genre.
- LBZ tagging is broader than MusicBrainz genre search: some tracks appear under unexpected genres (e.g. CHVRCHES under neo soul). The adjacency graph is the taste filter; LBZ handles quality.
- Tracks in the LBZ catalog may not be on Spotify (old recordings, catalog rights, regional availability). Expect ~85% Spotify resolution rate on a good day; request more tracks from LBZ than you need.

## Scoring

```
scoreTrack(track):
  album_type === 'single' or total_tracks <= 2  → 0.1  (was promoted, skip-ish)
  album_type === 'album'  and total_tracks >= 8  → 0.8  (deep cut potential)
  album_type === 'album'  (short)                → 0.5
  album_type === 'compilation'                   → 0.35
  otherwise                                      → 0.4

inHistory penalty: score × 0.25
```

Final 50 are selected with `randomQuotas()` (±4 jitter per tier) and `selectWithEraDiversity()` (one artist per slot, one best per decade first).

## Environment

```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
```

Redirect URI must be registered in the Spotify Developer Dashboard.

## Run

```bash
npm start          # web server at localhost:3000
npm run dev        # same with --watch
npm run weekly     # headless weekly playlist (needs .token)
```

## Important constraints

- Do not train/fine-tune on Spotify data (Spotify ToS).
- Token refresh is automatic in `SpotifyClient.request()` on 401. Infinite-loop guard is not implemented — don't retry on refresh failure.
- The standalone HTML (`Undersung.standalone.html`) is a bundled output. Edit source files, not the bundle.
- Spotify's Feb 2026 API changes removed: bulk `GET /tracks`, `GET /artists/{id}/top-tracks`, `popularity` fields on tracks/artists/albums. `SpotifyClient` still has dead methods `getTracks()` and `getArtistTopTracks()` — do not use them.
