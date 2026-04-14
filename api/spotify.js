let cachedToken = null;

// Parse a fetch response as JSON, but tolerate Spotify's occasional non-JSON
// error responses (empty body, or internal Java exception text). Throws a
// clearer error in those cases.
async function safeJson(res, label) {
  const text = await res.text();
  if (!text) throw new Error(`${label} returned empty body (status ${res.status})`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`);
  }
}

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET env vars');
  }
  // Retry once on transient Spotify auth service errors (empty body or Java
  // exception text — both happen occasionally on client-credentials flow).
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(
            SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET
          ).toString('base64'),
        },
        body: 'grant_type=client_credentials',
      });
      const data = await safeJson(res, 'Spotify token');
      if (!data.access_token) {
        throw new Error('Spotify token response missing access_token: ' + JSON.stringify(data));
      }
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      };
      return data.access_token;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise(r => setTimeout(r, 300));
    }
  }
  throw lastErr;
}

// Normalize a string for fuzzy comparison:
// lowercase, strip diacritics, drop common edition suffixes, strip punctuation,
// collapse whitespace.
function normalize(str) {
  if (!str) return '';
  let s = String(str).toLowerCase();
  // Strip diacritics
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Drop parenthesized/bracketed edition/remaster/version tags
  s = s.replace(/\s*[\(\[][^\)\]]*\b(deluxe|expanded|remaster(ed)?|anniversary|edition|version|mono|stereo|bonus|special|reissue|explicit|clean|instrumental)\b[^\)\]]*[\)\]]/gi, '');
  // Drop trailing " - Remastered 2011", " - Single", " - EP", etc.
  s = s.replace(/\s*-\s*(remaster(ed)?( \d{4})?|single|ep|live|mono|stereo|deluxe|expanded).*$/i, '');
  // Replace & with and
  s = s.replace(/&/g, ' and ');
  // Strip remaining punctuation
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function yearOf(releaseDate) {
  if (!releaseDate) return null;
  const m = String(releaseDate).match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

function scoreAlbum(candidate, expected) {
  const { title: expTitle, artist: expArtist, year: expYear } = expected;
  const nExpTitle = normalize(expTitle);
  const nExpArtist = normalize(expArtist);
  const nCandTitle = normalize(candidate.name);
  const candArtists = (candidate.artists || []).map(a => normalize(a.name));

  let score = 0;

  // Title match
  if (nExpTitle) {
    if (nCandTitle === nExpTitle) score += 50;
    else if (nCandTitle.startsWith(nExpTitle) || nExpTitle.startsWith(nCandTitle)) score += 20;
    else if (nCandTitle.includes(nExpTitle) || nExpTitle.includes(nCandTitle)) score += 10;
  }

  // Artist match — check all artists on the album, not just the first
  if (nExpArtist && candArtists.length) {
    const exact = candArtists.some(a => a === nExpArtist);
    const contains = candArtists.some(a => a.includes(nExpArtist) || nExpArtist.includes(a));
    if (exact) score += 30;
    else if (contains) score += 10;
  }

  // Year proximity
  if (expYear != null) {
    const candYear = yearOf(candidate.release_date);
    if (candYear != null) {
      const diff = Math.abs(candYear - expYear);
      if (diff === 0) score += 15;
      else if (diff === 1) score += 8;
      else if (diff === 2) score += 3;
    }
  }

  // Popularity tiebreaker (albums don't always carry popularity, but when they do)
  if (typeof candidate.popularity === 'number') {
    score += candidate.popularity / 20;
  }

  return score;
}

function scoreArtist(candidate, expected) {
  const nExpName = normalize(expected.name);
  const nCandName = normalize(candidate.name);

  let score = 0;
  if (nExpName) {
    if (nCandName === nExpName) score += 50;
    else if (nCandName.includes(nExpName) || nExpName.includes(nCandName)) score += 10;
  }
  if (typeof candidate.popularity === 'number') {
    score += candidate.popularity / 20;
  }
  return score;
}

const MIN_SCORE = 40;

export default async function handler(req, res) {
  // Browser URLSearchParams encodes spaces as "+" per
  // application/x-www-form-urlencoded, but Vercel Functions' req.query parser
  // doesn't decode "+" back to space. Do it here so scoring sees real titles.
  const decodePlus = (v) => (typeof v === 'string' ? v.replace(/\+/g, ' ') : v);
  const q = decodePlus(req.query.q);
  const { type, year } = req.query;
  const title = decodePlus(req.query.title);
  const artist = decodePlus(req.query.artist);


  if (!q || !type) {
    return res.status(400).json({ error: 'Missing q or type parameter' });
  }
  if (!['album', 'artist'].includes(type)) {
    return res.status(400).json({ error: 'Type must be album or artist' });
  }

  try {
    const token = await getToken();
    // Spotify's search endpoint currently caps `limit` at 10 for this flow
    // (their docs still say 50, but the API returns "Invalid limit" above 10).
    // Retry once on transient empty/non-JSON responses from Spotify.
    let data;
    let searchErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const spotifyRes = await fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=10`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        data = await safeJson(spotifyRes, 'Spotify search');
        searchErr = null;
        break;
      } catch (e) {
        searchErr = e;
        if (attempt === 0) await new Promise(r => setTimeout(r, 300));
      }
    }
    if (searchErr) throw searchErr;
    const results = (type === 'artist' ? data.artists?.items : data.albums?.items) || [];

    // Verification fields — if provided, rank candidates; otherwise fall back
    // to the first result (legacy behavior for callers that only need image data).
    const hasVerification = type === 'album'
      ? Boolean(title || artist)
      : Boolean(title || artist);

    let item = null;
    if (hasVerification && results.length) {
      const expected = type === 'album'
        ? {
            title: title || '',
            artist: artist || '',
            year: year ? parseInt(year, 10) : null,
          }
        : {
            name: title || artist || '',
          };
      const scorer = type === 'album' ? scoreAlbum : scoreArtist;
      let best = null;
      let bestScore = -Infinity;
      for (const cand of results) {
        const s = scorer(cand, expected);
        if (s > bestScore) {
          bestScore = s;
          best = cand;
        }
      }
      if (bestScore >= MIN_SCORE) {
        item = best;
      }
      // else: no confident match — return null url
    } else {
      item = results[0] || null;
    }

    let url = item?.external_urls?.spotify || null;
    // For albums not yet released, use the prerelease URL
    if (url && type === 'album' && item?.release_date) {
      const releaseDate = new Date(item.release_date + (item.release_date.length === 10 ? 'T00:00:00' : ''));
      if (releaseDate > new Date()) {
        url = url.replace('/album/', '/prerelease/');
      }
    }
    const images = item?.images || [];
    const imageUrl = images[0]?.url || null;
    const spotifyId = item?.id || null;
    res.status(200).json({ url, imageUrl, spotifyId });
  } catch (e) {
    console.error('Spotify search failed:', e);
    res.status(500).json({ error: e.message || 'Spotify search failed' });
  }
}
