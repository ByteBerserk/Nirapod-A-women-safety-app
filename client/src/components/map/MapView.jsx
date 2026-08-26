import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Leaflet with OpenStreetMap tiles: no API key, no billing account, no usage
 * cap that turns into an invoice. That is the whole reason this is not Google
 * Maps.
 *
 * OSM's tile usage policy asks for sensible volumes and attribution. The
 * attribution is in the TileLayer below and must stay there.
 */

/*
 * Leaflet's default marker icons are resolved relative to the CSS file, which
 * a bundler rewrites, so they 404. Building icons as inline SVG data URLs
 * sidesteps the problem entirely and lets each category have its own colour.
 */
const ICON_COLOURS = {
  default: '#7b3fa0',
  danger: '#c62828',
  success: '#2e7d32',
  warning: '#e65100',
  info: '#1565c0',
  person: '#00695c',
};

function pinSvg(colour, glyph = '') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">
    <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27c0-8.3-6.7-15-15-15z" fill="${colour}"/>
    <circle cx="15" cy="14.5" r="9" fill="#fff" opacity="0.92"/>
    <text x="15" y="19" text-anchor="middle" font-size="12" font-family="sans-serif">${glyph}</text>
  </svg>`;

  return L.icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -38],
  });
}

const iconCache = new Map();

export function markerIcon(tone = 'default', glyph = '') {
  const key = `${tone}|${glyph}`;
  if (!iconCache.has(key)) {
    iconCache.set(key, pinSvg(ICON_COLOURS[tone] || ICON_COLOURS.default, glyph));
  }
  return iconCache.get(key);
}

/** A pulsing dot for "you are here" - visually distinct from a pin. */
const liveIcon = L.divIcon({
  className: 'live-marker',
  html: '<span class="live-marker-dot"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/* ------------------------------------------------------------- helpers --- */

/** Recentres the map when the `center` prop changes, without remounting it. */
function Recenter({ center, zoom }) {
  const map = useMap();
  const lastCenter = useRef(null);

  useEffect(() => {
    if (!center) return;
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`;
    if (lastCenter.current === key) return;

    lastCenter.current = key;
    map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate: true });
  }, [center, zoom, map]);

  return null;
}

/** Lets the parent place a pin by clicking, for the report and safe-place forms. */
function ClickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/** Reports the visible bounds so the parent can reload pins for the area. */
function BoundsWatcher({ onChange }) {
  const map = useMapEvents({
    moveend() {
      const centre = map.getCenter();
      const bounds = map.getBounds();
      onChange?.({
        centre: { lat: centre.lat, lng: centre.lng },
        // Half the diagonal, which is the radius that covers the viewport.
        radius: Math.round(centre.distanceTo(bounds.getNorthEast())),
        zoom: map.getZoom(),
      });
    },
  });
  return null;
}

/** Fixes the grey-tiles problem when a map is rendered inside a hidden panel. */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/* ---------------------------------------------------------------- view --- */

/**
 * @param {object} props
 * @param {{lat:number,lng:number}} props.center
 * @param {number} [props.zoom]
 * @param {string} [props.height]
 * @param {Array}  [props.markers]  { id, lat, lng, tone, glyph, popup, title }
 * @param {Array}  [props.circles]  { id, lat, lng, radius, tone }
 * @param {Array}  [props.polyline] [{ lat, lng }]
 * @param {{lat:number,lng:number}} [props.liveMarker]
 * @param {(point) => void} [props.onPick]
 * @param {(view) => void}  [props.onBoundsChange]
 */
export default function MapView({
  center,
  zoom = 14,
  height = '420px',
  markers = [],
  circles = [],
  polyline = null,
  liveMarker = null,
  onPick = null,
  onBoundsChange = null,
  scrollWheelZoom = true,
  children,
}) {
  const safeCenter = useMemo(
    () =>
      center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
        ? center
        // Dhaka, as a neutral starting point when nothing else is known.
        : { lat: 23.8103, lng: 90.4125 },
    [center]
  );

  const polylinePositions = useMemo(
    () =>
      Array.isArray(polyline) && polyline.length > 1
        ? polyline.map((point) => [point.lat, point.lng])
        : null,
    [polyline]
  );

  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer
        center={[safeCenter.lat, safeCenter.lng]}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        <Recenter center={center} zoom={zoom} />
        <InvalidateOnMount />
        {onPick && <ClickHandler onPick={onPick} />}
        {onBoundsChange && <BoundsWatcher onChange={onBoundsChange} />}

        {circles.map((circle) => (
          <Circle
            key={circle.id}
            center={[circle.lat, circle.lng]}
            radius={circle.radius}
            pathOptions={{
              color: ICON_COLOURS[circle.tone] || ICON_COLOURS.default,
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
        ))}

        {polylinePositions && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{ color: ICON_COLOURS.danger, weight: 4, opacity: 0.75 }}
          />
        )}

        {markers
          .filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng))
          .map((marker) => (
            <Marker
              key={marker.id}
              position={[marker.lat, marker.lng]}
              icon={markerIcon(marker.tone, marker.glyph)}
              title={marker.title}
            >
              {marker.popup && <Popup>{marker.popup}</Popup>}
            </Marker>
          ))}

        {liveMarker && Number.isFinite(liveMarker.lat) && (
          <Marker position={[liveMarker.lat, liveMarker.lng]} icon={liveIcon} zIndexOffset={1000}>
            {liveMarker.popup && <Popup>{liveMarker.popup}</Popup>}
          </Marker>
        )}

        {children}
      </MapContainer>
    </div>
  );
}
