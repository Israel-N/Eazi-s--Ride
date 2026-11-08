import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, CarFront, LocateFixed } from 'lucide-react';

const defaultCenter = [5.6037, -0.1870]; // Accra fallback

const pinIcon = (color) => L.divIcon({
  className: '',
  html: `<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid white;box-shadow:0 3px 12px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center"><div style="width:10px;height:10px;border-radius:50%;background:white"></div></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34]
});

const driverIcon = L.divIcon({
  className: '',
  html: `<div style="width:42px;height:42px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 3px 14px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-size:20px">🚕</div>`,
  iconSize: [42, 42],
  iconAnchor: [21, 21]
});

function FitBounds({ points }) {
  const map = useMap();
  const first = points[0];
  const second = points[1];
  useEffect(() => {
    const valid = points.filter(Boolean).map(p => [p.lat, p.lng]);
    if (valid.length === 1) map.setView(valid[0], 15);
    if (valid.length > 1) map.fitBounds(valid, { padding: [40, 40] });
  }, [map, first?.lat, first?.lng, second?.lat, second?.lng]);
  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: onMapClick || (() => {}) });
  return null;
}

function LocateButton({ onLocate }) {
  return (
    <button
      type="button"
      onClick={onLocate}
      className="absolute right-3 top-3 z-[1000] bg-white rounded-xl shadow-lg p-3 text-blue-600 hover:bg-blue-50"
      title="Use my current location"
    >
      <LocateFixed size={19} />
    </button>
  );
}

const MapView = ({ pickup, destination, driverLocation, onMapClick, onLocate }) => {
  const points = [pickup, destination, driverLocation];
  const center = pickup ? [pickup.lat, pickup.lng] : defaultCenter;

  return (
    <div className="w-full h-full rounded-xl overflow-hidden border border-gray-200 relative">
      <MapContainer center={center} zoom={13} scrollWheelZoom className="w-full h-full">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBounds points={[pickup, destination]} />
        {onMapClick && <MapClickHandler onMapClick={onMapClick} />}

        {pickup && (
          <Marker position={[pickup.lat, pickup.lng]} icon={pinIcon('#16a34a')}>
            <Popup><b>Pickup</b><br />Your pickup location</Popup>
          </Marker>
        )}

        {destination && (
          <Marker position={[destination.lat, destination.lng]} icon={pinIcon('#dc2626')}>
            <Popup><b>Destination</b><br />Your destination</Popup>
          </Marker>
        )}

        {driverLocation && (
          <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon}>
            <Popup><b>Your driver</b><br />Live driver location</Popup>
          </Marker>
        )}

        {pickup && destination && (
          <Polyline
            positions={[[pickup.lat, pickup.lng], [destination.lat, destination.lng]]}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.75, dashArray: '10 8' }}
          />
        )}
      </MapContainer>
      {onLocate && <LocateButton onLocate={onLocate} />}
      {onMapClick && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000] bg-white/95 backdrop-blur rounded-xl px-3 py-2 text-xs shadow-lg flex items-center gap-2">
          <MapPin size={15} className="text-red-600" />
          <span>Tap the map to choose a destination.</span>
        </div>
      )}
    </div>
  );
};

export default MapView;
