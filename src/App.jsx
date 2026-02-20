import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Disc, Plus, Trash2, X, Music4, Check, Circle, User, RefreshCw, Loader2, Star, Radio, ExternalLink, LayoutGrid, Layers, Shuffle } from 'lucide-react';
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

const App = () => {
  const [shelf, setShelf] = useState([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  const [fetchingArt, setFetchingArt] = useState(new Set());
  const [searchMode, setSearchMode] = useState('music');
  const [viewMode, setViewMode] = useState('grid');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isShuffling, setIsShuffling] = useState(false);

  const [isLoaded, setIsLoaded] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragTimeoutRef = useRef(null);
  const gridRef = useRef(null);
  const rackRef = useRef(null);

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
    loadItems().then(() => {
      const dismissSplash = () => {
        const splash = document.getElementById('splash');
        if (splash) {
          splash.classList.add('hide');
          setTimeout(() => splash.remove(), 400);
        }
      };
      // Wait a frame for React to render images into the DOM
      requestAnimationFrame(() => {
        const images = document.querySelectorAll('#root img');
        if (images.length === 0) {
          dismissSplash();
          return;
        }
        const promises = Array.from(images).map(img =>
          img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
        );
        Promise.all(promises).then(dismissSplash);
        setTimeout(dismissSplash, 8000);
      });
    });
  }, []);

  const sortShelf = (items) => {
    return [...items].sort((a, b) => {
      // Listened items always go to the bottom
      if (a.listened !== b.listened) {
        return a.listened ? 1 : -1;
      }
      // Within the same listened status, respect manual order
      if (a.order != null && b.order != null) {
        return a.order - b.order;
      }
      // Otherwise sort by date added (newest first)
      return new Date(b.addedAt) - new Date(a.addedAt);
    });
  };

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
      const coverUrl = await fetchCaaCover(artist, album)
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

      // Try TheAudioDB first (has nice press photos)
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

  // Rack constants — angle must be large enough that adjacent covers don't overlap
  // At 40° on a 400px radius, vertical gap between adjacent items ≈ 257px
  const RACK_ANGLE_STEP = 40;
  const RACK_RADIUS = 400;

  // Rack shuffle — spins the drum multiple full turns then lands on target
  const handleShuffle = useCallback(() => {
    const items = shelf.filter(i => i.coverUrl);
    const unlistened = items.filter(i => !i.listened);
    if (unlistened.length === 0 || isShuffling) return;

    const targetItem = unlistened[Math.floor(Math.random() * unlistened.length)];
    const targetIdx = items.indexOf(targetItem);
    if (targetIdx === -1) return;

    setIsShuffling(true);

    // Spin: go forward by 2-3 full drum revolutions + distance to target
    const fullRevItems = Math.ceil(360 / RACK_ANGLE_STEP);
    const spins = (2 + Math.floor(Math.random() * 2)) * fullRevItems;
    const overshootIdx = targetIdx + spins;

    setActiveIndex(overshootIdx);

    // After the spin transition completes, snap to real index and settle
    setTimeout(() => {
      // Briefly disable transition, snap to actual targetIdx + 1 (overshoot)
      setActiveIndex(-1); // sentinel to trigger no-transition snap
      requestAnimationFrame(() => {
        setActiveIndex(targetIdx + 1 >= items.length ? 0 : targetIdx + 1);
        // Then settle back to exact target
        setTimeout(() => {
          setActiveIndex(targetIdx);
          setTimeout(() => setIsShuffling(false), 400);
        }, 50);
      });
    }, 2200);
  }, [shelf, isShuffling]);

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

  // Items with covers for rack view — only unlistened or starred to listen again
  const rackItems = shelf.filter(i => i.coverUrl && (!i.listened || i.listenAgain));

  // Lock body scroll and capture wheel globally in rack mode
  useEffect(() => {
    if (viewMode !== 'rack') return;
    document.body.style.overflow = 'hidden';

    const onWheel = (e) => {
      e.preventDefault();
      if (isShuffling) return;
      if (rackRef.current?._wheelLock) return;
      rackRef.current._wheelLock = true;
      setTimeout(() => { if (rackRef.current) rackRef.current._wheelLock = false; }, 100);
      const dir = e.deltaY > 0 ? 1 : -1;
      setActiveIndex(prev => Math.max(0, Math.min(prev + dir, rackItems.length - 1)));
    };

    document.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('wheel', onWheel);
    };
  }, [viewMode, isShuffling, rackItems.length]);

  return (
    <div className={`${viewMode === 'rack' ? 'h-[100dvh] overflow-hidden flex flex-col' : 'min-h-screen'} bg-zinc-950 text-zinc-100 p-6`} style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none bg-zinc-950" style={{ height: 'env(safe-area-inset-top)' }} />
      <header className={`max-w-5xl mx-auto flex justify-between items-center ${viewMode === 'rack' ? 'mb-4 flex-shrink-0' : 'mb-12'}`}>
        <h1 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
          <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500"><span className="w-2 h-2 rounded-full bg-zinc-950" /></span> Shelf
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode(v => v === 'grid' ? 'rack' : 'grid')}
            className="p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors active:scale-95"
            title={viewMode === 'grid' ? 'Switch to rack view' : 'Switch to grid view'}
          >
            {viewMode === 'grid' ? <Layers className="w-5 h-5" /> : <LayoutGrid className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-full shadow-lg transition-transform active:scale-95"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className={`max-w-5xl mx-auto ${viewMode === 'rack' ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
        {viewMode === 'grid' ? (
        <div ref={gridRef} className="relative grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {shelf.map((item, index) => {
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
                    className="w-full h-full object-cover transition-opacity duration-500"
                    alt={item.type === 'artist' ? item.name : item.title}
                    style={{ opacity: 0 }}
                    onLoad={(e) => { e.target.style.opacity = 1; }}
                  />
                )}

                {/* Placeholder (only when not fetching and no cover) */}
                {!item.coverUrl && !isFetching && (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    {item.type === 'artist' ? (
                      <>
                        <User className="w-8 h-8 text-zinc-600 mb-2" />
                        <p className="text-xs font-bold line-clamp-2">{item.name}</p>
                        {item.disambiguation && (
                          <p className="text-[10px] opacity-50 italic line-clamp-1">{item.disambiguation}</p>
                        )}
                      </>
                    ) : item.type === 'mix' ? (
                      <>
                        <Radio className="w-8 h-8 text-zinc-600 mb-2" />
                        <p className="text-xs font-bold line-clamp-2">{item.artist}</p>
                        <p className="text-[10px] opacity-50 italic line-clamp-1">{item.title}</p>
                      </>
                    ) : (
                      <>
                        <Disc className="w-8 h-8 text-zinc-600 mb-2" />
                        <p className="text-xs font-bold line-clamp-2">{item.artist}</p>
                        <p className="text-[10px] opacity-50 italic line-clamp-1">{item.title}</p>
                      </>
                    )}
                  </div>
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
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto">
                {/* Blur and Darken Layer */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] z-10" />

                {/* Rotating Hover Label */}
                <RotatingText text={getRotatingText(item)} />

                {/* Action Buttons */}
                <div className="absolute inset-0 flex items-center justify-center gap-3 z-30">
                  <button
                    onClick={() => toggleListened(item)}
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
                    onClick={() => toggleListenAgain(item)}
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
                      className="p-2 bg-zinc-800/80 rounded-full hover:bg-orange-600 transition-all duration-200 active:scale-90"
                      title="Open in SoundCloud"
                    >
                      <ExternalLink className="w-5 h-5 text-zinc-300" />
                    </a>
                  )}
                  {!item.coverUrl && item.type !== 'mix' && (
                    <button
                      onClick={() => {
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
                    onClick={() => removeRecord(item.id)}
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
                  <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    {draggedItem.item.type === 'artist' ? (
                      <>
                        <User className="w-8 h-8 text-zinc-600 mb-2" />
                        <p className="text-xs font-bold line-clamp-2">{draggedItem.item.name}</p>
                      </>
                    ) : (
                      <>
                        <Disc className="w-8 h-8 text-zinc-600 mb-2" />
                        <p className="text-xs font-bold line-clamp-2">{draggedItem.item.artist}</p>
                        <p className="text-[10px] opacity-50 italic line-clamp-1">{draggedItem.item.title}</p>
                      </>
                    )}
                  </div>
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
        ) : (
        /* Rack View — 3D cylinder drum */
        <div className="flex flex-col items-center flex-1 min-h-0">
          {rackItems.length < 5 ? (
            <div className="py-20 text-center text-zinc-600">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p>Not enough covers for rack view.</p>
              <p className="text-sm mt-1 opacity-60">Add more albums with artwork, or switch to grid view</p>
            </div>
          ) : (
            <>
              {/* Perspective wrapper */}
              <div
                ref={rackRef}
                className="relative flex-1 min-h-0 w-full select-none overflow-hidden"
                style={{ perspective: '800px', perspectiveOrigin: '50% 50%' }}
                onTouchStart={(e) => {
                  if (isShuffling) return;
                  rackRef.current._touchY = e.touches[0].clientY;
                }}
                onTouchMove={(e) => {
                  if (isShuffling || !rackRef.current?._touchY) return;
                  const diff = rackRef.current._touchY - e.touches[0].clientY;
                  if (Math.abs(diff) > 30) {
                    setActiveIndex(prev => {
                      if (diff > 0) return Math.min(prev + 1, rackItems.length - 1);
                      return Math.max(prev - 1, 0);
                    });
                    rackRef.current._touchY = e.touches[0].clientY;
                  }
                }}
              >
                {/* Rotating drum — the whole drum turns, items are fixed on its surface */}
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: `translateZ(-${RACK_RADIUS}px) rotateX(${activeIndex * RACK_ANGLE_STEP}deg)`,
                    transition: activeIndex === -1
                      ? 'none'
                      : isShuffling
                        ? 'transform 2s cubic-bezier(0.2, 0.8, 0.3, 1)'
                        : 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
                  }}
                >
                  {rackItems.map((item, i) => (
                    <div
                      key={item.id}
                      className="absolute overflow-hidden rounded-lg"
                      style={{
                        width: '220px',
                        height: '220px',
                        aspectRatio: '1 / 1',
                        transform: `rotateX(${-i * RACK_ANGLE_STEP}deg) translateZ(${RACK_RADIUS}px)`,
                        backfaceVisibility: 'hidden',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                      }}
                    >
                      <img
                        src={item.coverUrl}
                        className="object-cover"
                        style={{ width: '220px', height: '220px', display: 'block' }}
                        alt={item.title || item.name}
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Info + shuffle pinned to bottom */}
              <div className="flex-shrink-0 flex flex-col items-center pb-2">
                {rackItems[activeIndex >= 0 ? activeIndex % rackItems.length : 0] && (
                  <div className="text-center mb-3">
                    {(() => {
                      const item = rackItems[activeIndex >= 0 ? activeIndex % rackItems.length : 0];
                      return (
                        <>
                          <p className="text-lg font-bold">{item.type === 'artist' ? item.name : item.title}</p>
                          <p className="text-sm text-zinc-400">{item.type === 'artist' ? 'Discography' : item.artist}</p>
                        </>
                      );
                    })()}
                  </div>
                )}
                <button
                  onClick={handleShuffle}
                  disabled={isShuffling}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold transition-all active:scale-95 ${
                    isShuffling
                      ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg'
                  }`}
                >
                  <Shuffle className={`w-5 h-5 ${isShuffling ? 'animate-spin' : ''}`} />
                  {isShuffling ? 'Spinning...' : 'Shuffle'}
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </main>

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
