import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { incidentApi, metaApi, placeApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import MapView from '../components/map/MapView';
import useGeolocation from '../hooks/useGeolocation';
import { timeAgo, CATEGORY_ICONS } from '../utils/format';

const TONE_BY_SEVERITY = {
  low: 'info',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export default function SafetyMap() {
  const toast = useToast();
  const { position, getPosition } = useGeolocation();

  const [centre, setCentre] = useState(null);
  const [view, setView] = useState(null);
  const [pins, setPins] = useState([]);
  const [counts, setCounts] = useState({ total: 0, byCategory: {} });
  const [categories, setCategories] = useState([]);
  const [activeCategories, setActiveCategories] = useState([]);
  const [days, setDays] = useState(365);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);

  const debounce = useRef(null);

  useEffect(() => {
    metaApi
      .get()
      .then((data) => setCategories(data.incidentCategories || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getPosition({ enableHighAccuracy: false, maximumAge: 300000 })
      .then((point) => setCentre({ lat: point.lat, lng: point.lng }))
      .catch(() => {

        setCentre({ lat: 23.8103, lng: 90.4125 });
      });
  }, [getPosition]);

  const loadPins = useCallback(
    async (target) => {
      if (!target?.centre) return;
      setLoading(true);

      try {
        const data = await incidentApi.mapPins({
          lat: target.centre.lat,
          lng: target.centre.lng,
          radius: Math.min(50000, Math.max(1000, target.radius || 5000)),
          days,
          category: activeCategories.length ? activeCategories.join(',') : undefined,
          limit: 500,
        });

        setPins(data.pins || []);
        setCounts(data.counts || { total: 0, byCategory: {} });
        setTruncated(Boolean(data.truncated));
      } catch (error) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    },
    [days, activeCategories, toast]
  );

  useEffect(() => {
    if (centre && !view) loadPins({ centre, radius: 5000 });

  }, [centre]);

  useEffect(() => {
    if (view) loadPins(view);
    else if (centre) loadPins({ centre, radius: 5000 });

  }, [days, activeCategories]);

  const onBoundsChange = useCallback(
    (next) => {
      setView(next);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => loadPins(next), 600);
    },
    [loadPins]
  );

  useEffect(() => () => debounce.current && clearTimeout(debounce.current), []);

  const searchPlace = async (event) => {
    event.preventDefault();
    if (searchTerm.trim().length < 3) return;

    setSearching(true);
    try {
      const data = await placeApi.search(searchTerm.trim());
      const first = data?.results?.[0];

      if (!first) {
        toast.warning('We could not find that place. Try adding the city name.');
        return;
      }
      setCentre({ lat: first.lat, lng: first.lng });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSearching(false);
    }
  };

  const toggleCategory = (value) => {
    setActiveCategories((current) =>
      current.includes(value) ? current.filter((c) => c !== value) : [...current, value]
    );
  };

  const markers = pins.map((pin) => ({
    id: pin.id,
    lat: pin.lat,
    lng: pin.lng,
    tone: TONE_BY_SEVERITY[pin.severity] || 'warning',
    glyph: pin.status === 'verified' ? '✓' : '',
    title: pin.title,
    popup: (
      <div className="map-popup">
        <strong>{pin.title}</strong>
        <span className="tiny muted">
          {CATEGORY_ICONS[pin.category]} {pin.category.replace(/-/g, ' ')} &middot;{' '}
          {timeAgo(pin.occurredAt)}
        </span>
        {pin.status === 'verified' && <span className="badge badge-success">Verified</span>}
        <Link to={`/incidents/${pin.id}`}>Read the full report</Link>
      </div>
    ),
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Community safety map</h1>
          <p>
            Every pin is something a member reported. Move the map to load a different area.
          </p>
        </div>
        <Link to="/incidents/new" className="btn">
          Report an incident
        </Link>
      </div>

      <div className="card filter-bar">
        <form className="search-row" onSubmit={searchPlace}>
          <label htmlFor="map-search" className="sr-only">
            Search for a place
          </label>
          <input
            id="map-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Jump to an area, e.g. Dhanmondi, Dhaka"
          />
          <button type="submit" className="btn btn-secondary" disabled={searching}>
            {searching ? <span className="spinner spinner-dark" /> : 'Go'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => position && setCentre({ lat: position.lat, lng: position.lng })}
            disabled={!position}
          >
            My location
          </button>
        </form>

        <div className="filter-chips">
          {categories.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`chip ${activeCategories.includes(item.value) ? 'is-active' : ''}`}
              onClick={() => toggleCategory(item.value)}
            >
              <span aria-hidden="true">{CATEGORY_ICONS[item.value]}</span> {item.label}
              {counts.byCategory[item.value] ? (
                <span className="chip-count">{counts.byCategory[item.value]}</span>
              ) : null}
            </button>
          ))}

          <span className="spacer" />

          <label htmlFor="map-days" className="sr-only">
            Time range
          </label>
          <select
            id="map-days"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="chip-select"
          >
            <option value={7}>Last week</option>
            <option value={30}>Last month</option>
            <option value={90}>Last 3 months</option>
            <option value={365}>Last year</option>
            <option value={1825}>Everything</option>
          </select>
        </div>
      </div>

      <div className="map-page-body">
        <MapView
          center={centre}
          zoom={14}
          height="min(68vh, 640px)"
          markers={markers}
          liveMarker={position ? { lat: position.lat, lng: position.lng, popup: 'You are here' } : null}
          onBoundsChange={onBoundsChange}
        />

        <div className="map-status">
          {loading ? (
            <span className="row">
              <span className="spinner spinner-dark" /> Loading reports...
            </span>
          ) : (
            <span>
              Showing <strong>{counts.total}</strong> report{counts.total === 1 ? '' : 's'} in this
              area.
              {truncated && ' Zoom in to see them all.'}
            </span>
          )}
        </div>
      </div>

      <div className="map-legend card mt-4">
        <h3 className="mb-3">How to read the map</h3>
        <ul className="legend-list">
          <li>
            <span className="legend-dot" style={{ background: '#1565c0' }} /> Low severity
          </li>
          <li>
            <span className="legend-dot" style={{ background: '#e65100' }} /> Medium severity
          </li>
          <li>
            <span className="legend-dot" style={{ background: '#c62828' }} /> High or critical
          </li>
          <li>
            <span className="legend-check">{'✓'}</span> Checked by a moderator
          </li>
        </ul>
        <p className="tiny muted mb-0">
          Reports are submitted by members and are not verified unless marked. Treat an unverified
          pin as a warning worth knowing, not as established fact.
        </p>
      </div>
    </>
  );
}
