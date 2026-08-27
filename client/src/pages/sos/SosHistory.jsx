import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sosApi } from '../../api/endpoints';
import MapView from '../../components/map/MapView';
import { LoadingState, EmptyState, ErrorState, Modal, Pagination } from '../../components/ui';
import { formatDateTime, formatDuration } from '../../utils/format';

const STATUS_LABELS = {
  active: { text: 'Running', className: 'badge-danger' },
  resolved: { text: 'Marked safe', className: 'badge-success' },
  cancelled: { text: 'Cancelled', className: 'badge' },
  expired: { text: 'Closed automatically', className: 'badge-warning' },
};

export default function SosHistory() {
  const [events, setEvents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await sosApi.history({ page, limit: 10, status: status || undefined });
      setEvents(response.data?.events || []);
      setMeta(response.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id) => {
    try {

      const data = await sosApi.detail(id);
      setSelected(data.sos);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>SOS history</h1>
          <p>Every alert you have raised, with when it happened and how long it ran.</p>
        </div>

        <div className="field mb-0">
          <label htmlFor="status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All alerts</option>
            <option value="resolved">Marked safe</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Closed automatically</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={'\u{1F54A}'}
          title="You have never needed the SOS button"
          message="Long may that continue. If you do use it, every activation will be recorded here."
          action={
            <Link to="/dashboard" className="btn btn-secondary">
              Back to home
            </Link>
          }
        />
      ) : (
        <>
          <div className="stack">
            {events.map((event) => {
              const label = STATUS_LABELS[event.status] || STATUS_LABELS.resolved;

              return (
                <button
                  type="button"
                  key={event.id}
                  className="card sos-history-row"
                  onClick={() => openDetail(event.id)}
                >
                  <div className="sos-history-main">
                    <div className="row">
                      <span className={`badge ${label.className}`}>{label.text}</span>
                      <span className="tiny muted">{formatDateTime(event.startedAt)}</span>
                    </div>

                    <p className="small mb-0 mt-3">
                      {event.message || <span className="muted">No message was added.</span>}
                    </p>

                    <div className="row mt-3 tiny muted">
                      <span>Duration: {formatDuration(event.durationMs)}</span>
                      <span>&middot;</span>
                      <span>
                        {event.contactsDelivered} of {event.contactsNotified} contacts reached
                      </span>
                      {event.trackingViews > 0 && (
                        <>
                          <span>&middot;</span>
                          <span>
                            Link opened {event.trackingViews} time
                            {event.trackingViews === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <span className="sos-history-chevron" aria-hidden="true">
                    &rsaquo;
                  </span>
                </button>
              );
            })}
          </div>

          <Pagination meta={meta} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Alert details"
        size="lg"
      >
        {selected && (
          <>
            <div className="grid grid-2 mb-4">
              <Detail label="Started" value={formatDateTime(selected.startedAt)} />
              <Detail
                label="Closed"
                value={selected.resolvedAt ? formatDateTime(selected.resolvedAt) : 'Still running'}
              />
              <Detail label="Duration" value={formatDuration(selected.durationMs)} />
              <Detail label="Trail points" value={selected.trailPointCount} />
            </div>

            {selected.resolutionNote && (
              <div className="alert alert-success">
                <div>
                  <strong>Your note</strong>
                  <span>{selected.resolutionNote}</span>
                </div>
              </div>
            )}

            {selected.startLocation && (
              <MapView
                center={selected.startLocation}
                zoom={15}
                height="280px"
                scrollWheelZoom={false}
                polyline={selected.trail?.length > 1 ? selected.trail : null}
                markers={[
                  {
                    id: 'start',
                    ...selected.startLocation,
                    tone: 'danger',
                    glyph: 'S',
                    popup: 'Alert raised here',
                  },
                  ...(selected.currentLocation
                    ? [
                        {
                          id: 'end',
                          ...selected.currentLocation,
                          tone: 'success',
                          glyph: 'E',
                          popup: 'Last known position',
                        },
                      ]
                    : []),
                ]}
              />
            )}

            <h3 className="mt-4">Who was notified</h3>
            {selected.notifiedContacts?.length ? (
              <ul className="delivery-list">
                {selected.notifiedContacts.map((contact, index) => (

                  <li key={`${contact.email}-${index}`}>
                    <span className="truncate">
                      <strong>{contact.name || contact.email}</strong>
                      <span className="tiny muted truncate">{contact.email}</span>
                    </span>
                    <span
                      className={`badge ${
                        contact.status === 'sent'
                          ? 'badge-success'
                          : contact.status === 'failed'
                            ? 'badge-danger'
                            : 'badge-warning'
                      }`}
                    >
                      {contact.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">
                Nobody was notified. There were no emergency contacts on the account at the time.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <span className="tiny muted">{label}</span>
      <p className="mb-0 strong">{value}</p>
    </div>
  );
}
