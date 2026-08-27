const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isValidLatitude(lat) {
  return inRange(lat, -90, 90);
}

function isValidLongitude(lng) {
  return inRange(lng, -180, 180);
}

function parseCoordinates(input) {
  if (!input || typeof input !== 'object') return null;

  const lat = Number(input.lat ?? input.latitude);
  const lng = Number(input.lng ?? input.lon ?? input.longitude);

  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null;
  return { lat, lng };
}

function toGeoJSONPoint(lat, lng) {
  return { type: 'Point', coordinates: [lng, lat] };
}

function distanceInMeters(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function metersToRadians(meters) {
  return meters / EARTH_RADIUS_M;
}

function boundingBox({ lat, lng }, radiusMeters) {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);

  const cosLat = Math.max(Math.cos(toRad(lat)), 1e-6);
  const lngDelta = latDelta / cosLat;

  return {
    minLat: Math.max(-90, lat - latDelta),
    maxLat: Math.min(90, lat + latDelta),
    minLng: Math.max(-180, lng - lngDelta),
    maxLng: Math.min(180, lng + lngDelta),
  };
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'unknown distance';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

function directionsLink(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export { EARTH_RADIUS_M, isValidLatitude, isValidLongitude, parseCoordinates, toGeoJSONPoint, distanceInMeters, metersToRadians, boundingBox, formatDistance, directionsLink };
