const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export async function searchPlaces(query, { proximity, country = 'ke' } = {}) {
  const q = String(query || '').trim();
  if (!q || q.length < 2 || !TOKEN || TOKEN.includes('your_mapbox')) return [];

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
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Location search failed');

  return (data.features || []).map((f) => ({
    id: f.id,
    name: f.text,
    placeName: f.place_name,
    lng: f.center?.[0],
    lat: f.center?.[1],
  })).filter((p) => p.lat != null && p.lng != null);
}
