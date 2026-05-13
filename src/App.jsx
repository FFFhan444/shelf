import React, { useState, useEffect, useRef } from 'react';
import { Disc, Plus, Trash2, X, Music4, Check, Circle, User, RefreshCw, Loader2, Star, Radio, ExternalLink, List, LayoutGrid } from 'lucide-react';
import { supabase } from './supabaseClient';

// Map DB row (snake_case) to frontend object (camelCase)
const fromDb = (row) => ({
  id: row.id,
  type: row.type,
  title: row.title,
  artist: row.artist,
  name: row.name,
  disambiguation: row.disambiguation,
  year: row.year,
  mbid: row.mbid,
  coverUrl: row.cover_url,
  sourceUrl: row.source_url,
  spotifyUrl: row.spotify_url,
  releaseDate: row.release_date,
  addedAt: row.added_at,
  listened: row.listened ?? false,
  listenAgain: row.listen_again ?? false,
  order: row.item_order
});

// Map frontend object to DB row
const toDb = (item) => ({
  id: item.id,
  type: item.type,
  title: item.title || null,
  artist: item.artist || null,
  name: item.name || null,
  disambiguation: item.disambiguation || null,
  year: item.year || null,
  mbid: item.mbid || null,
  cover_url: item.coverUrl || null,
  source_url: item.sourceUrl || null,
  spotify_url: item.spotifyUrl || null,
  release_date: item.releaseDate || null,
  added_at: item.addedAt,
  listened: item.listened ?? false,
  listen_again: item.listenAgain ?? false,
  item_order: item.order ?? null
});

