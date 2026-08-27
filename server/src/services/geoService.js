import env from '../config/env.js';
import * as logger from '../config/logger.js';
import TtlCache from './cache.js';
import AppError from '../utils/AppError.js';
import { parseCoordinates, distanceInMeters, formatDistance } from '../utils/geo.js';
import { LIMITS } from '../config/constants.js';

const geocodeCache = new TtlCache({ maxEntries: 1000, defaultTtlMs: 24 * 60 * 60 * 1000 });
const poiCache = new TtlCache({ maxEntries: 300, defaultTtlMs: 60 * 60 * 1000 });

const REQUEST_TIMEOUT_MS = 12000;

let nominatimChain = Promise.resolve();
let lastNominatimCall = 0;

function throttleNominatim(task) {
  const run = async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimCall));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimCall = Date.now();
    return task();
  };

  nominatimChain = nominatimChain.then(run, run);
  return nominatimChain;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);

  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': env.geo.userAgent,
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function reverseGeocode(lat, lng) {
  const key = `rev:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = geocodeCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const url =
      `${env.geo.nominatimUrl}/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`;

    const data = await throttleNominatim(() => fetchJson(url));
    const address = data?.display_name || '';
    const parts = data?.address || {};

    const result = {
      address,
      area: parts.suburb || parts.neighbourhood || parts.city_district || parts.village || '',
      city: parts.city || parts.town || parts.municipality || parts.county || '',
      country: parts.country || '',
      postcode: parts.postcode || '',
    };

    geocodeCache.set(key, result);
    return result;
  } catch (error) {
    logger.warn('Reverse geocode failed', { lat, lng, message: error.message });
    const empty = { address: '', area: '', city: '', country: '', postcode: '' };

    geocodeCache.set(key, empty, 60 * 1000);
    return empty;
  }
}

async function searchPlaces(query, limit = 5) {
  const term = String(query || '').trim();
  if (term.length < 3) return [];

  const key = `search:${term.toLowerCase()}:${limit}`;
  const cached = geocodeCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const url =
      `${env.geo.nominatimUrl}/search?format=jsonv2&addressdetails=1` +
      `&limit=${Math.min(10, Math.max(1, limit))}&q=${encodeURIComponent(term)}`;

    const data = await throttleNominatim(() => fetchJson(url));

    const results = (Array.isArray(data) ? data : []).map((item) => ({
      name: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      type: item.type,
      importance: item.importance,
    }));

    geocodeCache.set(key, results, 6 * 60 * 60 * 1000);
    return results;
  } catch (error) {
    logger.warn('Place search failed', { query: term, message: error.message });
    throw AppError.internal('The map search is unavailable right now. Please try again shortly.');
  }
}

const POI_QUERIES = {
  police: ['amenity=police'],
  hospital: ['amenity=hospital', 'amenity=clinic', 'amenity=doctors'],
  pharmacy: ['amenity=pharmacy'],
  fire: ['amenity=fire_station'],
  shelter: ['amenity=shelter', 'social_facility=shelter'],
};

const POI_LABELS = {
  police: 'Police station',
  hospital: 'Hospital / clinic',
  pharmacy: 'Pharmacy',
  fire: 'Fire station',
  shelter: 'Shelter',
};

const OVERPASS_ENDPOINTS = [
  env.geo.overpassUrl,
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
].filter((url, index, all) => url && all.indexOf(url) === index);

function buildOverpassQuery(kinds, lat, lng, radius) {
  const clauses = kinds
    .flatMap((kind) => POI_QUERIES[kind] || [])
    .flatMap((tag) => {
      const [key, value] = tag.split('=');

      return ['node', 'way', 'relation'].map(
        (element) => `${element}["${key}"="${value}"](around:${radius},${lat},${lng});`
      );
    })
    .join('\n  ');

  return `[out:json][timeout:25];\n(\n  ${clauses}\n);\nout center tags 200;`;
}

const OVERPASS_TIMEOUT_MS = 20000;

async function overpassFetch(query) {
  const body = `data=${encodeURIComponent(query)}`;
  const controller = new AbortController();

  const attempts = OVERPASS_ENDPOINTS.map((endpoint) =>
    fetchJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      timeoutMs: OVERPASS_TIMEOUT_MS,
      signal: controller.signal,
    }).catch((error) => {
      logger.debug('Overpass endpoint failed', { endpoint, message: error.message });
      throw error;
    })
  );

  try {
    const winner = await Promise.any(attempts);
    return winner;
  } catch (aggregate) {

    const first = aggregate?.errors?.[0];
    throw first || new Error('No Overpass endpoint answered.');
  } finally {

    controller.abort();
  }
}

function readTags(element) {
  const tags = element.tags || {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const address = [street, tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', ');

  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || tags['name:en'] || '',
    lat,
    lng: lon,
    phone: tags.phone || tags['contact:phone'] || tags['emergency:phone'] || '',
    website: tags.website || tags['contact:website'] || '',
    address,
    openingHours: tags.opening_hours || '',
    isEmergency: tags.emergency === 'yes',
    tags,
  };
}

function classify(place, kinds) {
  const tags = place.tags || {};
  for (const kind of kinds) {
    for (const pair of POI_QUERIES[kind] || []) {
      const [key, value] = pair.split('=');
      if (tags[key] === value) return kind;
    }
  }
  return null;
}

async function findNearbyMany(kinds, centre, radiusMeters = 5000) {
  const wanted = [...new Set(kinds)];

  for (const kind of wanted) {
    if (!POI_QUERIES[kind]) {
      throw AppError.badRequest(
        `Unknown category. Try one of: ${Object.keys(POI_QUERIES).join(', ')}.`
      );
    }
  }

  const point = parseCoordinates(centre);
  if (!point) throw AppError.badRequest('A valid location is required to search nearby.');

  const radius = Math.min(LIMITS.NEARBY_MAX_RADIUS_M, Math.max(200, Number(radiusMeters) || 5000));

  const key = `poi:${[...wanted].sort().join('+')}:${point.lat.toFixed(2)}:${point.lng.toFixed(2)}:${radius}`;

  const cached = poiCache.get(key);
  if (cached !== undefined) return decorateGroups(cached, point, wanted);

  let data;
  try {
    data = await overpassFetch(buildOverpassQuery(wanted, point.lat, point.lng, radius));
  } catch (error) {
    logger.warn(`Overpass lookup failed for ${wanted.join(', ')}`, { message: error.message });

    const stale = poiCache.getStale(key);
    if (stale) {
      logger.info('Serving the last known nearby results while Overpass is unavailable');
      return decorateGroups(stale, point, wanted);
    }

    throw AppError.internal(
      'The map service is not responding right now. Please try again in a moment.',
      { code: 'POI_UNAVAILABLE' }
    );
  }

  const grouped = Object.fromEntries(wanted.map((kind) => [kind, []]));
  const seen = new Set();

  for (const element of data?.elements || []) {
    const place = readTags(element);

    if (!place || !place.name) continue;

    const fingerprint = `${place.name.toLowerCase()}|${place.lat.toFixed(4)}|${place.lng.toFixed(4)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const kind = classify(place, wanted);
    if (!kind) continue;

    delete place.tags;
    grouped[kind].push(place);
  }

  poiCache.set(key, grouped);
  return decorateGroups(grouped, point, wanted);
}

async function findNearby(kind, centre, radiusMeters = 5000) {
  const grouped = await findNearbyMany([kind], centre, radiusMeters);
  return grouped[kind] || [];
}

function decorateGroups(grouped, centre, kinds) {
  return Object.fromEntries(
    kinds.map((kind) => [kind, decorate(grouped[kind] || [], centre, kind)])
  );
}

function decorate(places, centre, kind) {
  return places
    .map((place) => {
      const meters = distanceInMeters(centre, place);
      return {
        ...place,
        kind,
        kindLabel: POI_LABELS[kind] || kind,
        distanceMeters: Math.round(meters),
        distanceLabel: formatDistance(meters),
        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`,
        mapUrl: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=18/${place.lat}/${place.lng}`,
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 40);
}

export { reverseGeocode, searchPlaces, findNearby, findNearbyMany, POI_QUERIES, POI_LABELS };
