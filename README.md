# Undersung

A Spotify playlist generator that fights popularity bias. Spotify's algorithm loops you in a shrinking circle of already-popular songs. Undersung breaks that loop by finding real, playable tracks in your genre vicinity that almost nobody has heard.

---

## How it works

1. Reads your Spotify listening history across three time ranges (short, medium, long term)
2. Looks up each of your top 30 artists on MusicBrainz to build a weighted genre fingerprint — artists consistent across multiple time ranges score higher
3. Walks outward through a hand-curated genre adjacency graph: core genres → adjacent → two-step → three-step
4. Queries Listenbrainz `lb-radio/tags` for each genre with a popularity percentile band of 20–50% — real enough that people listen to it, obscure enough that Spotify won't recommend it
5. Resolves Listenbrainz recordings to Spotify tracks via artist+title search
6. Scores tracks by album type (deep cuts score higher than singles) and selects a final 50 with era diversity and one-artist-per-slot constraints
7. Writes the playlist to your Spotify account

Discovery is genre-relative: a 30th-percentile track in jazz is different from 30th-percentile indie rock. The percentile band is always within-genre.

---

## Setup

### 1. Create a Spotify app

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Create an app (any name)
3. In the app settings, add `http://127.0.0.1:3000/callback` as a Redirect URI (`localhost` is not permitted by Spotify's current policy)
4. Copy your Client ID and Client Secret

### 2. Clone and install

```bash
git clone https://github.com/yourusername/undersung.git
cd undersung
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the four values:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
CONTACT_EMAIL=your_email@example.com
```

**SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET** — from your Spotify app dashboard (step 1).

**SPOTIFY_REDIRECT_URI** — must match what you registered in the Spotify dashboard. Spotify's current policy does not permit `localhost` — use the explicit loopback address `http://127.0.0.1:3000/callback`.

**CONTACT_EMAIL** — your email address. MusicBrainz requires a contact address in the API User-Agent for every app that queries their database — see their [rate limiting policy](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting). Without a real address, requests may be blocked. This value never leaves your machine; it only appears in HTTP request headers sent to MusicBrainz.

### 4. Run

```bash
npm start
```

Open [127.0.0.1:3000](http://127.0.0.1:3000), authorize with Spotify, and wait ~3–4 minutes for the analysis to complete. The loading screen shows a live feed of tracks being discovered as they resolve.

---

## Weekly runner

To generate a playlist automatically (e.g. via cron) without opening a browser:

```bash
npm run weekly
```

This requires a `.token` file, which is created automatically the first time you authorize via the web UI. The weekly runner reads the stored refresh token, runs the full analysis headlessly, and logs the tracklist to the console.

Example cron (every Sunday at 8am):
```
0 8 * * 0 cd /path/to/undersung && npm run weekly >> weekly.log 2>&1
```

---

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express backend — OAuth flow, `/api/analyze` (SSE stream), `/api/create-playlist` |
| `analyzer.js` | Core logic — genre graph, LBZ queries, scoring, era diversity selection |
| `spotifyClient.js` | Spotify API wrapper with automatic token refresh |
| `index.html` | Frontend — Three.js star chart, live discovery feed, playlist UI |
| `weekly.js` | Headless weekly runner |
| `.token` | Persisted refresh token — created on first login, gitignored |
| `.history.json` | Ring buffer (500 entries) of previously surfaced track IDs — gitignored |

---

## Notes

**Analysis takes 3–4 minutes.** Most of this is the Spotify search step — 120 candidate tracks resolved sequentially at 1.5s per call to avoid rate limiting. The loading screen shows progress live.

**Spotify rate limits.** If you run the analysis multiple times in quick succession you may hit a temporary rate limit. The app handles short limits automatically (waits and retries); limits over 5 minutes surface as an error message. Wait it out and try again.

**Genre coverage depends on your listening history.** The genre graph has ~60 nodes. If your top artists map to genres not in the graph, discovery radius will be shorter. MusicBrainz community tagging is the source — some artists are tagged sparsely.

**~15% of Listenbrainz candidates won't be on Spotify.** Catalog rights, regional availability, and old recordings all contribute. The pipeline requests more candidates than needed to compensate.

**Sessions are in-memory.** Restarting the server clears sessions. This is intentional for local single-user use — not suitable for a shared/production deployment without adding a session store.

---

## API credits

- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — listening history, track search, playlist creation
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API) — genre tags per artist
- [Listenbrainz](https://listenbrainz.readthedocs.io/en/latest/users/api/index.html) — `lb-radio/tags` endpoint for percentile-band discovery, recording metadata

No API keys required for MusicBrainz or Listenbrainz.

---

## License

MIT