// Returns a short label for upcoming releases, or null if already released
const getReleaseBadge = (releaseDate) => {
  if (!releaseDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const release = new Date(releaseDate + (releaseDate.length === 10 ? 'T00:00:00' : ''));
  release.setHours(0, 0, 0, 0);
  if (isNaN(release.getTime())) return null;
  const diffMs = release - today;
  if (diffMs < 0) return null;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 6) return `In ${diffDays} days`;
  if (diffDays <= 13) return 'Next week';
  if (release.getMonth() === today.getMonth() && release.getFullYear() === today.getFullYear()) return 'This month';
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  if (release.getMonth() === nextMonth.getMonth() && release.getFullYear() === nextMonth.getFullYear()) return 'Next month';
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${monthNames[release.getMonth()]} ${release.getFullYear()}`;
};

// Component for the rotating arched text
const RotatingText = ({ text }) => {
  const characters = text.split("");
  const degreeStep = 360 / Math.max(characters.length, 1);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-20"
      style={{ animation: 'spin 12s linear infinite' }}
    >
      <div className="relative w-0 h-0 flex items-center justify-center">
        {characters.map((char, i) => (
          <span
            key={i}
            className="absolute whitespace-nowrap text-[9px] font-black uppercase tracking-[0.2em] text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            style={{
              transform: `rotate(${i * degreeStep}deg) translateY(-65px)`,
              transformOrigin: 'center center'
            }}
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  );
};

// Accent colors for placeholder covers
const COVER_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f97316', // orange
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#ef4444', // red
  '#eab308', // yellow
  '#3b82f6', // blue
  '#d946ef', // fuchsia
];

// Simple hash to pick a consistent color per item
const hashStr = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const PlaceholderCover = ({ item }) => {
  const label = item.type === 'artist' ? item.name : item.title;
  const sublabel = item.type === 'artist' ? (item.disambiguation || '') : (item.artist || '');
  const seed = hashStr(label || sublabel || 'shelf');
  const bg = COVER_COLORS[seed % COVER_COLORS.length];
  // Darken for bottom gradient
  const bgDark = bg + '99';

  // Split label into lines — short words stay together, long words get their own line
  const words = (label || '???').toUpperCase().split(/\s+/);

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: `linear-gradient(160deg, ${bg}, ${bgDark})` }}>
      <svg
        viewBox="0 0 200 200"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main stretched title text */}
        {words.map((word, i) => {
          const total = words.length;
          // Distribute words vertically across the cover
          const yStart = 15;
          const yEnd = 90;
          const y = total === 1 ? 55 : yStart + (i / (total - 1)) * (yEnd - yStart);
          // Vary font size — fewer words = bigger
          const fontSize = total <= 2 ? 60 : total <= 4 ? 42 : 32;
          return (
            <text
              key={i}
              x="100"
              y={y + fontSize * 0.35}
              textAnchor="middle"
              fill="white"
              opacity="0.85"
              fontFamily="'Helvetica Neue', 'Arial Black', sans-serif"
              fontWeight="900"
              fontSize={fontSize}
              letterSpacing="-2"
              textLength="190"
              lengthAdjust="spacingAndGlyphs"
            >
              {word}
            </text>
          );
        })}
        {/* Sublabel at the bottom */}
        {sublabel && (
          <text
            x="100"
            y="195"
            textAnchor="middle"
            fill="white"
            opacity="0.5"
            fontFamily="'Helvetica Neue', Arial, sans-serif"
            fontWeight="400"
            fontStyle="italic"
            fontSize="12"
            letterSpacing="1"
          >
            {sublabel.length > 28 ? sublabel.slice(0, 26) + '…' : sublabel}
          </text>
        )}
      </svg>
    </div>
  );
};

const App = () => {
  const [shelf, setShelf] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  const [fetchingArt, setFetchingArt] = useState(new Set());
  const [searchMode, setSearchMode] = useState('music');

  const [isLoaded, setIsLoaded] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [expandedItem, setExpandedItem] = useState(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [swipeState, setSwipeState] = useState({ id: null, startX: 0, deltaX: 0 });
  const dragTimeoutRef = useRef(null);
  const gridRef = useRef(null);
  const sentinelRef = useRef(null);

  // Load shelf from Supabase on mount
  useEffect(() => {
    const loadItems = async () => {
      try {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .order('item_order', { ascending: true, nullsFirst: false });

        if (error) {
          console.error('Failed to load items:', error);
        } else {
          console.log('Loaded items from Supabase:', data.length);
          setShelf(sortShelf(data.map(fromDb)));
        }
      } catch (e) {
        console.error('Failed to connect to Supabase:', e);
      }
      setIsLoaded(true);
    };
    const dismissSplash = () => {
      const splash = document.getElementById('splash');
      if (splash) {
        splash.classList.add('hide');
        setTimeout(() => splash.remove(), 400);
      }
    };
    loadItems().then(dismissSplash);
    setTimeout(dismissSplash, 2000);
  }, []);

  // Backfill Spotify URLs for items that don't have one
  const hasBackfilled = useRef(false);
  useEffect(() => {
    if (!isLoaded || hasBackfilled.current) return;
    hasBackfilled.current = true;
    const missing = shelf.filter(i => !i.spotifyUrl && i.type !== 'mix');
    missing.forEach((item, idx) => {
      setTimeout(() => fetchSpotifyUrl(item), idx * 200);
    });
  }, [isLoaded]);

  // One-shot rescore: after the ranking fix shipped, re-query Spotify for
  // every existing item with the new scored endpoint. If the new lookup
  // returns a different confident URL, replace the stored one; if it returns
  // null (no confident match), CLEAR the stored URL — a wrong link is worse
  // than no link. New item additions still fall back to a weak match because
  // they go through fetchSpotifyUrl, not this rescore path. Gated by a
  // localStorage flag so it runs once per client.
  const hasRescored = useRef(false);
  useEffect(() => {
    if (!isLoaded || hasRescored.current) return;
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem('spotifyRescoreDone_v2')) return;
    hasRescored.current = true;

    // Skip prerelease links — Spotify's Search API doesn't return prereleases,
    // so the new scored lookup would always return null and we'd clobber a
    // user-confirmed or manually-set prerelease URL.
    const targets = shelf.filter(i =>
      i.spotifyUrl &&
      i.type !== 'mix' &&
      !i.spotifyUrl.includes('/prerelease/')
    );
    if (targets.length === 0) {
      window.localStorage.setItem('spotifyRescoreDone_v2', '1');
      return;
    }

    const rescoreOne = async (item) => {
      try {
        const res = await fetch(buildSpotifyRequest(item));
        const data = await res.json();
        const newUrl = data.url || null;
        if (newUrl === item.spotifyUrl) return; // unchanged
        setShelf(prev => prev.map(i =>
          i.id === item.id ? { ...i, spotifyUrl: newUrl } : i
        ));
        await supabase.from('items').update({ spotify_url: newUrl }).eq('id', item.id);
      } catch (e) {
        console.error('Spotify rescore failed for', item.id, e);
      }
    };

    // Worker pool with concurrency 4 to avoid bursting the Spotify API.
    const queue = [...targets];
    const runWorker = async () => {
      while (queue.length) {
        const next = queue.shift();
        if (next) await rescoreOne(next);
      }
    };
    const workers = Array.from({ length: 4 }, runWorker);
    Promise.all(workers).then(() => {
      window.localStorage.setItem('spotifyRescoreDone_v2', '1');
      console.log('Spotify rescore complete');
    });
  }, [isLoaded]);

  // Auto-retry artwork for items that are missing a cover. Runs once per
  // session so a page refresh always gives orphans another chance, but a
  // single render pass doesn't hammer the APIs.
  const hasRetriedArt = useRef(false);
  useEffect(() => {
    if (!isLoaded || hasRetriedArt.current) return;
    if (shelf.length === 0) return;
    hasRetriedArt.current = true;

    const targets = shelf.filter(i => !i.coverUrl && i.type !== 'mix');
    if (targets.length === 0) return;

    const queue = [...targets];
    const runWorker = async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) continue;
        if (item.type === 'artist') {
          await fetchArtistImage(item.name, item.mbid, item.id);
        } else {
          await fetchAlbumArtwork(item.artist, item.title, item.id);
        }
      }
    };
    Array.from({ length: 3 }, runWorker);
  }, [isLoaded]);

  const sortShelf = (items) => {
    return [...items].sort((a, b) => {
      // Listened items always go to the bottom
      if (a.listened !== b.listened) {
        return a.listened ? 1 : -1;
      }
      // Oldest first — prioritise items waiting longest
      return new Date(a.addedAt) - new Date(b.addedAt);
    });
  };

  // Batch rendering: load more items as user scrolls
  useEffect(() => {
    setVisibleCount(15);
  }, [shelf.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((prev) => prev + 15);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  const handleDragStart = (e, item, index) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDragOffset({ x: offsetX, y: offsetY });
    setDraggedItem({ item, index });
    setMousePosition({ x: e.clientX, y: e.clientY });

    e.dataTransfer.effectAllowed = 'move';
    // Hide default drag image
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const handleDrag = (e) => {
    if (e.clientX === 0 && e.clientY === 0) return; // Ignore the final drag event
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedItem || draggedItem.index === index) {
      return;
    }

    // Throttle the reordering to make it smoother (only update every 100ms)
    if (dragTimeoutRef.current) {
      return;
    }

    dragTimeoutRef.current = setTimeout(() => {
      dragTimeoutRef.current = null;
    }, 100);

    // Live reordering: shuffle items as you drag over them
    const newShelf = [...shelf];
    const [movedItem] = newShelf.splice(draggedItem.index, 1);
    newShelf.splice(index, 0, movedItem);

    // Update the dragged item's index to track current position
    setDraggedItem({ item: draggedItem.item, index });
    setDragOverIndex(index);

    // Don't assign order yet - just reorder the array for visual effect
    setShelf(newShelf);
  };

  const handleDragEnd = async (e) => {
    // Clear any pending timeouts
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }

    // Now assign permanent order based on final positions
    if (shelf.length > 0) {
      const reordered = shelf.map((item, idx) => ({
        ...item,
        order: idx
      }));
      setShelf(reordered);

      // Save order to Supabase
      try {
        const updates = reordered.map(item => ({
          id: item.id,
          item_order: item.order
        }));
        const { error } = await supabase
          .from('items')
          .upsert(updates, { onConflict: 'id', ignoreDuplicates: false });
        if (error) console.error('Failed to save order:', error);
      } catch (e) {
        console.error('Failed to save order:', e);
      }
    }

    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleDragEnd(e);
  };

  // Helper: fetch cover from Spotify via serverless proxy
  const fetchSpotifyCover = async (artist, album) => {
    const lookup = async (q) => {
      const params = new URLSearchParams({
        q,
        type: 'album',
        title: album || '',
        artist: artist || '',
      });
      const res = await fetch(`/api/spotify?${params.toString()}`);
      const data = await res.json();
      return data.imageUrl || null;
    };
    try {
      // Field-filtered query is strictest — best when it hits.
      const filtered = `album:"${album}" artist:"${artist}"`;
      const hit = await lookup(filtered);
      if (hit) return hit;
      // Fallback: plain-text query. Server still scores against title/artist,
      // so a wrong match is rejected by MIN_SCORE rather than returned.
      return await lookup(`${album} ${artist}`);
    } catch (e) {
      console.warn('Spotify cover fetch failed', e);
    }
    return null;
  };

  // Helper: fetch cover from Cover Art Archive
  const fetchCaaCover = async (artist, album) => {
    try {
      const res = await fetch(
        `https://musicbrainz.org/ws/2/release-group/?query=releasegroup:${encodeURIComponent(album)}%20AND%20artist:${encodeURIComponent(artist)}&fmt=json`,
        { headers: { 'User-Agent': 'VinylShelf/1.0.0 (local)' } }
      );
      const data = await res.json();
      const rgId = data['release-groups']?.[0]?.id;
      if (rgId) {
        const caaUrl = `https://coverartarchive.org/release-group/${rgId}/front-500`;
        const head = await fetch(caaUrl, { method: 'HEAD' });
        if (head.ok) return caaUrl;
      }
    } catch (e) {
      console.warn('CAA fetch failed', e);
    }
    return null;
  };

  // Helper: fetch cover from iTunes Search API
  const fetchItunesCover = async (artist, album) => {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + album)}&media=music&entity=album&limit=3`
      );
      const data = await res.json();
      if (data.results?.length) {
        // Try to find best match by comparing names
        const query = (artist + ' ' + album).toLowerCase();
        const best = data.results.find(r =>
          query.includes(r.artistName?.toLowerCase()) || query.includes(r.collectionName?.toLowerCase())
        ) || data.results[0];
        if (best.artworkUrl100) {
          return best.artworkUrl100.replace('100x100', '600x600');
        }
      }
    } catch (e) {
      console.warn('iTunes fetch failed', e);
    }
    return null;
  };

  // Helper: fetch cover from Bandcamp (via CORS proxy)
  const fetchBandcampCover = async (artist, album) => {
    try {
      const query = encodeURIComponent(artist + ' ' + album);
      const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(`https://bandcamp.com/search?q=${query}&item_type=a`)}`;
      const res = await fetch(proxyUrl);
      const html = await res.text();
      const match = html.match(/<img[^>]+class="art"[^>]+src="([^"]+)"/);
      if (match?.[1]) return match[1];
    } catch (e) {
      console.warn('Bandcamp fetch failed (CORS proxy may be down)', e);
    }
    return null;
  };

  // Fetch album artwork with fallback chain: CAA → iTunes → Bandcamp
  const fetchAlbumArtwork = async (artist, album, itemId) => {
    setFetchingArt(prev => new Set(prev).add(itemId));
    try {
      const coverUrl = await fetchSpotifyCover(artist, album)
        || await fetchCaaCover(artist, album)
        || await fetchItunesCover(artist, album)
        || await fetchBandcampCover(artist, album);

      if (coverUrl) {
        const { error } = await supabase
          .from('items')
          .update({ cover_url: coverUrl })
          .eq('id', itemId);
        if (error) console.error('Failed to update cover:', error);

        setShelf(prev => {
          const updated = prev.map(item =>
            item.id === itemId ? { ...item, coverUrl } : item
          );
          return sortShelf(updated);
        });
      }
    } catch (e) {
      console.warn("Album art fetch failed", e);
    } finally {
      setFetchingArt(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Fetch artist image from multiple sources
  const fetchArtistImage = async (artistName, mbid, itemId) => {
    setFetchingArt(prev => new Set(prev).add(itemId));
    try {
      // If no MBID provided, search MusicBrainz first to get one
      let artistMbid = mbid;
      if (!artistMbid) {
        const mbSearchRes = await fetch(
          `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(artistName)}&fmt=json&limit=3`,
          { headers: { 'User-Agent': 'VinylShelf/1.0.0 (local)' } }
        );
        const mbSearchData = await mbSearchRes.json();
        // Try to find exact or close match
        const exactMatch = mbSearchData.artists?.find(a =>
          a.name.toLowerCase() === artistName.toLowerCase()
        );
        artistMbid = exactMatch?.id || mbSearchData.artists?.[0]?.id;
      }

      // Try Spotify first (fast and reliable)
      try {
        const spotifyRes = await fetch(`/api/spotify?q=${encodeURIComponent(`artist:"${artistName}"`)}&type=artist`);
        const spotifyData = await spotifyRes.json();
        if (spotifyData.imageUrl) {
          const { error } = await supabase
            .from('items')
            .update({ cover_url: spotifyData.imageUrl, mbid: artistMbid })
            .eq('id', itemId);
          if (error) console.error('Failed to update artist image:', error);

          setShelf(prev => {
            const updated = prev.map(item =>
              item.id === itemId ? { ...item, coverUrl: spotifyData.imageUrl, mbid: artistMbid || item.mbid } : item
            );
            return sortShelf(updated);
          });
          return;
        }
      } catch (e) {
        console.warn('Spotify artist image failed', e);
      }

      // Try TheAudioDB (has nice press photos)
      const audioDbRes = await fetch(
        `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artistName)}`
      );
      const audioDbData = await audioDbRes.json();
      const artist = audioDbData.artists?.[0];

      if (artist) {
        // Prefer artistthumb, then artistfanart, then artistwide
        const imageUrl = artist.strArtistThumb || artist.strArtistFanart || artist.strArtistWideThumb;
        if (imageUrl) {
          // Update in Supabase
          const { error } = await supabase
            .from('items')
            .update({ cover_url: imageUrl, mbid: artistMbid })
            .eq('id', itemId);
          if (error) console.error('Failed to update artist image:', error);

          setShelf(prev => {
            const updated = prev.map(item =>
              item.id === itemId ? { ...item, coverUrl: imageUrl, mbid: artistMbid || item.mbid } : item
            );
            return sortShelf(updated);
          });
          return;
        }
      }

      // Fallback: Try to get image from MusicBrainz -> Wikidata -> Wikimedia Commons
      if (artistMbid) {
        const mbRes = await fetch(
          `https://musicbrainz.org/ws/2/artist/${artistMbid}?inc=url-rels&fmt=json`,
          { headers: { 'User-Agent': 'VinylShelf/1.0.0 (local)' } }
        );
        const mbData = await mbRes.json();

        // Find wikidata relation
        const wikidataRel = mbData.relations?.find(r => r.type === 'wikidata');
        if (wikidataRel) {
          const wikidataId = wikidataRel.url?.resource?.split('/').pop();
          if (wikidataId) {
            // Fetch image from Wikidata
            const wdRes = await fetch(
              `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`
            );
            const wdData = await wdRes.json();
            const entity = wdData.entities?.[wikidataId];
            const imageFileName = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;

            if (imageFileName) {
              // Convert to Wikimedia Commons URL
              const encodedFileName = encodeURIComponent(imageFileName.replace(/ /g, '_'));
              const md5 = await computeMD5Hash(imageFileName.replace(/ /g, '_'));
              const imageUrl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0,2)}/${encodedFileName}/500px-${encodedFileName}`;

              // Verify the image exists
              const imgCheck = await fetch(imageUrl, { method: 'HEAD' });
              if (imgCheck.ok) {
                // Update in Supabase
                const { error } = await supabase
                  .from('items')
                  .update({ cover_url: imageUrl, mbid: artistMbid })
                  .eq('id', itemId);
                if (error) console.error('Failed to update artist image:', error);

                setShelf(prev => {
                  const updated = prev.map(item =>
                    item.id === itemId ? { ...item, coverUrl: imageUrl, mbid: artistMbid } : item
                  );
                  return sortShelf(updated);
                });
                return;
              }
            }
          }
        }
      }

      // If still no image, update with the MBID we found at least
      if (artistMbid && artistMbid !== mbid) {
        const { error } = await supabase
          .from('items')
          .update({ mbid: artistMbid })
          .eq('id', itemId);
        if (error) console.error('Failed to update mbid:', error);

        setShelf(prev => {
          const updated = prev.map(item =>
            item.id === itemId ? { ...item, mbid: artistMbid } : item
          );
          return sortShelf(updated);
        });
      }
    } catch (e) {
      console.warn("Artist image fetch failed", e);
    } finally {
      setFetchingArt(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // Simple hash function for Wikimedia URLs
  const computeMD5Hash = async (str) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('MD5', data).catch(() => null);

    if (!hashBuffer) {
      // Fallback: simple hash simulation for MD5-like path generation
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const hex = Math.abs(hash).toString(16).padStart(2, '0');
      return hex;
    }

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Search MusicBrainz for albums and artists
  const handleSearch = async (val) => {
    setManualInput(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    // Don't search if multiple lines or too short
    if (val.includes('\n') || val.length < 2) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Search both albums and artists in parallel
        const [albumRes, artistRes] = await Promise.all([
          fetch(
            `https://musicbrainz.org/ws/2/release-group/?query=${encodeURIComponent(val)}&fmt=json&limit=4`,
            { headers: { 'User-Agent': 'VinylShelf/1.0.0 (local)' } }
          ),
          fetch(
            `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(val)}&fmt=json&limit=4`,
            { headers: { 'User-Agent': 'VinylShelf/1.0.0 (local)' } }
          )
        ]);

        const albumData = await albumRes.json();
        const artistData = await artistRes.json();

        const albums = albumData['release-groups']?.map(rg => ({
          type: 'album',
          title: rg.title,
          artist: rg['artist-credit']?.[0]?.name || 'Unknown Artist',
          year: rg['first-release-date']?.split('-')[0] || '',
          releaseDate: rg['first-release-date'] || null,
          mbid: rg.id
        })) || [];

        const artists = artistData.artists?.map(artist => ({
          type: 'artist',
          name: artist.name,
          disambiguation: artist.disambiguation || '',
          country: artist.country || '',
          mbid: artist.id
        })) || [];

        // Interleave results - albums first, then artists
        setSearchResults([...albums, ...artists]);
      } catch (e) {
        console.error('Search failed:', e);
        setSearchResults([]);
      }
      setIsSearching(false);
    }, 300);
  };

  // Spotify integration — calls serverless proxy to keep secret server-side.
  // Builds an advanced search query and also forwards the raw fields so the
  // proxy can rank and verify candidates (see api/spotify.js).
  const buildSpotifyRequest = (item) => {
    const type = item.type === 'artist' ? 'artist' : 'album';
    // Spotify's advanced search breaks silently on unmatched quotes — strip them.
    const safe = (s) => (s || '').replace(/"/g, ' ').trim();
    const title = safe(item.title);
    const artist = safe(item.artist);
    const name = safe(item.name);
    const yearMatch = String(item.year || item.releaseDate || '').match(/\d{4}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

    let query;
    if (type === 'artist') {
      query = `artist:"${name}"`;
    } else {
      query = `album:"${title}" artist:"${artist}"`;
      if (year) query += ` year:${year}`;
    }

    const params = new URLSearchParams({ q: query, type });
    if (type === 'album') {
      if (title) params.set('title', title);
      if (artist) params.set('artist', artist);
      if (year) params.set('year', String(year));
    } else {
      if (name) params.set('title', name);
    }
    return `/api/spotify?${params.toString()}`;
  };

  const fetchSpotifyUrl = async (item) => {
    try {
      const res = await fetch(buildSpotifyRequest(item));
      const data = await res.json();
      if (!data.url) return;
      setShelf(prev => prev.map(i =>
        i.id === item.id ? { ...i, spotifyUrl: data.url } : i
      ));
      await supabase.from('items').update({ spotify_url: data.url }).eq('id', item.id);
    } catch (e) {
      console.error('Spotify lookup failed:', e);
    }
  };

  const addAlbum = async (album) => {
    const newItem = {
      id: crypto.randomUUID(),
      type: 'album',
      title: album.title,
      artist: album.artist,
      year: album.year,
      releaseDate: album.releaseDate,
      mbid: album.mbid,
      coverUrl: null,
      addedAt: new Date().toISOString(),
      listened: false
    };

    // Save to Supabase
    try {
      const { error } = await supabase
        .from('items')
        .insert(toDb(newItem));
      if (error) console.error('Failed to save album:', error);
    } catch (e) {
      console.error('Failed to save album:', e);
    }

    setShelf(prev => sortShelf([...prev, newItem]));
    fetchAlbumArtwork(album.artist, album.title, newItem.id);
    fetchSpotifyUrl(newItem);
  };

  const addArtist = async (artist) => {
    const newItem = {
      id: crypto.randomUUID(),
      type: 'artist',
      name: artist.name,
      disambiguation: artist.disambiguation,
      mbid: artist.mbid,
      coverUrl: null,
      addedAt: new Date().toISOString(),
      listened: false
    };

    try {
      const { error } = await supabase
        .from('items')
        .insert(toDb(newItem));
      if (error) console.error('Failed to save artist:', error);
    } catch (e) {
      console.error('Failed to save artist:', e);
    }

    setShelf(prev => sortShelf([...prev, newItem]));
    fetchArtistImage(artist.name, artist.mbid, newItem.id);
    fetchSpotifyUrl(newItem);
  };

  const addManualEntry = async () => {
    if (!manualInput.trim()) {
      return;
    }

    // Check if input contains multiple lines (bulk import)
    const lines = manualInput.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 1) {
      // Bulk import
      await bulkImportAlbums(lines);
      return;
    }

    // Single entry - close immediately and import
    closeSearch();
    await importSingleAlbum(manualInput);
  };

  const importSingleAlbum = async (input) => {
    // Parse input - expect format like "Artist - Album" or just "Artist Name"
    const parts = input.split('-').map(p => p.trim());

    // If no dash, treat as artist name
    if (parts.length === 1) {
      const artistName = input.trim();
      // Add as artist, not album
      const newItem = {
        id: crypto.randomUUID(),
        type: 'artist',
        name: artistName,
        disambiguation: '',
        mbid: null,
        coverUrl: null,
        addedAt: new Date().toISOString(),
        listened: false
      };

      // Save to Supabase
      try {
        const { error } = await supabase
          .from('items')
          .insert(toDb(newItem));
        if (error) console.error('Failed to save artist:', error);
      } catch (e) {
        console.error('Failed to save artist:', e);
      }

      setShelf(prev => sortShelf([...prev, newItem]));

      // Try to fetch artist image
      fetchArtistImage(artistName, null, newItem.id);
      fetchSpotifyUrl(newItem);
      return;
    }

    // Has dash, treat as "Artist - Album"
    let artist = parts[0];
    let title = parts.slice(1).join(' - ');

    // Try to search MusicBrainz first to get proper metadata
    try {
      const response = await fetch(
        `https://musicbrainz.org/ws/2/release-group/?query=releasegroup:${encodeURIComponent(title)}%20AND%20artist:${encodeURIComponent(artist)}&fmt=json&limit=1`,
        { headers: { 'User-Agent': 'VinylShelf/1.0.0 (local)' } }
      );
      const data = await response.json();
      const rg = data['release-groups']?.[0];

      if (rg) {
        // Found in MusicBrainz, add with full metadata
        const album = {
          title: rg.title,
          artist: rg['artist-credit']?.[0]?.name || artist,
          year: rg['first-release-date']?.split('-')[0] || 'TBA',
          releaseDate: rg['first-release-date'] || null,
          mbid: rg.id
        };
        addAlbum(album);
        return;
      }
    } catch (e) {
      console.warn('MusicBrainz search failed, adding as manual entry', e);
    }

    // Not found in MusicBrainz, add as manual entry
    const newItem = {
      id: crypto.randomUUID(),
      type: 'album',
      title: title,
      artist: artist,
      year: 'TBA',
      mbid: null,
      coverUrl: null,
      addedAt: new Date().toISOString(),
      listened: false
    };

    // Save to Supabase
    try {
      const { error } = await supabase
        .from('items')
        .insert(toDb(newItem));
      if (error) console.error('Failed to save album:', error);
    } catch (e) {
      console.error('Failed to save album:', e);
    }

    setShelf(prev => sortShelf([...prev, newItem]));

    // Try to fetch artwork
    fetchAlbumArtwork(artist, title, newItem.id);
    fetchSpotifyUrl(newItem);
  };

  const bulkImportAlbums = async (lines) => {
    let imported = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      await importSingleAlbum(line);
      imported++;
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    closeSearch();
    alert(`Successfully imported ${imported} album(s)!`);
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setManualInput('');
    setSearchResults([]);
    setSearchMode('music');
  };

  const selectSearchResult = (result) => {
    closeSearch();
    if (result.type === 'album') {
      addAlbum(result);
    } else if (result.type === 'mix') {
      addMix(result);
    } else {
      addArtist(result);
    }
  };

  // SoundCloud: detect URL and fetch via oEmbed
  const fetchSoundCloudOembed = async (url) => {
    try {
      const res = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        type: 'mix',
        title: data.title || 'Untitled Mix',
        artist: data.author_name || 'Unknown',
        coverUrl: data.thumbnail_url || null,
        sourceUrl: url,
      };
    } catch (e) {
      console.warn('SoundCloud oEmbed failed', e);
      return null;
    }
  };

  // SoundCloud search
  const handleSoundCloudSearch = async (val) => {
    setManualInput(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (val.length < 2) { setSearchResults([]); return; }

    // If it's a SoundCloud URL, fetch via oEmbed immediately
    if (val.includes('soundcloud.com/')) {
      setIsSearching(true);
      const result = await fetchSoundCloudOembed(val.trim());
      setSearchResults(result ? [result] : []);
      setIsSearching(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const clientId = import.meta.env.VITE_SOUNDCLOUD_CLIENT_ID;
        if (!clientId) {
          setSearchResults([{ type: 'hint', message: 'Paste a SoundCloud URL directly to add a mix' }]);
          setIsSearching(false);
          return;
        }
        const res = await fetch(
          `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(val)}&limit=5&client_id=${clientId}`
        );
        if (!res.ok) {
          setSearchResults([{ type: 'hint', message: 'Search unavailable — paste a direct SoundCloud URL instead' }]);
          setIsSearching(false);
          return;
        }
        const data = await res.json();
        const results = (data.collection || []).map(track => ({
          type: 'mix',
          title: track.title,
          artist: track.user?.username || 'Unknown',
          coverUrl: track.artwork_url?.replace('large', 't500x500') || null,
          sourceUrl: track.permalink_url,
          duration: track.duration,
        }));
        setSearchResults(results);
      } catch (e) {
        console.error('SoundCloud search failed:', e);
        setSearchResults([{ type: 'hint', message: 'Search failed — paste a direct SoundCloud URL instead' }]);
      }
      setIsSearching(false);
    }, 300);
  };

  // Add a SoundCloud mix to the shelf
  const addMix = async (mix) => {
    const newItem = {
      id: crypto.randomUUID(),
      type: 'mix',
      title: mix.title,
      artist: mix.artist,
      coverUrl: mix.coverUrl || null,
      sourceUrl: mix.sourceUrl,
      addedAt: new Date().toISOString(),
      listened: false,
    };

    try {
      const { error } = await supabase.from('items').insert(toDb(newItem));
      if (error) console.error('Failed to save mix:', error);
    } catch (e) {
      console.error('Failed to save mix:', e);
    }

    setShelf(prev => sortShelf([...prev, newItem]));
  };

  const toggleListened = async (item) => {
    const newListened = !item.listened;

    // Update in Supabase
    try {
      const { error } = await supabase
        .from('items')
        .update({ listened: newListened })
        .eq('id', item.id);
      if (error) console.error('Failed to update listened status:', error);
    } catch (e) {
      console.error('Failed to update listened status:', e);
    }

    // Update listened status immediately, then re-sort after a brief delay
    setShelf(prev =>
      prev.map(i => i.id === item.id ? { ...i, listened: newListened } : i)
    );
    setTimeout(() => {
      setShelf(prev => sortShelf([...prev]));
    }, 400);
  };

  const toggleListenAgain = async (item) => {
    const newListenAgain = !item.listenAgain;

    try {
      const { error } = await supabase
        .from('items')
        .update({ listen_again: newListenAgain })
        .eq('id', item.id);
      if (error) console.error('Failed to update listen again status:', error);
    } catch (e) {
      console.error('Failed to update listen again status:', e);
    }

    setShelf(prev =>
      prev.map(i => i.id === item.id ? { ...i, listenAgain: newListenAgain } : i)
    );
  };

  const handleSwipeStart = (e, itemId) => {
    setSwipeState({ id: itemId, startX: e.touches[0].clientX, deltaX: 0 });
  };

  const handleSwipeMove = (e) => {
    if (!swipeState.id) return;
    const deltaX = e.touches[0].clientX - swipeState.startX;
    setSwipeState(s => ({ ...s, deltaX }));
  };

  const handleSwipeEnd = () => {
    const { id, deltaX } = swipeState;
    if (deltaX < -80) {
      removeRecord(id);
    } else if (deltaX > 80) {
      const item = shelf.find(i => i.id === id);
      if (item) toggleListenAgain(item);
    }
    setSwipeState({ id: null, startX: 0, deltaX: 0 });
  };

  const removeRecord = async (itemId) => {
    // Delete from Supabase
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', itemId);
      if (error) console.error('Failed to delete item:', error);
    } catch (e) {
      console.error('Failed to delete item:', e);
    }

    setShelf(prev => prev.filter(i => i.id !== itemId));
  };

  // Get display text for rotating label
  const getRotatingText = (item) => {
    if (item.type === 'artist') {
      return `${item.name} — Discography — `;
    }
    return `${item.artist} — ${item.title} — `;
  };

  // Close expanded cover on Escape
  useEffect(() => {
    if (!expandedItem) return;
    const onKey = (e) => { if (e.key === 'Escape') setExpandedItem(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expandedItem]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none bg-zinc-950" style={{ height: 'env(safe-area-inset-top)' }} />
      <header className="w-full max-w-5xl mx-auto flex justify-between items-center mb-12 flex-shrink-0">
        <h1 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
          <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500"><span className="w-2 h-2 rounded-full bg-zinc-950" /></span> Shelf
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowStarredOnly(s => !s)}
            className={`p-3 rounded-full transition-colors active:scale-95 ${
              showStarredOnly ? 'bg-amber-500 hover:bg-amber-400' : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
            title={showStarredOnly ? 'Showing starred only — click to show all' : 'Show starred only'}
          >
            <Star className={`w-5 h-5 ${showStarredOnly ? 'text-white' : 'text-zinc-300'}`} strokeWidth={2} />
          </button>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-full shadow-lg transition-transform active:scale-95"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto pb-24">
        {viewMode === 'list' ? (
          <div className="divide-y divide-zinc-800/60">
            {(showStarredOnly ? shelf.filter(i => i.listenAgain) : shelf).slice(0, visibleCount).map((item) => {
              const deltaX = swipeState.id === item.id ? swipeState.deltaX : 0;
              const isReleasing = swipeState.id !== item.id;
              const primaryText = item.type === 'artist' ? item.name : item.title;
              const secondaryText = item.type === 'artist' ? (item.disambiguation || 'Artist') : item.artist;
              return (
                <div key={item.id} className="relative overflow-hidden">
                  <div className="absolute inset-0 bg-amber-500 flex items-center pl-4">
                    <Star className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div className="absolute inset-0 bg-red-600 flex items-center justify-end pr-4">
                    <Trash2 className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div
                    className="relative z-10 flex items-center gap-3 px-4 py-3 bg-zinc-950"
                    style={{
                      transform: `translateX(${deltaX}px)`,
                      transition: isReleasing ? 'transform 0.2s ease' : 'none',
                    }}
                    onTouchStart={(e) => handleSwipeStart(e, item.id)}
                    onTouchMove={handleSwipeMove}
                    onTouchEnd={handleSwipeEnd}
                    onTouchCancel={handleSwipeEnd}
                  >
                    <button
                      onClick={() => toggleListened(item)}
                      className="shrink-0 p-1 transition-transform active:scale-90"
                      title={item.listened ? 'Mark as unlistened' : 'Mark as listened'}
                    >
                      {item.listened ? (
                        <Check className="w-5 h-5 text-indigo-400" strokeWidth={2.5} />
                      ) : (
                        <Circle className="w-5 h-5 text-zinc-600" strokeWidth={2} />
                      )}
                    </button>
                    <div className={`flex-1 min-w-0 ${item.listened ? 'opacity-50' : ''}`}>
                      <p className="font-semibold text-sm truncate text-zinc-100">{primaryText}</p>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{secondaryText}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleListenAgain(item)}
                        className="p-1.5 transition-transform active:scale-90"
                        title={item.listenAgain ? 'Remove star' : 'Star'}
                      >
                        <Star
                          className={`w-4 h-4 ${item.listenAgain ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}`}
                          strokeWidth={2}
                        />
                      </button>
                      {item.type !== 'mix' && item.spotifyUrl && (
                        <a
                          href={item.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-zinc-600 hover:text-[#1DB954] transition-colors"
                          title="Open in Spotify"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {visibleCount < shelf.length && (
              <div ref={sentinelRef} className="h-1" />
            )}
            {shelf.length === 0 && (
              <div className="py-20 text-center text-zinc-600 border-2 border-dashed border-white/5 rounded-2xl">
                <Music4 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p>Your shelf is empty.</p>
                <p className="text-sm mt-1 opacity-60">Click the + button to add albums or artists</p>
              </div>
            )}
          </div>
        ) : (
        <div ref={gridRef} className="relative grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {(showStarredOnly ? shelf.filter(i => i.listenAgain) : shelf).slice(0, visibleCount).map((item, index) => {
            const isDragging = draggedItem?.item.id === item.id;
            const isFetching = fetchingArt.has(item.id);

            return (
            <div
              key={item.id}
              draggable={!isDragging}
              onDragStart={(e) => handleDragStart(e, item, index)}
              onDrag={handleDrag}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e)}
              onClick={() => { if (!draggedItem) setExpandedItem(item); }}
              className={`group relative aspect-square bg-zinc-900 overflow-hidden border border-white/5 shadow-xl ${
                isDragging ? 'opacity-0' : ''
              } ${!isDragging && 'cursor-grab active:cursor-grabbing'}`}
              style={{
                transition: isDragging
                  ? 'opacity 0.2s ease-out'
                  : draggedItem
                  ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease-out'
                  : `all 0.7s ease-in-out ${index * 20}ms`,
                willChange: draggedItem ? 'transform, opacity' : 'auto',
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
            >

              {/* Content layer — faded for listened items */}
              <div className={`absolute inset-0 ${item.listened && !draggedItem ? 'opacity-30' : ''}`}>
                {(() => {
                  const badge = getReleaseBadge(item.releaseDate);
                  if (!badge) return null;
                  return (
                    <div
                      className="absolute top-2 right-2 z-40 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg"
                      title={`Release date: ${item.releaseDate}`}
                    >
                      {badge}
                    </div>
                  );
                })()}

                {/* Shimmer loading state */}
                {!item.coverUrl && isFetching && (
                  <div className="absolute inset-0 art-loading z-10" />
                )}

                {/* Cover image with cross-fade */}
                {item.coverUrl && (
                  <img
                    src={item.coverUrl}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-opacity duration-500"
                    alt={item.type === 'artist' ? item.name : item.title}
                    style={{ opacity: isFetching ? 0 : undefined }}
                    onLoad={(e) => { e.target.style.opacity = 1; }}
                  />
                )}

                {/* Placeholder (only when not fetching and no cover) */}
                {!item.coverUrl && !isFetching && (
                  <PlaceholderCover item={item} />
                )}
              </div>

              {/* Listen again badge — outside faded layer so it stays bright */}
              {item.listenAgain && (
                <div
                  className="absolute bottom-2 right-2 z-40 bg-amber-500 p-1 rounded-full shadow-lg"
                  title="Flagged to listen again"
                >
                  <Star className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}

              {/* Overlay Container */}
              <div className={`absolute inset-0 transition-opacity duration-300 ${expandedItem ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'}`}>
                {/* Blur and Darken Layer */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10" />

                {/* Rotating Hover Label */}
                <RotatingText text={getRotatingText(item)} />

                {/* Action Buttons */}
                <div className="absolute inset-0 flex items-center justify-center gap-3 z-30">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleListened(item); }}
                    className={`p-2 rounded-full transition-all duration-200 active:scale-90 ${
                      item.listened ? 'bg-green-600 hover:bg-green-500' : 'bg-zinc-800/80 hover:bg-zinc-700/80'
                    }`}
                    title={item.listened ? "Mark as unlistened" : "Mark as listened"}
                  >
                    {item.listened ? (
                      <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
                    ) : (
                      <Circle className="w-5 h-5 text-zinc-300" strokeWidth={2} />
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleListenAgain(item); }}
                    className={`p-2 rounded-full transition-all duration-200 active:scale-90 ${
                      item.listenAgain ? 'bg-amber-500 hover:bg-amber-400' : 'bg-zinc-800/80 hover:bg-zinc-700/80'
                    }`}
                    title={item.listenAgain ? "Remove listen again flag" : "Flag to listen again"}
                  >
                    <Star className={`w-5 h-5 ${item.listenAgain ? 'text-white' : 'text-zinc-300'}`} strokeWidth={2} />
                  </button>
                  {item.type === 'mix' && item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 bg-zinc-800/80 rounded-full hover:bg-orange-600 transition-all duration-200 active:scale-90"
                      title="Open in SoundCloud"
                    >
                      <ExternalLink className="w-5 h-5 text-zinc-300" />
                    </a>
                  )}
                  {item.type !== 'mix' && item.spotifyUrl && (
                    <a
                      href={item.spotifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 bg-zinc-800/80 rounded-full hover:bg-[#1DB954] transition-all duration-200 active:scale-90"
                      title="Open in Spotify"
                    >
                      <svg className="w-5 h-5 text-zinc-300" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </a>
                  )}
                  {!item.coverUrl && item.type !== 'mix' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (item.type === 'artist') {
                          fetchArtistImage(item.name, item.mbid, item.id);
                        } else {
                          fetchAlbumArtwork(item.artist, item.title, item.id);
                        }
                      }}
                      className="p-2 bg-zinc-800/80 rounded-full hover:bg-indigo-600 transition-all duration-200 active:scale-90"
                      title="Retry fetching artwork"
                    >
                      <RefreshCw className="w-5 h-5 text-zinc-300" />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeRecord(item.id); }}
                    className="p-2 bg-zinc-800/80 rounded-full hover:bg-red-600 transition-all duration-200 active:scale-90"
                    title="Remove from shelf"
                  >
                    <Trash2 className="w-5 h-5 text-zinc-300" />
                  </button>
                </div>
              </div>
            </div>
            );
          })}

          {/* Sentinel for infinite scroll */}
          {visibleCount < shelf.length && (
            <div ref={sentinelRef} className="col-span-full h-1" />
          )}

          {/* Floating dragged item that follows cursor */}
          {draggedItem && gridRef.current && (
            <div
              className="fixed pointer-events-none z-[100]"
              style={{
                left: mousePosition.x - dragOffset.x,
                top: mousePosition.y - dragOffset.y,
                width: gridRef.current.querySelector('.group')?.offsetWidth || 200,
                height: gridRef.current.querySelector('.group')?.offsetHeight || 200,
                transition: 'none',
              }}
            >
              <div className="relative w-full h-full bg-zinc-900 overflow-hidden shadow-2xl scale-110 opacity-90">
                {draggedItem.item.coverUrl ? (
                  <img src={draggedItem.item.coverUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <PlaceholderCover item={draggedItem.item} />
                )}
              </div>
            </div>
          )}

          {shelf.length === 0 && (
            <div className="col-span-full py-20 text-center text-zinc-600 border-2 border-dashed border-white/5 rounded-2xl">
              <Music4 className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>Your shelf is empty.</p>
              <p className="text-sm mt-1 opacity-60">Click the + button to add albums or artists</p>
            </div>
          )}
        </div>
        )}
      </main>

      {/* Floating View Toggle */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex bg-zinc-800 rounded-full p-1 gap-1 shadow-xl">
        <button
          onClick={() => setViewMode('list')}
          className={`p-2 rounded-full transition-colors ${viewMode === 'list' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          title="List view"
        >
          <List size={18} />
        </button>
        <button
          onClick={() => setViewMode('grid')}
          className={`p-2 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
          title="Grid view"
        >
          <LayoutGrid size={18} />
        </button>
      </div>

      {/* Expanded Cover Overlay */}
      {expandedItem && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setExpandedItem(null)}
        >
          <button
            onClick={() => setExpandedItem(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white transition-colors z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative"
            style={{ width: '85vmin', height: '85vmin', maxWidth: '85vmin', maxHeight: '85vmin' }}
            onClick={(e) => e.stopPropagation()}
          >
            {expandedItem.coverUrl ? (
              <img
                src={expandedItem.coverUrl}
                alt={expandedItem.type === 'artist' ? expandedItem.name : expandedItem.title}
                className="w-full h-full object-cover rounded-lg shadow-2xl"
              />
            ) : (
              <div className="w-full h-full rounded-lg shadow-2xl overflow-hidden">
                <PlaceholderCover item={expandedItem} />
              </div>
            )}
          </div>
          <div className="text-center pt-4 px-6 py-2 rounded-xl backdrop-blur-md bg-zinc-900/60 mt-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">{expandedItem.type === 'artist' ? expandedItem.name : expandedItem.title}</p>
            <p className="text-sm text-zinc-400 mt-0.5">{expandedItem.type === 'artist' ? 'Discography' : expandedItem.artist}</p>
          </div>
        </div>
      )}

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 flex items-start justify-center p-6 pt-24 animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) closeSearch(); }}>
          <div className="w-full max-w-xl">
              {/* Mode Toggle */}
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { setSearchMode('music'); setSearchResults([]); setManualInput(''); }}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                    searchMode === 'music' ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  Music
                </button>
                <button
                  onClick={() => { setSearchMode('soundcloud'); setSearchResults([]); setManualInput(''); }}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                    searchMode === 'soundcloud' ? 'bg-orange-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  SoundCloud
                </button>
              </div>

              <textarea
                autoFocus
                rows={searchMode === 'music' && manualInput.includes('\n') ? 6 : 1}
                placeholder={searchMode === 'music' ? 'Search for artist or album' : 'Paste SoundCloud URL or search mixes'}
                className="w-full bg-zinc-900 border border-white/10 rounded-xl p-4 text-lg focus:ring-2 ring-indigo-500 outline-none resize-none"
                value={manualInput}
                onChange={(e) => searchMode === 'music' ? handleSearch(e.target.value) : handleSoundCloudSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (searchMode === 'music') {
                      addManualEntry();
                    } else if (searchResults.length === 1 && searchResults[0].type === 'mix') {
                      selectSearchResult(searchResults[0]);
                    }
                  }
                }}
              />

            {/* Search Results */}
            {!manualInput.includes('\n') && (
              <div className="mt-3 space-y-1">
                {isSearching && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin text-indigo-500 w-6 h-6" />
                  </div>
                )}

                {!isSearching && searchResults.map((r, i) => {
                  // Hint message (e.g. when SoundCloud search is unavailable)
                  if (r.type === 'hint') {
                    return (
                      <div key={i} className="p-3 text-sm text-zinc-500 text-center">
                        {r.message}
                      </div>
                    );
                  }

                  return (
                  <button
                    key={i}
                    onClick={() => selectSearchResult(r)}
                    className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-indigo-600 rounded-lg transition-colors group text-left"
                  >
                    {r.type === 'album' ? (
                      <>
                        <Disc className="w-5 h-5 text-zinc-500 group-hover:text-white flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate group-hover:text-white">{r.title}</p>
                          <p className="text-sm text-zinc-500 truncate group-hover:text-indigo-200">{r.artist}{r.year && ` • ${r.year}`}</p>
                        </div>
                      </>
                    ) : r.type === 'mix' ? (
                      <>
                        <Radio className="w-5 h-5 text-orange-500 group-hover:text-white flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate group-hover:text-white">{r.title}</p>
                          <p className="text-sm text-zinc-500 truncate group-hover:text-indigo-200">
                            {r.artist}
                            {r.duration && ` • ${Math.floor(r.duration / 60000)}min`}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <User className="w-5 h-5 text-zinc-500 group-hover:text-white flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate group-hover:text-white">{r.name}</p>
                          <p className="text-sm text-zinc-500 truncate group-hover:text-indigo-200">
                            {r.disambiguation || r.country || 'Artist'}
                          </p>
                        </div>
                      </>
                    )}
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
