const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const NOMINATIM_UA = 'TrackTotoSchoolTracker/1.0';

function mapMapboxFeature(f) {
  return {
    id: f.id,
    name: f.text,
    placeName: f.place_name,
    lng: f.center?.[0],
    lat: f.center?.[1],
    source: 'mapbox',
  };
}

function mapNominatimFeature(f, index) {
  const parts = String(f.display_name || '').split(',').map((s) => s.trim());
  return {
    id: `osm-${f.osm_type || 'place'}-${f.osm_id || index}`,
    name: parts[0] || f.display_name,
    placeName: f.display_name,
    lng: Number(f.lon),
    lat: Number(f.lat),
    source: 'osm',
  };
}

async function searchMapbox(query, { proximity, country = 'ke' } = {}) {
  if (!TOKEN || TOKEN.includes('your_mapbox')) return [];

  const params = new URLSearchParams({
    access_token: TOKEN,
    autocomplete: 'true',
    limit: '6',
    language: 'en',
  });
  if (country) params.set('country', country);
  if (proximity?.lng != null && proximity?.lat != null) {
    params.set('proximity', `${proximity.lng},${proximity.lat}`);
  }

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Location search failed');

  return (data.features || [])
    .map(mapMapboxFeature)
    .filter((p) => p.lat != null && p.lng != null);
}

async function searchNominatim(query, { proximity } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '6',
    addressdetails: '0',
    countrycodes: 'ke',
  });
  if (proximity?.lng != null && proximity?.lat != null) {
    const pad = 0.35;
    params.set(
      'viewbox',
      `${proximity.lng - pad},${proximity.lat + pad},${proximity.lng + pad},${proximity.lat - pad}`
    );
  }

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': NOMINATIM_UA,
    },
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error('OpenStreetMap search failed');

  return (Array.isArray(data) ? data : [])
    .map(mapNominatimFeature)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export async function searchPlaces(query, options = {}) {
  const q = String(query || '').trim();
  if (!q || q.length < 2) return [];

  const mapboxResults = await searchMapbox(q, options);
  if (mapboxResults.length) return mapboxResults;

  return searchNominatim(q, options);
}
