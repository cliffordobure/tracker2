import { useEffect, useRef, useState } from 'react';
import { searchPlaces } from '../lib/geocode';

export default function LocationSearch({
  proximity,
  placeholder = 'Search an area, estate, or landmark…',
  onSelect,
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const boxRef = useRef(null);
  const seqRef = useRef(0);
  const suppressOpenRef = useRef(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError('');
      return undefined;
    }
    const handle = setTimeout(async () => {
      const seq = ++seqRef.current;
      setBusy(true);
      setError('');
      try {
        const places = await searchPlaces(q, { proximity });
        if (seq !== seqRef.current) return;
        setResults(places);
        if (suppressOpenRef.current) {
          suppressOpenRef.current = false;
          setOpen(false);
        } else {
          setOpen(true);
        }
        if (!places.length) setError('No matching places. Try a nearby estate or road.');
      } catch (err) {
        if (seq !== seqRef.current) return;
        setResults([]);
        setError(err.message || 'Search failed');
      } finally {
        if (seq === seqRef.current) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [query, proximity?.lat, proximity?.lng]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (place) => {
    suppressOpenRef.current = true;
    setQuery(place.placeName || place.name);
    setOpen(false);
    onSelect?.(place);
  };

  return (
    <div className="loc-search" ref={boxRef}>
      <div className="loc-search-field">
        <span className="loc-search-icon" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (results[0]) pick(results[0]);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {busy ? <span className="loc-search-busy">Searching…</span> : null}
      </div>
      {open && results.length > 0 && (
        <ul className="loc-search-list">
          {results.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => pick(place)}>
                <strong>{place.name}</strong>
                <span>{place.placeName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && query.trim().length >= 2 && !busy ? <p className="hint">{error}</p> : null}
    </div>
  );
}
