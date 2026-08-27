import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { incidentApi, metaApi, placeApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import MapView from '../../components/map/MapView';
import { Field } from '../../components/ui';
import useGeolocation from '../../hooks/useGeolocation';
import { toDateTimeLocal, CATEGORY_ICONS } from '../../utils/format';

const MAX_FILES = 5;
const MAX_FILE_MB = 15;

export default function ReportIncident() {
  const navigate = useNavigate();
  const toast = useToast();
  const { getPosition } = useGeolocation();
  const fileInput = useRef(null);

  const [meta, setMeta] = useState({ incidentCategories: [], incidentSeverities: [] });
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    severity: 'medium',
    occurredAt: toDateTimeLocal(new Date()),
    address: '',
    area: '',
    city: '',
    isAnonymous: false,
  });
  const [location, setLocation] = useState(null);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(true);

  useEffect(() => {
    metaApi.get().then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    getPosition({ enableHighAccuracy: false, maximumAge: 120000 })
      .then((point) => {
        setLocation({ lat: point.lat, lng: point.lng });
        return placeApi.reverse(point.lat, point.lng);
      })
      .then((data) => {
        if (!data) return;
        setForm((current) => ({
          ...current,
          address: current.address || data.address || '',
          area: current.area || data.area || '',
          city: current.city || data.city || '',
        }));
      })
      .catch(() => {})
      .finally(() => setLocating(false));

  }, []);

  useEffect(() => {
    return () => files.forEach((entry) => URL.revokeObjectURL(entry.preview));
  }, [files]);

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const pickLocation = async (point) => {
    setLocation(point);
    setErrors((current) => ({ ...current, location: undefined }));

    try {
      const data = await placeApi.reverse(point.lat, point.lng);
      setForm((current) => ({
        ...current,
        address: data?.address || current.address,
        area: data?.area || current.area,
        city: data?.city || current.city,
      }));
    } catch {

    }
  };

  const addFiles = (event) => {
    const chosen = Array.from(event.target.files || []);
    const accepted = [];

    for (const file of chosen) {
      if (files.length + accepted.length >= MAX_FILES) {
        toast.warning(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`"${file.name}" is larger than ${MAX_FILE_MB} MB.`);
        continue;
      }
      accepted.push({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        id: `${file.name}-${file.size}-${file.lastModified}`,
      });
    }

    setFiles((current) => [...current, ...accepted]);
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeFile = (id) => {
    setFiles((current) => {
      const target = current.find((entry) => entry.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const submit = async (event) => {
    event.preventDefault();

    const found = {};
    if (form.title.trim().length < 5) found.title = 'Please write a short title (5+ characters).';
    if (form.description.trim().length < 20) {
      found.description = 'Please describe what happened in at least 20 characters.';
    }
    if (!form.category) found.category = 'Please choose a category.';
    if (!location) found.location = 'Please place the pin where the incident happened.';

    if (Object.keys(found).length) {
      setErrors(found);

      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {

      const payload = new FormData();
      payload.append('title', form.title.trim());
      payload.append('description', form.description.trim());
      payload.append('category', form.category);
      payload.append('severity', form.severity);
      payload.append('occurredAt', new Date(form.occurredAt).toISOString());
      payload.append('address', form.address);
      payload.append('area', form.area);
      payload.append('city', form.city);
      payload.append('isAnonymous', String(form.isAnonymous));
      payload.append('lat', String(location.lat));
      payload.append('lng', String(location.lng));

      for (const entry of files) payload.append('media', entry.file);

      const response = await incidentApi.create(payload);
      toast.success(response.message);
      navigate(`/incidents/${response.data.incident.id}`, { replace: true });
    } catch (error) {
      setErrors(error.details || {});
      if (!error.details) toast.error(error.message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Report an incident</h1>
          <p>
            What you write appears on the community map. Reports help other people decide which
            street to take.
          </p>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="grid grid-2 report-form">
        <div className="stack">
          <section className="card">
            <h2>What happened</h2>

            <Field
              label="Title"
              name="title"
              value={form.title}
              onChange={update}
              error={errors.title}
              maxLength={140}
              placeholder="Man following women near the bus stop"
              required
            />

            <div className="field">
              <label htmlFor="field-category">
                Category<span aria-hidden="true"> *</span>
              </label>
              <div className="category-grid" id="field-category">
                {meta.incidentCategories.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`category-option ${form.category === item.value ? 'is-active' : ''}`}
                    onClick={() => {
                      setForm((current) => ({ ...current, category: item.value }));
                      setErrors((current) => ({ ...current, category: undefined }));
                    }}
                    aria-pressed={form.category === item.value}
                  >
                    <span aria-hidden="true">{CATEGORY_ICONS[item.value]}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
              {errors.category && (
                <p className="error" role="alert">
                  {errors.category}
                </p>
              )}
            </div>

            <Field
              label="Description"
              name="description"
              as="textarea"
              value={form.description}
              onChange={update}
              error={errors.description}
              maxLength={5000}
              placeholder="Describe what you saw or experienced, and anything that would help someone recognise the situation."
              hint={`${form.description.length} of 5000 characters.`}
              required
              style={{ minHeight: 160 }}
            />

            <div className="grid grid-2">
              <Field
                label="How serious was it?"
                name="severity"
                as="select"
                value={form.severity}
                onChange={update}
              >
                {(meta.incidentSeverities || []).map((level) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </Field>

              <Field
                label="When did it happen?"
                name="occurredAt"
                type="datetime-local"
                value={form.occurredAt}
                onChange={update}
                error={errors.occurredAt}
                max={toDateTimeLocal(new Date())}
              />
            </div>
          </section>

          <section className="card">
            <h2>Evidence (optional)</h2>
            <p className="small muted">
              Photos, video or an audio recording. Up to {MAX_FILES} files, {MAX_FILE_MB} MB each.
            </p>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={files.length >= MAX_FILES}
            >
              Choose files
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,video/*,audio/*"
              onChange={addFiles}
              className="sr-only"
            />

            {files.length > 0 && (
              <ul className="media-preview-list mt-4">
                {files.map((entry) => (
                  <li key={entry.id}>
                    {entry.preview ? (
                      <img src={entry.preview} alt="" />
                    ) : (
                      <span className="media-placeholder" aria-hidden="true">
                        {entry.file.type.startsWith('video/') ? '\u{1F3AC}' : '\u{1F3A4}'}
                      </span>
                    )}
                    <span className="tiny truncate">{entry.file.name}</span>
                    <button
                      type="button"
                      className="media-remove"
                      onClick={() => removeFile(entry.id)}
                    >
                      <span className="sr-only">Remove {entry.file.name}</span>
                      <span aria-hidden="true">&times;</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>Where did it happen?</h2>
            <p className="small muted">
              {locating
                ? 'Finding your location...'
                : 'Tap the map to move the pin to the right spot.'}
            </p>

            <MapView
              center={location}
              zoom={16}
              height="300px"
              onPick={pickLocation}
              markers={
                location
                  ? [{ id: 'pin', ...location, tone: 'danger', glyph: '!', title: 'Incident location' }]
                  : []
              }
            />

            {errors.location && (
              <p className="error mt-3" role="alert">
                {errors.location}
              </p>
            )}

            {location && (
              <p className="tiny muted mono mt-3 mb-0">
                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
              </p>
            )}

            <Field
              label="Address"
              name="address"
              value={form.address}
              onChange={update}
              hint="Filled in from the map. Edit it if it is wrong."
              className="mt-4"
            />
            <div className="grid grid-2">
              <Field label="Area" name="area" value={form.area} onChange={update} />
              <Field label="City" name="city" value={form.city} onChange={update} />
            </div>
          </section>

          <section className="card">
            <h2>Before you post</h2>

            <label className="checkbox mb-4">
              <input
                type="checkbox"
                name="isAnonymous"
                checked={form.isAnonymous}
                onChange={update}
              />
              <span>
                Post anonymously
                <span className="hint" style={{ display: 'block' }}>
                  Your name is hidden from other members. Moderators can still see it, so reports
                  can be traced if they are abused.
                </span>
              </span>
            </label>

            <div className="alert">
              <div>
                <strong>Reports are public</strong>
                <span>
                  Please do not include anyone&rsquo;s full name, address or phone number. Describe
                  what happened, not who someone is.
                </span>
              </div>
            </div>

            <button type="submit" className="btn btn-block" disabled={submitting}>
              {submitting ? <span className="spinner" /> : 'Publish report'}
            </button>
          </section>
        </div>
      </form>
    </>
  );
}
