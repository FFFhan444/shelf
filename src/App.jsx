import React, { useState, useEffect, useRef } from 'react';
import { Disc, Plus, Trash2, X, Music4, Check, Circle, User, RefreshCw, Loader2 } from 'lucide-react';
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
  addedAt: row.added_at,
  listened: row.listened ?? false,
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
  added_at: item.addedAt,
  listened: item.listened ?? false,
  item_order: item.order ?? null
});

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

  const [isLoaded, setIsLoaded] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragTimeoutRef = useRef(null);
  const gridRef = useRef(null);

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
    loadItems();
  }, []);

  const sortShelf = (items) => {
    return [...items].sort((a, b) => {
      // If items have manual order set, respect it
      if (a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      // Otherwise sort by listened status, then by date
      if (a.listened === b.listened) {
        return new Date(b.addedAt) - new Date(a.addedAt);
      }
      return a.listened ? 1 : -1;
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

  // Fetch album artwork from Cover Art Archive
  const fetchAlbumArtwork = async (artist, album, itemId) => {
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

        if (head.ok) {
          // Update in Supabase
          const { error } = await supabase
            .from('items')
            .update({ cover_url: caaUrl })
            .eq('id', itemId);
          if (error) console.error('Failed to update cover:', error);

          setShelf(prev => {
            const updated = prev.map(item =>
              item.id === itemId ? { ...item, coverUrl: caaUrl } : item
            );
            return sortShelf(updated);
          });
        }
      }
    } catch (e) {
      console.warn("Album art fetch failed", e);
    }
  };

  // Fetch artist image from multiple sources
  const fetchArtistImage = async (artistName, mbid, itemId) => {
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
  };

  const selectSearchResult = (result) => {
    closeSearch();
    if (result.type === 'album') {
      addAlbum(result);
    } else {
      addArtist(result);
    }
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

    setShelf(prev => {
      const updated = prev.map(i =>
        i.id === item.id ? { ...i, listened: newListened } : i
      );
      return sortShelf(updated);
    });
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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-12">
        <h1 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
          <Disc className="w-8 h-8 text-indigo-500" /> Shelf
        </h1>
        <button
          onClick={() => setIsSearchOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-full shadow-lg transition-transform active:scale-95"
        >
          <Plus className="w-6 h-6" />
        </button>
      </header>

      <main className="max-w-5xl mx-auto">
        <div ref={gridRef} className="relative grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {shelf.map((item, index) => {
            const isDragging = draggedItem?.item.id === item.id;

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
              } ${!isDragging && 'cursor-grab active:cursor-grabbing'} ${
                item.listened && !draggedItem ? 'opacity-30' : ''
              }`}
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

              {item.coverUrl ? (
                <img src={item.coverUrl} className="w-full h-full object-cover" alt={item.type === 'artist' ? item.name : item.title} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                  {item.type === 'artist' ? (
                    <>
                      <User className="w-8 h-8 text-zinc-600 mb-2" />
                      <p className="text-xs font-bold line-clamp-2">{item.name}</p>
                      {item.disambiguation && (
                        <p className="text-[10px] opacity-50 italic line-clamp-1">{item.disambiguation}</p>
                      )}
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
                    className="p-2 rounded-full transition-all duration-200 transform active:scale-90"
                    title={item.listened ? "Mark as unlistened" : "Mark as listened"}
                  >
                    {item.listened ? (
                      <div className="bg-green-600 p-1 rounded-full">
                        <Check className="w-4 h-4 text-white" strokeWidth={3} />
                      </div>
                    ) : (
                      <Circle className="w-6 h-6 text-zinc-400" strokeWidth={2} />
                    )}
                  </button>
                  {!item.coverUrl && (
                    <button
                      onClick={() => {
                        if (item.type === 'artist') {
                          fetchArtistImage(item.name, item.mbid, item.id);
                        } else {
                          fetchAlbumArtwork(item.artist, item.title, item.id);
                        }
                      }}
                      className="p-2 bg-zinc-800/80 rounded-full hover:bg-indigo-600 transition-colors"
                      title="Retry fetching artwork"
                    >
                      <RefreshCw className="w-4 h-4 text-zinc-300" />
                    </button>
                  )}
                  <button
                    onClick={() => removeRecord(item.id)}
                    className="p-2 bg-zinc-800/80 rounded-full hover:bg-red-600 transition-colors"
                    title="Remove from shelf"
                  >
                    <Trash2 className="w-4 h-4 text-zinc-300" />
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
      </main>

      {/* Search Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/95 flex items-start justify-center p-6 pt-24 animate-fade-in">
          <div className="max-w-xl w-full">
            <div className="flex items-center gap-3">
              <textarea
                autoFocus
                rows={manualInput.includes('\n') ? 6 : 1}
                placeholder="Artist - Album or just Artist name"
                className="flex-1 bg-zinc-900 border border-white/10 rounded-xl p-4 text-lg focus:ring-2 ring-indigo-500 outline-none resize-none"
                value={manualInput}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={(e) => {
                  // Enter submits, Shift+Enter for new line
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    addManualEntry();
                  }
                }}
              />
              <button
                onClick={closeSearch}
                className="p-3 hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Search Results */}
            {!manualInput.includes('\n') && (
              <div className="mt-3 space-y-1">
                {isSearching && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin text-indigo-500 w-6 h-6" />
                  </div>
                )}

                {!isSearching && searchResults.map((r, i) => (
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
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
