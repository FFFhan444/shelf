let cachedToken = null;

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET env vars');
  }
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
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Spotify token response: ' + JSON.stringify(data));
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

export default async function handler(req, res) {
  const { q, type } = req.query;
  if (!q || !type) {
    return res.status(400).json({ error: 'Missing q or type parameter' });
  }
  if (!['album', 'artist'].includes(type)) {
    return res.status(400).json({ error: 'Type must be album or artist' });
  }

  try {
    const token = await getToken();
    const spotifyRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=${type}&limit=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await spotifyRes.json();
    const results = type === 'artist' ? data.artists?.items : data.albums?.items;
    const item = results?.[0];
    let url = item?.external_urls?.spotify || null;
    // For albums not yet released, use the prerelease URL
    if (url && type === 'album' && item.release_date) {
      const releaseDate = new Date(item.release_date + (item.release_date.length === 10 ? 'T00:00:00' : ''));
      if (releaseDate > new Date()) {
        url = url.replace('/album/', '/prerelease/');
      }
    }
    const images = item?.images || [];
    const imageUrl = images[0]?.url || null;
    res.status(200).json({ url, imageUrl });
  } catch (e) {
    console.error('Spotify search failed:', e);
    res.status(500).json({ error: e.message || 'Spotify search failed' });
  }
}
