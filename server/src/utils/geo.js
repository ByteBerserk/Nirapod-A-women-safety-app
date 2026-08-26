const EARTH_RADIUS_M = 6371008.8; // IUGG mean radius

const toRad = (deg) => (deg * Math.PI) / 180;

/** True when the value is a finite number inside the given inclusive range. */
function inRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isValidLatitude(lat) {
  return inRange(lat, -90, 90);
}

function isValidLongitude(lng) {
  return inRange(lng, -180, 180);
}

/**
 * Parses a loose `{ lat, lng }`-ish object into numbers, or returns null.
 * Accepts `lng` / `lon` / `longitude` because different browser and map APIs
 * spell it differently and the client should not have to normalise it.
 */
function parseCoordinates(input) {
  if (!input || typeof input !== 'object') return null;

  const lat = Number(input.lat ?? input.latitude);
  const lng = Number(input.lng ?? input.lon ?? input.longitude);

  if (!isValidLatitude(lat) || !isValidLongitude(lng)) return null;
  return { lat, lng };
}

/** GeoJSON stores [longitude, latitude] - the opposite order to every UI. */
function toGeoJSONPoint(lat, lng) {
  return { type: 'Point', coordinates: [lng, lat] };
}

/**
 * Great-circle distance in metres. Used for geofencing and for the "how far
 * away" numbers on the nearby-services screen.
 */
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

/** Radians of arc for a distance in metres - what $centerSphere expects. */
function metersToRadians(meters) {
  return meters / EARTH_RADIUS_M;
}

/**
 * A bounding box around a point, in degrees. Cheap pre-filter and also what
 * Overpass wants for its `around`-less queries.
 */
function boundingBox({ lat, lng }, radiusMeters) {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  // Longitude degrees shrink towards the poles; guard against cos -> 0.
  const cosLat = Math.max(Math.cos(toRad(lat)), 1e-6);
  const lngDelta = latDelta / cosLat;

  return {
    minLat: Math.max(-90, lat - latDelta),
    maxLat: Math.min(90, lat + latDelta),
    minLng: Math.max(-180, lng - lngDelta),
    maxLng: Math.min(180, lng + lngDelta),
  };
}

/** "820 m" / "3.4 km" - used in emails where we cannot run client-side code. */
function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'unknown distance';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

/** A link anyone can open, no API key and no account required. */
function directionsLink(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export { EARTH_RADIUS_M, isValidLatitude, isValidLongitude, parseCoordinates, toGeoJSONPoint, distanceInMeters, metersToRadians, boundingBox, formatDistance, directionsLink };