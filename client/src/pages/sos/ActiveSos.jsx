import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSos } from '../../context/SosContext';
import { useToast } from '../../context/ToastContext';
import { sosApi } from '../../api/endpoints';
import MapView from '../../components/map/MapView';
import { Modal, EmptyState, useCopy } from '../../components/ui';
import { formatDateTime, formatDuration, timeAgo } from '../../utils/format';

/**
 * The screen while an alert is running. It answers the three questions someone
 * will actually have: is my location going out, who has been told, and how do I
 * stop this.
 */
export default function ActiveSos() {
  const { activeSos, trackingUrl, resolveSos } = useSos();
  const toast = useToast();
  const navigate = useNavigate();
  const copy = useCopy();

  const [alertStatus, setAlertStatus] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState('');
  const [elapsed, setElapsed] = useState(0);

  /* Delivery status, refreshed while the queue is still working through it. */
  useEffect(() => {
    if (!activeSos) return undefined;

    let cancelled = false;
    const load = () =>
      sosApi
        .alertStatus(activeSos.id)
        .then((data) => !cancelled && setAlertStatus(data))
        .catch(() => {});

    load();
    const timer = setInterval(load, 15000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSos?.id]);

  /* A running clock, so the elapsed time is not frozen at page load. */
  useEffect(() => {
    if (!activeSos?.startedAt) return undefined;

    const tick = () => setElapsed(Date.now() - new Date(activeSos.startedAt).getTime());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeSos?.startedAt]);

  if (!activeSos) {
    return (
      <EmptyState
        icon={'✅'}
        title="No alert is running"
        message="You are not currently sharing an emergency. Your SOS button is ready if you need it."
        action={
          <Link to="/dashboard" className="btn">
            Back to home
          </Link>
        }
      />
    );
  }

  const location = activeSos.currentLocation || activeSos.startLocation;
  const trail = activeSos.trail || [];

  const confirmSafe = async () => {
    setResolving(true);
    const result = await resolveSos({ note });
    setResolving(false);
    setConfirmOpen(false);

    if (result) navigate('/sos/history');
  };

  return (
    <>
      <div className="active-sos-header">
        <div>
          <span className="badge badge-danger">
            <span className="sos-banner-dot" aria-hidden="true" /> Alert is live
          </span>
          <h1 className="mt-3">Your contacts can see where you are</h1>
          <p className="muted small mb-0">
            Started {formatDateTime(activeSos.startedAt)} &middot; running for{' '}
            {formatDuration(elapsed)}
          </p>
        </div>

        <button type="button" className="btn btn-lg" onClick={() => setConfirmOpen(true)}>
          I am safe now
        </button>
      </div>

      <div className="grid grid-2 mt-4">
        {/* --------------------------------------------------------- map --- */}
        <section className="card">
          <div className="card-header">
            <h2>Your live location</h2>
            <span className="tiny muted">
              {trail.length} point{trail.length === 1 ? '' : 's'} recorded
            </span>
          </div>

          {location ? (
            <>
              <MapView
                center={location}
                zoom={16}
                height="340px"
                liveMarker={{ ...location, popup: 'You are here' }}
                polyline={trail.length > 1 ? trail : null}
                markers={
                  activeSos.startLocation
                    ? [
                        {
                          id: 'start',
                          ...activeSos.startLocation,
                          tone: 'warning',
                          glyph: 'S',
                          popup: 'Where the alert started',
                        },
                      ]
                    : []
                }
              />
              <p className="tiny muted mt-3 mb-0">
                Updating every 10 seconds. Keep this tab open so the trail keeps moving. Last
                update {location.updatedAt ? timeAgo(location.updatedAt) : 'just now'}.
              </p>
            </>
          ) : (
            <p className="muted mb-0">Waiting for a location fix...</p>
          )}
        </section>

        {/* ------------------------------------------------------ status --- */}
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>Who has been told</h2>
              {alertStatus && (
                <span className="badge">
                  {alertStatus.summary.sent} of {alertStatus.summary.total} delivered
                </span>
              )}
            </div>

            {!alertStatus ? (
              <p className="muted small mb-0">Checking delivery...</p>
            ) : alertStatus.recipients.length === 0 ? (
              <div className="alert alert-warning mb-0">
                <div>
                  <strong>Nobody was emailed</strong>
                  <span>
                    You have no emergency contacts. <Link to="/contacts">Add one</Link> so this
                    does not happen again.
                  </span>
                </div>
              </div>
            ) : (
              <>
                <ul className="delivery-list">
                  {alertStatus.recipients.map((recipient) => (
                    <li key={`${recipient.email}-${recipient.kind}`}>
                      <span className="truncate">
                        <strong>{recipient.name || recipient.email}</strong>
                        <span className="tiny muted truncate">{recipient.email}</span>
                      </span>
                      <DeliveryBadge status={recipient.status} attempts={recipient.attempts} />
                    </li>
                  ))}
                </ul>

                {alertStatus.summary.failed > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-block mt-3"
                    onClick={async () => {
                      try {
                        const response = await sosApi.resend(activeSos.id);
                        toast.success(response.message);
                      } catch (error) {
                        toast.error(error.message);
                      }
                    }}
                  >
                    Retry {alertStatus.summary.failed} failed email(s)
                  </button>
                )}
              </>
            )}
          </section>

          {trackingUrl && (
            <section className="card">
              <div className="card-header">
                <h2>Share the tracking link</h2>
              </div>
              <p className="small muted">
                Anyone with this link sees your live position without needing an account. It stops
                working the moment you mark yourself safe.
              </p>
              <div className="copy-row">
                <input type="text" readOnly value={trackingUrl} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => copy(trackingUrl, 'Tracking link copied.')}
                >
                  Copy
                </button>
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-header">
              <h2>Call for help</h2>
            </div>
            <p className="small muted">
              Nirapod tells the people who care about you. It does not dispatch an ambulance.
            </p>
            <div className="row">
              <a href="tel:999" className="btn btn-danger">
                Call 999
              </a>
              <Link to="/nearby" className="btn btn-secondary">
                Nearest police station
              </Link>
            </div>
          </section>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => !resolving && setConfirmOpen(false)}
        title="Mark yourself as safe"
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={resolving}
            >
              Keep the alert running
            </button>
            <button type="button" className="btn" onClick={confirmSafe} disabled={resolving}>
              {resolving ? <span className="spinner" /> : 'Yes, I am safe'}
            </button>
          </>
        }
      >
        <p>
          Everyone who was alerted will be emailed to say you are safe, and the live tracking link
          will stop working.
        </p>
        <div className="field mb-0">
          <label htmlFor="resolve-note">Add a note (optional)</label>
          <textarea
            id="resolve-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Home now, everything is fine."
            style={{ minHeight: 80 }}
          />
        </div>
      </Modal>
    </>
  );
}

function DeliveryBadge({ status, attempts }) {
  if (status === 'sent') return <span className="badge badge-success">Delivered</span>;
  if (status === 'abandoned') {
    return <span className="badge badge-danger">Failed after {attempts} tries</span>;
  }
  if (status === 'sending') return <span className="badge badge-info">Sending</span>;
  return <span className="badge badge-warning">Queued</span>;
}
