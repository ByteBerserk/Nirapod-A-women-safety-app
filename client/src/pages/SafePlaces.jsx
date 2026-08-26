import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { placeApi, userApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import MapView from '../components/map/MapView';
import {
  LoadingState,
  EmptyState,
  ErrorState,
  Modal,
  ConfirmDialog,
  Field,
} from '../components/ui';
import useGeolocation from '../hooks/useGeolocation';
import { timeAgo } from '../utils/format';

/** FR-19 and FR-20: saved places and arrival/departure notifications. */

const TYPE_ICONS = {
  home: '\u{1F3E0}',
  work: '\u{1F3E2}',
  university: '\u{1F393}',
  school: '\u{1F3EB}',
  friend: '\u{1F46F}',
  relative: '\u{1F468}',
  other: '\u{1F4CD}',
};

const EMPTY = {
  label: '',
  type: 'home',
  radiusMeters: 150,
  notifyOnEnter: true,
  notifyOnLeave: true,
  notifyContacts: false,
};

export default function SafePlaces() {
  const { user, patchUser } = useAuth();
  const toast = useToast();
  const { getPosition } = useGeolocation();

  const [places, setPlaces] = useState([]);
  const [events, setEvents] = useState([]);
  const [types, setTypes] = useState([]);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [location, setLocation] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [placeData, eventData] = await Promise.all([
        placeApi.listSafePlaces(),
        placeApi.events({ limit: 10 }),
      ]);

      setPlaces(placeData.places || []);
      setTypes(placeData.types || []);
      setLimit(placeData.limit || 25);
      setEvents(eventData.data?.events || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = async () => {
    setForm(EMPTY);
    setErrors({});
    setEditing('new');

    // Pre-fill with where they are, which is usually where they want the pin.
    try {
      const point = await getPosition({ enableHighAccuracy: false, maximumAge: 120000 });
      setLocation({ lat: point.lat, lng: point.lng });
    } catch {
      setLocation(null);
    }
  };

  const openEdit = (place) => {
    setForm({
      label: place.label,
      type: place.type,
      radiusMeters: place.radiusMeters,
      notifyOnEnter: place.notifyOnEnter,
      notifyOnLeave: place.notifyOnLeave,
      notifyContacts: place.notifyContacts,
    });
    setLocation(place.location);
    setErrors({});
    setEditing(place);
  };

  const save = async (event) => {
    event.preventDefault();

    if (!location) {
      setErrors({ location: 'Please place the pin on the map.' });
      return;
    }

    setSaving(true);
    setErrors({});

    try {
      const payload = { ...form, radiusMeters: Number(form.radiusMeters), ...location };

      const response =
        editing === 'new'
          ? await placeApi.createSafePlace(payload)
          : await placeApi.updateSafePlace(editing.id, payload);

      toast.success(response.message);
      setEditing(null);
      await load();
    } catch (err) {
      setErrors(err.details || { _general: err.message });
    } finally {
      setSaving(false);
    }
  };

  const contactsEnabled = user?.privacyPrefs?.notifyContactsOnSafePlace;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Safe places</h1>
          <p>
            Save the places you go often. Nirapod tells you when you arrive and when you leave, and
            can tell your family too.
          </p>
        </div>
        <button type="button" className="btn" onClick={openNew} disabled={places.length >= limit}>
          Save a place
        </button>
      </div>

      {!contactsEnabled && places.some((p) => p.notifyContacts) && (
        <div className="alert alert-warning">
          <div>
            <strong>Contact notifications are switched off account-wide</strong>
            <span>
              Some places are set to tell your emergency contacts, but the master switch is off.{' '}
              <Link to="/profile">Turn it on in your privacy settings</Link>.
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="grid grid-2">
          <div className="stack">
            {places.length === 0 ? (
              <EmptyState
                icon={'\u{1F3E0}'}
                title="No saved places yet"
                message="Start with home and wherever you work or study. Those two cover most journeys."
                action={
                  <button type="button" className="btn" onClick={openNew}>
                    Save your first place
                  </button>
                }
              />
            ) : (
              places.map((place) => (
                <article key={place.id} className="card place-card">
                  <div className="row-between">
                    <div className="row">
                      <span className="place-type-icon" aria-hidden="true">
                        {TYPE_ICONS[place.type] || TYPE_ICONS.other}
                      </span>
                      <div>
                        <h3 className="mb-0">{place.label}</h3>
                        <span className="tiny muted">
                          {place.radiusMeters} m radius
                          {place.lastTransitionAt && ` · last seen ${timeAgo(place.lastTransitionAt)}`}
                        </span>
                      </div>
                    </div>

                    {place.isInside && <span className="badge badge-success">You are here</span>}
                  </div>

                  {place.address && <p className="small muted mt-3 mb-0">{place.address}</p>}

                  <div className="row mt-3">
                    {place.notifyOnEnter && <span className="badge">Alerts on arrival</span>}
                    {place.notifyOnLeave && <span className="badge">Alerts on leaving</span>}
                    {place.notifyContacts && (
                      <span className="badge badge-info">Tells my contacts</span>
                    )}
                  </div>

                  <div className="row mt-3">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => openEdit(place)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setDeleting(place)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="stack">
            {places.length > 0 && (
              <section className="card">
                <div className="card-header">
                  <h2 className="mb-0">All your places</h2>
                </div>
                <MapView
                  center={places[0].location}
                  zoom={12}
                  height="300px"
                  markers={places.map((place) => ({
                    id: place.id,
                    ...place.location,
                    tone: place.isInside ? 'success' : 'default',
                    glyph: TYPE_ICONS[place.type] || '',
                    title: place.label,
                    popup: <strong>{place.label}</strong>,
                  }))}
                  circles={places.map((place) => ({
                    id: `c-${place.id}`,
                    ...place.location,
                    radius: place.radiusMeters,
                    tone: place.isInside ? 'success' : 'default',
                  }))}
                />
              </section>
            )}

            <section className="card">
              <div className="card-header">
                <h2 className="mb-0">Recent arrivals and departures</h2>
              </div>

              {events.length === 0 ? (
                <p className="muted small mb-0">
                  Nothing recorded yet. Keep the app open in a tab and it will notice when you come
                  and go.
                </p>
              ) : (
                <ul className="event-list">
                  {events.map((event) => (
                    <li key={event.id}>
                      <span className={`event-dot ${event.event}`} aria-hidden="true" />
                      <span className="truncate">
                        <strong className="small">
                          {event.event === 'enter' ? 'Arrived at' : 'Left'} {event.placeLabel}
                        </strong>
                        <span className="tiny muted" style={{ display: 'block' }}>
                          {timeAgo(event.occurredAt)}
                          {event.contactsNotified > 0 &&
                            ` · ${event.contactsNotified} contact${event.contactsNotified === 1 ? '' : 's'} told`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => !saving && setEditing(null)}
        title={editing === 'new' ? 'Save a place' : `Edit "${editing?.label}"`}
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" form="place-form" className="btn" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save place'}
            </button>
          </>
        }
      >
        <form id="place-form" onSubmit={save} noValidate>
          {errors._general && (
            <div className="alert alert-danger" role="alert">
              <span>{errors._general}</span>
            </div>
          )}

          <div className="grid grid-2">
            <Field
              label="Name"
              name="label"
              value={form.label}
              onChange={(event) => setForm((c) => ({ ...c, label: event.target.value }))}
              error={errors.label}
              placeholder="Home"
              required
              autoFocus
            />

            <Field
              label="Type"
              name="type"
              as="select"
              value={form.type}
              onChange={(event) => setForm((c) => ({ ...c, type: event.target.value }))}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </Field>
          </div>

          <div className="field">
            <label htmlFor="place-map">Where is it?</label>
            <p className="hint" style={{ marginTop: 0 }}>
              Tap the map to move the pin.
            </p>
            <div id="place-map">
              <MapView
                center={location}
                zoom={16}
                height="260px"
                onPick={setLocation}
                markers={
                  location ? [{ id: 'pin', ...location, tone: 'success', glyph: '\u{1F4CD}' }] : []
                }
                circles={
                  location
                    ? [{ id: 'fence', ...location, radius: Number(form.radiusMeters), tone: 'success' }]
                    : []
                }
              />
            </div>
            {errors.location && (
              <p className="error" role="alert">
                {errors.location}
              </p>
            )}
          </div>

          <Field
            label={`Radius: ${form.radiusMeters} metres`}
            name="radiusMeters"
            type="range"
            min={50}
            max={2000}
            step={50}
            value={form.radiusMeters}
            onChange={(event) => setForm((c) => ({ ...c, radiusMeters: event.target.value }))}
            hint="A larger radius triggers earlier but is less precise. 150 m suits most homes."
          />

          <h4 className="mt-4">Notifications</h4>

          <label className="checkbox mb-3">
            <input
              type="checkbox"
              checked={form.notifyOnEnter}
              onChange={(event) => setForm((c) => ({ ...c, notifyOnEnter: event.target.checked }))}
            />
            <span>Notify me when I arrive</span>
          </label>

          <label className="checkbox mb-3">
            <input
              type="checkbox"
              checked={form.notifyOnLeave}
              onChange={(event) => setForm((c) => ({ ...c, notifyOnLeave: event.target.checked }))}
            />
            <span>Notify me when I leave</span>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.notifyContacts}
              onChange={(event) => setForm((c) => ({ ...c, notifyContacts: event.target.checked }))}
            />
            <span>
              Email my emergency contacts too
              <span className="hint" style={{ display: 'block' }}>
                {contactsEnabled
                  ? 'They will be emailed each time you arrive or leave.'
                  : 'You will also need to switch this on in your privacy settings.'}
              </span>
            </span>
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await placeApi.deleteSafePlace(deleting.id);
            toast.success(`"${deleting.label}" has been removed.`);
            setDeleting(null);
            await load();
          } catch (err) {
            toast.error(err.message);
          }
        }}
        title="Remove this place?"
        message={`You will stop getting arrival and departure alerts for ${deleting?.label}.`}
        confirmLabel="Remove"
        danger
      />
    </>
  );
}
