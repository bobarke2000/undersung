class UnderSungAnalyzer {
  constructor() {
    this.GENRE_ADJACENCY = {
      'indie rock':         ['post-punk revival', 'noise pop', 'slacker rock', 'surf music', 'college rock'],
      'indie pop':          ['chamber pop', 'art pop', 'twee pop', 'jangle pop', 'sophisti-pop'],
      'dream pop':          ['shoegaze', 'nu gaze', 'ethereal wave', 'ambient pop', 'chillwave'],
      'shoegaze':           ['nu gaze', 'blackgaze', 'noise rock', 'post-rock', 'ambient pop'],
      'lo-fi indie':        ['bedroom pop', 'cassette culture', 'slacker rock', 'indie folk'],
      'bedroom pop':        ['home recording', 'lo-fi', 'indie folk', 'dream pop', 'ambient pop'],
      'alternative rock':   ['noise rock', 'grunge', 'college rock', 'post-grunge'],
      'post-punk':          ['cold wave', 'gothic rock', 'death rock', 'minimal wave', 'darkwave'],
      'post-punk revival':  ['garage rock revival', 'art punk', 'new wave', 'post-punk'],
      'noise pop':          ['noise rock', 'shoegaze', 'lo-fi indie', 'art punk'],
      'art rock':           ['avant-garde', 'experimental rock', 'progressive rock', 'krautrock'],
      'post-rock':          ['math rock', 'drone', 'ambient', 'space rock', 'instrumental rock'],
      'math rock':          ['post-rock', 'midwest emo', 'twinkle', 'progressive rock'],
      'emo':                ['midwest emo', 'emo revival', 'post-hardcore', 'screamo'],
      'midwest emo':        ['emo revival', 'math rock', 'twinkle', 'emo'],
      'grunge':             ['alternative rock', 'noise rock', 'indie rock', 'post-grunge'],
      'indie folk':         ['freak folk', 'anti-folk', 'psych folk', 'neo-folk', 'chamber folk'],
      'folk':               ['psych folk', 'acid folk', 'folk baroque', 'traditional folk'],
      'freak folk':         ['psych folk', 'acid folk', 'new weird america', 'experimental folk'],
      'folk rock':          ['electric folk', 'psych folk', 'americana', 'country rock'],
      'americana':          ['alt-country', 'insurgent country', 'roots rock', 'outlaw country'],
      'singer-songwriter':  ['chamber folk', 'baroque pop', 'anti-folk', 'indie folk'],
      'anti-folk':          ['indie folk', 'lo-fi indie', 'freak folk', 'singer-songwriter'],
      'alt-country':        ['americana', 'insurgent country', 'indie folk', 'roots rock'],
      'electronic':         ['glitch', 'idm', 'electroacoustic', 'microsound'],
      'synth-pop':          ['minimal synth', 'darksynth', 'retrowave', 'coldwave'],
      'electropop':         ['synth-pop', 'chillwave', 'future pop', 'nu disco'],
      'indie electronic':   ['chillwave', 'hypnagogic pop', 'lo-fi', 'dream pop'],
      'chillwave':          ['hypnagogic pop', 'lo-fi', 'vaporwave', 'dream pop'],
      'ambient':            ['drone', 'dark ambient', 'lowercase', 'new age'],
      'darkwave':           ['ethereal wave', 'cold wave', 'minimal wave', 'dark electro'],
      'new wave':           ['minimal wave', 'post-punk', 'synth-pop', 'coldwave'],
      'vaporwave':          ['future funk', 'mallsoft', 'lo-fi', 'chillwave'],
      'lo-fi':              ['lo-fi beats', 'chillhop', 'lo-fi indie', 'bedroom pop'],
      'trip hop':           ['downtempo', 'nu jazz', 'alternative hip hop', 'lo-fi'],
      'hip hop':            ['underground hip hop', 'alternative hip hop', 'jazz rap'],
      'alternative hip hop':['art rap', 'abstract hip hop', 'underground hip hop', 'experimental hip hop'],
      'underground hip hop':['boom bap', 'alternative hip hop', 'jazz rap', 'conscious hip hop'],
      'r&b':                ['alternative r&b', 'neo soul', 'quiet storm'],
      'neo soul':           ['alternative r&b', 'acid jazz', 'nu jazz', 'psychedelic soul'],
      'alternative r&b':    ['art pop', 'neo soul', 'future bass', 'experimental r&b'],
      'soul':               ['psychedelic soul', 'funk', 'blue-eyed soul', 'neo soul'],
      'jazz':               ['free jazz', 'avant-garde jazz', 'nu jazz', 'acid jazz'],
      'nu jazz':            ['acid jazz', 'experimental jazz', 'future jazz', 'trip hop'],
      'gypsy jazz':         ['bebop', 'swing', 'hard bop', 'vocal jazz', 'contemporary jazz'],
      'hard bop':           ['bebop', 'cool jazz', 'contemporary post-bop', 'jazz fusion', 'contemporary jazz'],
      'soul jazz':          ['hard bop', 'contemporary post-bop', 'jazz-funk', 'jazz fusion', 'indie jazz'],
      'cool jazz':          ['hard bop', 'bebop', 'contemporary post-bop', 'vocal jazz', 'bossa nova'],
      'bebop':              ['hard bop', 'cool jazz', 'contemporary post-bop', 'gypsy jazz', 'swing'],
      'swing':              ['big band', 'bebop', 'gypsy jazz', 'electro swing', 'vocal jazz'],
      'jazz fusion':        ['jazz-funk', 'electro jazz', 'nu jazz', 'jazztronica', 'indie jazz'],
      'jazz-funk':          ['jazz fusion', 'electro jazz', 'funk', 'nu jazz', 'trip hop'],
      'latin jazz':         ['bossa nova', 'contemporary jazz', 'jazz fusion', 'electro jazz', 'indie jazz'],
      'psychedelic rock':   ['neo-psychedelia', 'acid rock', 'space rock', 'krautrock'],
      'neo-psychedelia':    ['dream pop', 'shoegaze', 'psychedelic pop', 'psych folk'],
      'krautrock':          ['progressive rock', 'experimental rock', 'space rock', 'drone'],
      'garage rock':        ['garage punk', 'lo-fi', 'surf rock', 'fuzz'],
      'punk rock':          ['hardcore punk', 'skate punk', 'anarcho-punk', 'post-punk'],
      'art pop':            ['chamber pop', 'sophisti-pop', 'indie pop', 'baroque pop'],
      'chamber pop':        ['baroque pop', 'art pop', 'singer-songwriter', 'orchestral pop'],
    };
  }

  // 1-step: genres that border your taste but aren't in it.
  getAdjacentGenres(userGenres, limit = 6) {
    const userSet = new Set(userGenres);
    const scores = {};
    for (const genre of userSet) {
      for (const neighbor of (this.GENRE_ADJACENCY[genre] || [])) {
        if (!userSet.has(neighbor)) {
          scores[neighbor] = (scores[neighbor] || 0) + 1;
        }
      }
    }
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([genre, score]) => ({ genre, weight: score / userGenres.length }));
  }

  // Weights for how much genre tags from an artist count based on which
  // time ranges they appear in (S=short ~4wk, M=medium ~6mo, L=long years).
  static get RANGE_WEIGHTS() {
    return { 'SML': 3, 'S·L': 2, '·ML': 2, 'SM·': 1.5, '··L': 1.5, 'S··': 1, '·M·': 1 };
  }

  // Encode a Set of Spotify time-range strings into a 3-char key (e.g. 'S·L').
  static rangeKey(ranges) {
    return ['short_term', 'medium_term', 'long_term']
      .map(r => ranges.has(r) ? r[0].toUpperCase() : '·')
      .join('');
  }

  // Genres too broad to be useful for discovery — they're catch-alls that
  // swamp results without adding taste signal.
  static get BROAD_GENRES() {
    return new Set([
      'alternative rock', 'alternative', 'rock', 'pop', 'indie', 'electronic',
      'metal', 'punk', 'country', 'classical', 'jazz', 'folk', 'r&b', 'soul',
      'hip hop', 'rap', 'dance', 'world', 'soundtrack', 'reggae',
    ]);
  }

  // 2-step: neighbors of neighbors — further from your taste, more surprising.
  // Only returns genres that appear as a neighbor value in the map ≥2 times,
  // which filters out ultra-niche micro-labels that Spotify's genre: search
  // returns nothing for (e.g. "blackgaze", "motorik", "kosmische musik").
  getTwoStepGenres(userGenres, oneStepGenres, limit = 6) {
    // Precompute how often each genre appears as a neighbor across the whole map.
    // High frequency = real, searchable genre. Low frequency = micro-label.
    const neighborFreq = {};
    for (const neighbors of Object.values(this.GENRE_ADJACENCY)) {
      for (const g of neighbors) {
        neighborFreq[g] = (neighborFreq[g] || 0) + 1;
      }
    }
    const MIN_FREQ = 2;

    const allKnown = new Set([...userGenres, ...oneStepGenres]);
    const scores = {};
    for (const genre of oneStepGenres) {
      for (const neighbor of (this.GENRE_ADJACENCY[genre] || [])) {
        if (!allKnown.has(neighbor) && (neighborFreq[neighbor] || 0) >= MIN_FREQ) {
          scores[neighbor] = (scores[neighbor] || 0) + 1;
        }
      }
    }
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([genre]) => genre);
  }

  // 3-step: neighbors of two-step genres. Genuinely far from your established taste.
  getThreeStepGenres(userGenres, oneStepGenres, twoStepGenres, limit = 4) {
    const neighborFreq = {};
    for (const neighbors of Object.values(this.GENRE_ADJACENCY)) {
      for (const g of neighbors) neighborFreq[g] = (neighborFreq[g] || 0) + 1;
    }
    const allKnown = new Set([...userGenres, ...oneStepGenres, ...twoStepGenres]);
    const scores = {};
    for (const genre of twoStepGenres) {
      for (const neighbor of (this.GENRE_ADJACENCY[genre] || [])) {
        if (!allKnown.has(neighbor) && (neighborFreq[neighbor] || 0) >= 2) {
          scores[neighbor] = (scores[neighbor] || 0) + 1;
        }
      }
    }
    return Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([genre]) => genre);
  }

  buildExclusionSets(tracksByTimeRange, recentlyPlayedItems, artistsByTimeRange) {
    const excludedTrackIds = new Set();
    const excludedArtistIds = new Set();

    for (const tracks of Object.values(tracksByTimeRange)) {
      for (const track of tracks) {
        excludedTrackIds.add(track.id);
        (track.artists || []).forEach(a => excludedArtistIds.add(a.id));
      }
    }

    for (const item of recentlyPlayedItems) {
      const track = item.track || item;
      if (track?.id) excludedTrackIds.add(track.id);
    }

    for (const artists of Object.values(artistsByTimeRange)) {
      for (const artist of artists) {
        excludedArtistIds.add(artist.id);
      }
    }

    return { excludedTrackIds, excludedArtistIds };
  }

  scoreTrack(track) {
    const { album_type, total_tracks } = track.album || {};
    if (album_type === 'single' || total_tracks <= 2)          return 0.1;
    if (album_type === 'album'  && total_tracks >= 8)          return 0.8;
    if (album_type === 'album')                                return 0.5;
    if (album_type === 'compilation')                          return 0.35;
    return 0.4;
  }

  // ── LBZ discovery ──────────────────────────────────────────────────────────

  // Query Listenbrainz lb-radio/tags for recordings in a popularity percentile
  // band within a genre. Results are randomised each call — no API key needed.
  static async lbzGenreTracks(genre, count = 10, popBegin = 5, popEnd = 40) {
    const url = `https://api.listenbrainz.org/1/lb-radio/tags` +
      `?tag=${encodeURIComponent(genre)}&mode=easy&count=${count}` +
      `&pop_begin=${popBegin}&pop_end=${popEnd}`;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'UnderSung/1.0 (${process.env.CONTACT_EMAIL || 'undersung-user'})' } });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  // Batch-resolve Listenbrainz recording MBIDs → { mbid: { recording, artist, release } }.
  // Chunked to 50 per request to stay within URL length limits.
  static async resolveLbzMetadata(mbids) {
    if (!mbids.length) return {};
    const UA      = 'UnderSung/1.0 (${process.env.CONTACT_EMAIL || 'undersung-user'})';
    const CHUNK   = 50;
    const result  = {};
    for (let i = 0; i < mbids.length; i += CHUNK) {
      const chunk = mbids.slice(i, i + CHUNK);
      const url   = `https://api.listenbrainz.org/1/metadata/recording/` +
        `?recording_mbids=${chunk.join(',')}&inc=artist+release`;
      try {
        const res  = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) continue;
        Object.assign(result, await res.json());
      } catch { /* skip chunk */ }
    }
    return result;
  }

  // Search Spotify for a playable track by artist + title.
  // Tries progressively looser query formats to handle punctuation and
  // special characters that break exact-match queries.
  static async resolveSpotifyTrack(spotify, artist, title) {
    const clean = s => s.replace(/['"()!?]/g, ' ').replace(/\s+/g, ' ').trim();
    const queries = [
      `track:"${title}" artist:"${artist}"`,
      `track:"${clean(title)}" artist:"${artist}"`,
      `${clean(title)} ${artist}`,
      `${clean(title).split(' ').slice(0, 4).join(' ')} ${artist}`,
    ];
    const firstWord = artist.toLowerCase().split(' ')[0];
    const attempt = async (q) => {
      const r     = await spotify.searchTracks(q, 3, 0);
      const items = r?.tracks?.items || [];
      return items.find(t => t.artists?.some(a => a.name.toLowerCase().includes(firstWord))) || null;
    };
    for (const q of queries) {
      try {
        const match = await attempt(q);
        if (match) return match;
      } catch (e) {
        const status = e?.response?.status;
        if (status === 429) {
          const retryAfter = parseInt(e.response?.headers?.['retry-after'] || '5', 10);
          if (retryAfter > 300) throw new Error(`Spotify rate limit: retry-after ${retryAfter}s (~${Math.ceil(retryAfter / 60)}min). Try again later.`);
          const wait = retryAfter * 1000 + 1000;
          console.log(`  ⏳ Rate limited — waiting ${retryAfter + 1}s`);
          await new Promise(r => setTimeout(r, wait));
          try { const match = await attempt(q); if (match) return match; } catch { /* give up on this format */ }
        } else if (status && status !== 404) {
          return { _searchError: status };
        }
      }
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  }

  // Generate quotas with jitter so the distribution varies run-to-run
  // while always maintaining core > adjacent > two-step > three-step.
  randomQuotas(total = 50) {
    const j = n => n + Math.floor(Math.random() * 9) - 4;  // ±4 jitter
    let three = Math.max(2, Math.min(j(5),  8));
    let two   = Math.max(three + 1, Math.min(j(8),  14));
    let adj   = Math.max(two   + 1, Math.min(j(12), 18));
    let core  = Math.max(adj   + 1, j(25));
    // scale to sum to total
    const sum = core + adj + two + three;
    const s   = total / sum;
    core  = Math.round(core  * s);
    adj   = Math.round(adj   * s);
    two   = Math.round(two   * s);
    three = total - core - adj - two;  // remainder absorbs rounding
    return { core, adj, two, three };
  }

  scoreCandidates(candidates, total = 50) {
    const seen = new Map();
    for (const { track, queryGenre, isAdjacent, isTwoStep, isThreeStep, inHistory } of candidates) {
      const id = track.id;
      if (!id) continue;
      // Previously surfaced tracks are penalised to the bottom of the ranking.
      // They can still appear if a genre is so narrow there's nothing fresher.
      const score = this.scoreTrack(track) * (inHistory ? 0.25 : 1.0);
      if (!seen.has(id) || seen.get(id).score < score) {
        seen.set(id, {
          id,
          name: track.name,
          artist: track.artists?.[0]?.name,
          artistId: track.artists?.[0]?.id,
          album: track.album?.name,
          albumType: track.album?.album_type,
          totalTracks: track.album?.total_tracks,
          trackNumber: track.track_number,
          releaseDate: track.album?.release_date,
          image: track.album?.images?.[0]?.url,
          uri: track.uri,
          previewUrl: track.preview_url,
          queryGenre,
          isAdjacent,
          isTwoStep:   !!isTwoStep,
          isThreeStep: !!isThreeStep,
          inHistory:   !!inHistory,
          score,
        });
      }
    }

    const scored  = Array.from(seen.values()).sort((a, b) => b.score - a.score);
    const quotas  = this.randomQuotas(total);
    return this.selectWithEraDiversity(scored, quotas);
  }

  selectWithEraDiversity(tracks, quotas) {
    const { core: coreQuota, adj: adjQuota, two: twoQuota, three: threeQuota } = quotas;
    const decade = t => {
      const y = parseInt(t.releaseDate?.split('-')[0] || '0');
      return y ? `${Math.floor(y / 10) * 10}s` : 'unknown';
    };

    const pickPool = (pool, quota) => {
      const picks = [], seen = new Set();
      for (const t of pool) {
        if (picks.length >= quota) break;
        if (!seen.has(t.artistId)) { picks.push(t); seen.add(t.artistId); }
      }
      return picks;
    };

    // Split into four distinct pools — each has its own reservation
    const threePool = tracks.filter(t => t.isThreeStep);
    const twoPool   = tracks.filter(t => t.isTwoStep && !t.isThreeStep);
    const adjPool   = tracks.filter(t => t.isAdjacent && !t.isTwoStep && !t.isThreeStep);
    const corePool  = tracks.filter(t => !t.isAdjacent && !t.isTwoStep && !t.isThreeStep);

    const threePicks = pickPool(threePool, threeQuota);
    const twoPicks   = pickPool(twoPool,   twoQuota);
    const adjPicks   = pickPool(adjPool,   adjQuota);

    // Era-diverse selection from core pool
    const buckets = new Map();
    for (const t of corePool) {
      const d = decade(t);
      if (!buckets.has(d)) buckets.set(d, []);
      buckets.get(d).push(t);
    }

    const chosenIds     = new Set();
    const chosenArtists = new Set();
    const corePicks     = [];

    const canAdd = t => !chosenIds.has(t.id) && !chosenArtists.has(t.artistId);
    const add    = t => { corePicks.push(t); chosenIds.add(t.id); chosenArtists.add(t.artistId); };

    // Round 1: one best per decade
    for (const d of [...buckets.keys()].filter(d => d !== 'unknown').sort()) {
      const pick = buckets.get(d).find(canAdd);
      if (pick && corePicks.length < coreQuota) add(pick);
    }
    // Round 2: fill remaining core slots
    for (const t of corePool) {
      if (corePicks.length >= coreQuota) break;
      if (canAdd(t)) add(t);
    }

    // Guarantee at least 1 from each tier that has candidates — swap out
    // the lowest-scored track(s) from the overall selection if needed.
    const all = [...corePicks, ...adjPicks, ...twoPicks, ...threePicks];
    const allIds = new Set(all.map(t => t.id));
    const forced = [];
    for (const [pool, picks] of [[adjPool, adjPicks], [twoPool, twoPicks], [threePool, threePicks]]) {
      if (pool.length > 0 && picks.length === 0) {
        const pick = pool.find(t => !allIds.has(t.id));
        if (pick) { forced.push(pick); allIds.add(pick.id); }
      }
    }
    if (forced.length > 0) {
      all.sort((a, b) => a.score - b.score);
      all.splice(0, forced.length);
      all.push(...forced);
    }

    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }

  generateInsights(userGenres, adjacentGenres, topUnderSung) {
    const insights = [];

    insights.push(`Searched ${userGenres.length} genre${userGenres.length !== 1 ? 's' : ''} + ${adjacentGenres.length} adjacent — ${topUnderSung.length} results found.`);

    if (topUnderSung.length > 0) {
      const albumCuts = topUnderSung.filter(t => t.albumType === 'album').length;
      if (albumCuts > 0) {
        insights.push(`${albumCuts} of ${topUnderSung.length} are album cuts — tracks that were never pushed as singles.`);
      }

      const adjCount       = topUnderSung.filter(t => t.isAdjacent && !t.isTwoStep && !t.isThreeStep).length;
      const twoStepCount   = topUnderSung.filter(t => t.isTwoStep && !t.isThreeStep).length;
      const threeStepCount = topUnderSung.filter(t => t.isThreeStep).length;
      if (adjCount)       insights.push(`${adjCount} tracks from adjacent genres (1 step out).`);
      if (twoStepCount)   insights.push(`${twoStepCount} tracks from 2-step genres.`);
      if (threeStepCount) insights.push(`${threeStepCount} tracks from 3-step genres — furthest from your established taste.`);

      const years = topUnderSung
        .map(t => parseInt(t.releaseDate?.split('-')[0] || '0'))
        .filter(y => y > 1950);
      if (years.length > 0) {
        const earliest = Math.min(...years);
        const latest   = Math.max(...years);
        const decades  = new Set(years.map(y => Math.floor(y / 10) * 10)).size;
        insights.push(`Results span ${earliest}–${latest} across ${decades} decade${decades !== 1 ? 's' : ''}.`);
      }
    }

    return insights;
  }
}

export default UnderSungAnalyzer;
