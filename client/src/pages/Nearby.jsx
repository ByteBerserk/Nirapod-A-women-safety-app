import { useCallback, useEffect, useState } from 'react';
import { placeApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import MapView from '../components/map/MapView';
import { LoadingState, EmptyState, Field } from '../components/ui';
import useGeolocation from '../hooks/useGeolocation';

/** FR-18: nearby police stations, hospitals and pharmacies. */

const KINDS = [
  { id: 'police', label: 'Police', icon: '\u{1F46E}', tone: 'info' },
  { id: 'hospital', label: 'Hospitals', icon: '\u{1F3E5}', tone: 'danger' },
  { id: 'pharmacy', label: 'Pharmacies', icon: '\u{1F48A}', tone: 'success' },
];

const RADIUS_OPTIONS = [
  { value: 2000, label: 'Within 2 km' },
  { value: 5000, label: 'Within 5 km' },
  { value: 10000, label: 'Within 10 km' },
  { value: 20000, label: 'Within 20 km' },
];

export default function Nearby() {
  const toast = useToast();
  const { position, getPosition, error: geoError } = useGeolocation();

  const [kind, setKind] = useState('police');
  const [radius, setRadius] = useState(5000);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [centre, setCentre] = useState(null);

  useEffect(() => {
    getPosition({ enableHighAccuracy: false, maximumAge: 120000 })
      .then((point) => setCentre({ lat: point.lat, lng: point.lng }))
      .catch(() => {});
  }, [getPosition]);

  const load = useCallback(async () => {
    if (!centre) return;
    setLoading(true);

    try {
      // One request per category would triple the load on Overpass, which is
      // donated infrastructure. The server fetches all three and caches them.
      const response = await placeApi.nearbyAll({
        lat: centre.lat,
        lng: centre.lng,
        radius,
      });

      setResults(response.data?.results || {});

      if (response.data?.failed?.length) {
        toast.warning(response.message);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [centre, radius, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const places = results[kind] || [];
  const activeKind = KINDS.find((item) => item.id === kind);

  if (!centre) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Find help nearby</h1>
            <p>The closest police stations, hospitals and pharmacies, with directions.</p>
          </div>
        </div>

        <EmptyState
          icon={'\u{1F4CD}'}
          title="We need your location"
          message={
            geoError ||
            'Allow location access so we can show you what is close by. Nothing is stored - the lookup happens and is forgotten.'
          }
          action={
            <button
              type="button"
              className="btn"
              onClick={() =>
                getPosition()
                  .then((point) => setCentre({ lat: point.lat, lng: point.lng }))
                  .catch((err) => toast.error(err.message))
              }
            >
              Use my location
            </button>
          }
        />

        {/*
          Denying the permission used to end the page here, which left the one
          screen that finds a police station unusable to anybody with location
          switched off. Naming the area works just as well.
        */}
        <PlaceSearch onPick={setCentre} />
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Find help nearby</h1>
        </div>

        <div className="field mb-0">
          <label htmlFor="radius" className="sr-only">
            Search radius
          </label>
          <select id="radius" value={radius} onChange={(event) => setRadius(Number(event.target.value))}>
            {RADIUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="segmented segmented-wide mb-4">
        {KINDS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={kind === item.id ? 'is-active' : ''}
            onClick={() => {
              setKind(item.id);
              setSelected(null);
            }}
          >
            <span aria-hidden="true">{item.icon}</span> {item.label}
            {results[item.id]?.length ? (
              <span className="chip-count">{results[item.id].length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid grid-2 nearby-layout">
        <section className="card">
          <MapView
            center={selected ? { lat: selected.lat, lng: selected.lng } : centre}
            zoom={selected ? 17 : 14}
            height="440px"
            liveMarker={{ ...centre, popup: 'You are here' }}
            markers={places.map((place) => ({
              id: place.id,
              lat: place.lat,
              lng: place.lng,
              tone: activeKind.tone,
              glyph: activeKind.icon,
              title: place.name,
              popup: (
                <div className="map-popup">
                  <strong>{place.name}</strong>
                  <span className="tiny muted">{place.distanceLabel} away</span>
                  {place.phone && <a href={`tel:${place.phone}`}>{place.phone}</a>}
                  <a href={place.directionsUrl} target="_blank" rel="noreferrer">
                    Directions
                  </a>
                </div>
              ),
            }))}
          />
        </section>

        <section>
          {loading ? (
            <LoadingState rows={4} />
          ) : places.length === 0 ? (
            <EmptyState
              icon={activeKind.icon}
              title={`No ${activeKind.label.toLowerCase()} found within ${radius / 1000} km`}
              message="Try widening the search radius. OpenStreetMap coverage varies by area, so some places may be missing."
              action={
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setRadius(Math.min(20000, radius * 2))}
                >
                  Search a wider area
                </button>
              }
            />
          ) : (
            <ul className="place-list">
              {places.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    className={`place-row ${selected?.id === place.id ? 'is-active' : ''}`}
                    onClick={() => setSelected(place)}
                  >
                    <span className="place-icon" aria-hidden="true">
                      {activeKind.icon}
                    </span>

                    <span className="place-main">
                      <strong className="truncate">{place.name}</strong>
                      {place.address && <span className="tiny muted truncate">{place.address}</span>}
                      {place.openingHours && (
                        <span className="tiny muted truncate">{place.openingHours}</span>
                      )}
                    </span>

                    <span className="place-distance">{place.distanceLabel}</span>
                  </button>

                  <div className="place-actions">
                    {place.phone && (
                      <a href={`tel:${place.phone}`} className="btn btn-secondary btn-sm">
                        Call
                      </a>
                    )}
                    <a
                      href={place.directionsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      Directions
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <p className="tiny muted center mt-4">
        Place data &copy; OpenStreetMap contributors. Details such as opening hours are contributed
        by volunteers and may be out of date.
      </p>
    </>
  );
}

/**
 * Name an area instead of sharing a location.
 *
 * The Overpass lookup only needs a point, and Nominatim will turn "Dhanmondi,
 * Dhaka" into one. Offering that means a denied location permission no longer
 * makes FR-18 unreachable - which matters most for exactly the person who has
 * location switched off and needs the nearest police station.
 */
function PlaceSearch({ onPick }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 3) {
      toast.info('Type at least three letters of a place name.');
      return;
    }

    setSearching(true);
    try {
      // The endpoint answers { results: [...] }, the same shape the map screen reads.
      const found = (await placeApi.search(term))?.results || [];
      setMatches(found);
      if (!found.length) toast.info('No place matched that name. Try a nearby landmark.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="card mt-4">
      <h2 className="h4">Or search for an area</h2>
      <p className="small muted">
        Enter a neighbourhood, city or landmark and we will look around that point instead.
      </p>

      <form onSubmit={submit} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Field
            label="Place name"
            name="place"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Dhanmondi, Dhaka"
          />
        </div>
        <button type="submit" className="btn" disabled={searching}>
          {searching ? 'Searching...' : 'Search'}
        </button>
      </form>

      {matches.length > 0 && (
        <ul className="plain-list mt-3">
          {matches.map((match) => (
            <li key={`${match.lat},${match.lng}`}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onPick({ lat: match.lat, lng: match.lng })}
              >
                {match.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
