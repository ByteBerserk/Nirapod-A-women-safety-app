import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkInApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { LoadingState, EmptyState, ErrorState, Field, Pagination } from '../components/ui';
import useGeolocation from '../hooks/useGeolocation';
import { formatDateTime, timeAgo } from '../utils/format';

const PRESETS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 45, label: '45 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
];

const GRACE_OPTIONS = [2, 5, 10, 15, 30];

const STATUS_LABELS = {
  active: 'Running',
  awaiting: 'Waiting for you',
  safe: 'Marked safe',
  cancelled: 'Cancelled',
  escalated: 'Contacts alerted',
};

const STATUS_TONES = {
  active: 'badge-info',
  awaiting: 'badge-warning',
  safe: 'badge-success',
  cancelled: '',
  escalated: 'badge-danger',
};

function countdown(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return '--:--';
  const s = Math.max(0, totalSeconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export default function CheckIn() {
  const toast = useToast();
  const { getPosition } = useGeolocation();

  const [active, setActive] = useState(null);
  const [history, setHistory] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ label: '', minutes: 30, graceMinutes: 5, note: '' });
  const [errors, setErrors] = useState({});

  const [tick, setTick] = useState(0);
  const loadedAt = useRef(Date.now());

  const load = useCallback(async () => {
    setError('');
    try {
      const [current, list] = await Promise.all([
        checkInApi.active(),
        checkInApi.list({ page, limit: 10 }),
      ]);
      loadedAt.current = Date.now();
      setActive(current?.checkIn || null);
      setHistory(list.data?.checkIns || []);
      setMeta(list.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!active?.isOpen) return undefined;
    const display = setInterval(() => setTick((t) => t + 1), 1000);
    const refresh = setInterval(load, 15000);
    return () => {
      clearInterval(display);
      clearInterval(refresh);
    };
  }, [active?.isOpen, load]);

  const remaining = useMemo(() => {
    if (!active?.isOpen) return null;
    const elapsed = Math.floor((Date.now() - loadedAt.current) / 1000);
    const base =
      active.status === 'awaiting' ? active.secondsUntilEscalation : active.secondsUntilDue;
    return base === null || base === undefined ? null : Math.max(0, base - elapsed);

  }, [active, tick]);

  const start = async (event) => {
    event.preventDefault();
    setErrors({});
    setBusy(true);

    try {

      let point = null;
      try {
        point = await getPosition({ enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 });
      } catch {

      }

      const response = await checkInApi.start({
        label: form.label,
        minutes: Number(form.minutes),
        graceMinutes: Number(form.graceMinutes),
        note: form.note,
        ...(point ? { lat: point.lat, lng: point.lng } : {}),
      });

      setActive(response.data.checkIn);
      loadedAt.current = Date.now();
      setForm({ label: '', minutes: 30, graceMinutes: 5, note: '' });

      if (response.data.contactCount === 0) toast.warning(response.message, { duration: 0 });
      else toast.success(response.message);

      load();
    } catch (err) {

      setErrors({ ...(err.details || {}), _general: err.message });
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn, successFallback) => {
    setBusy(true);
    try {
      const response = await fn();
      toast.success(response?.message || successFallback);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState rows={4} />;
  if (error && !active) return <ErrorState message={error} onRetry={load} />;

  const awaiting = active?.status === 'awaiting';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Safety check-in</h1>
          <p>
            Set a timer before you set off. If you do not confirm you are safe when it runs out,
            your emergency contacts are alerted automatically.
          </p>
        </div>
      </div>

      {active ? (
        <section className={`card checkin-live ${awaiting ? 'is-awaiting' : ''}`}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className={`badge ${STATUS_TONES[active.status] || ''}`}>
                {STATUS_LABELS[active.status]}
              </span>
              <h2 className="mt-2 mb-0">{active.label}</h2>
              {active.note && <p className="small muted mt-1 mb-0">{active.note}</p>}
            </div>
          </div>

          <div className="checkin-countdown">
            <span className="checkin-clock" aria-live="polite">
              {countdown(remaining)}
            </span>
            <span className="small muted">
              {awaiting
                ? 'until your contacts are alerted'
                : `until we ask if you are safe · alerts at ${formatDateTime(active.escalateAt)}`}
            </span>
          </div>

          {awaiting && (
            <div className="alert alert-warning" role="alert">
              <span>
                Your check-in is due. Confirm you are safe, or an emergency alert goes out when
                this reaches zero.
              </span>
            </div>
          )}

          <div className="row mt-4" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className="btn btn-success"
              disabled={busy}
              onClick={() => act(() => checkInApi.safe(active.id, {}), 'You are marked safe.')}
            >
              I am safe
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => act(() => checkInApi.extend(active.id, 15), 'Timer extended.')}
            >
              Give me 15 more minutes
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => act(() => checkInApi.cancel(active.id), 'Check-in cancelled.')}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2 className="h4">Start a check-in</h2>

          <form onSubmit={start} noValidate>
            {errors._general && (
              <div className="alert alert-danger" role="alert">
                <span>{errors._general}</span>
              </div>
            )}

            <Field
              label="What are you doing?"
              name="label"
              value={form.label}
              onChange={(e) => setForm((c) => ({ ...c, label: e.target.value }))}
              error={errors.label}
              placeholder="Walking home from campus"
              required
            />

            <div className="field">
              <label htmlFor="minutes-group">Check on me in</label>
              <div className="segmented segmented-wide" id="minutes-group">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.minutes}
                    type="button"
                    className={Number(form.minutes) === preset.minutes ? 'is-active' : ''}
                    onClick={() => setForm((c) => ({ ...c, minutes: preset.minutes }))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Minutes (if none of those fit)"
              name="minutes"
              type="number"
              min="1"
              max="720"
              value={form.minutes}
              onChange={(e) => setForm((c) => ({ ...c, minutes: e.target.value }))}
              error={errors.minutes}
            />

            <Field
              label="How long I get to answer before contacts are alerted"
              name="graceMinutes"
              as="select"
              value={form.graceMinutes}
              onChange={(e) => setForm((c) => ({ ...c, graceMinutes: e.target.value }))}
              error={errors.graceMinutes}
            >
              {GRACE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </Field>

            <Field
              label="Anything your contacts should know"
              name="note"
              as="textarea"
              rows={2}
              value={form.note}
              onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))}
              error={errors.note}
              hint="Included in the alert if this escalates. Your route, who you are meeting."
            />

            <button type="submit" className="btn btn-block" disabled={busy}>
              {busy ? 'Starting...' : 'Start check-in'}
            </button>
          </form>
        </section>
      )}

      <section className="mt-5">
        <h2 className="h4">Past check-ins</h2>

        {history.length === 0 ? (
          <EmptyState
            icon={'\u{23F1}'}
            title="Nothing yet"
            message="Check-ins you have set will be listed here once they are finished."
          />
        ) : (
          <>
            <ul className="plain-list stack mt-3">
              {history.map((item) => (
                <li key={item.id} className="card checkin-row">
                  <div>
                    <span className={`badge ${STATUS_TONES[item.status] || ''}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                    <strong className="ml-2">{item.label}</strong>
                    <p className="tiny muted mt-1 mb-0">
                      Set {timeAgo(item.createdAt)}
                      {item.resolvedAt ? ` · closed ${timeAgo(item.resolvedAt)}` : ''}
                      {item.extensionCount
                        ? ` · extended ${item.extensionCount} time${
                            item.extensionCount === 1 ? '' : 's'
                          }`
                        : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={meta} onChange={setPage} />
          </>
        )}
      </section>
    </>
  );
}
