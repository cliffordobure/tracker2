import { useState } from 'react';
import LocationSearch from './LocationSearch';
import MapView from './MapView';

export default function LocationMapPicker({
  hint,
  center,
  zoom = 13,
  focus,
  stopName = 'School',
  searchPlaceholder = 'Search estate, landmark, or area…',
  mapClassName = 'map-canvas pa-map',
  onLocationChange,
  onFocusChange,
}) {
  const [expanded, setExpanded] = useState(false);

  const lat = Number(center?.lat);
  const lng = Number(center?.lng);

  const handleSelect = (place) => {
    onLocationChange?.({
      lat: place.lat,
      lng: place.lng,
      address: place.placeName || place.name,
    });
    onFocusChange?.({ lat: place.lat, lng: place.lng, zoom: 16.4, at: Date.now() });
  };

  const handleMapClick = (loc) => {
    onLocationChange?.({ lat: loc.lat, lng: loc.lng });
  };

  const stops = [
    {
      name: stopName || 'School',
      type: 'school',
      location: { lat, lng },
    },
  ];

  const renderMap = (className) => (
    <div className="map-picker-wrap">
      <MapView
        center={{ lat, lng }}
        zoom={zoom}
        focus={focus}
        onMapClick={handleMapClick}
        stops={stops}
        className={className}
      />
      {!expanded && (
        <button
          type="button"
          className="map-picker-expand"
          aria-label="Expand map"
          title="Expand map"
          onClick={() => setExpanded(true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M8 3H3v5M16 3h5v5M16 21h5v-5M8 21H3v-5M21 3l-7 7M3 21l7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <>
      {hint ? <p className="hint">{hint}</p> : null}
      <LocationSearch proximity={{ lat, lng }} placeholder={searchPlaceholder} onSelect={handleSelect} />
      {renderMap(mapClassName)}

      {expanded && (
        <div className="map-picker-modal" role="dialog" aria-modal="true" aria-label="Pick location on map">
          <button type="button" className="map-picker-modal-backdrop" aria-label="Close map" onClick={() => setExpanded(false)} />
          <div className="map-picker-modal-panel">
            <header className="map-picker-modal-head">
              <div>
                <h3>Pick school location</h3>
                <p className="muted">Search a place or click the map to set the gate pin.</p>
              </div>
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => setExpanded(false)}>
                Done
              </button>
            </header>
            <LocationSearch proximity={{ lat, lng }} placeholder={searchPlaceholder} onSelect={handleSelect} />
            <MapView
              center={{ lat, lng }}
              zoom={zoom}
              focus={focus}
              onMapClick={handleMapClick}
              stops={stops}
              className="map-canvas map-picker-modal-map"
            />
          </div>
        </div>
      )}
    </>
  );
}
