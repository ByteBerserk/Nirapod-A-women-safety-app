import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { sosApi } from '../../api/endpoints';
import MapView from '../../components/map/MapView';
import { formatDateTime, timeAgo } from '../../utils/format';

export default function TrackSos() {
  const { token } = useParams();

  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    sosApi
      .track(token)
      .then((data) => {
        if (cancelled) return;
        setTracking(data.tracking);
        setLastUpdate(data.tracking?.currentLocation?.updatedAt || data.tracking?.startedAt);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!tracking || tracking.status !== 'active') return undefined;

    const socket = io({ transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const join = () => {
      socket.emit('sos:watch', { token }, (response) => {
        setLive(Boolean(response?.ok));
      });
    };

    socket.on('connect', join);
    socket.on('disconnect', () => setLive(false));

    socket.on('sos:location', (point) => {
      setTracking((current) =>
        current
          ? {
              ...current,
              currentLocation: { lat: point.lat, lng: point.lng, accuracy: point.accuracy },
              trail: [...(current.trail || []), { lat: point.lat, lng: point.lng }],
            }
          : current
      );
      setLastUpdate(point.recordedAt || new Date().toISOString());
    });

    socket.on('sos:resolved', (payload) => {
      setTracking((current) =>
        current ? { ...current, status: payload.status, resolvedAt: payload.resolvedAt } : current
      );
      setLive(false);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tracking?.status, token]);

  useEffect(() => {
    if (!tracking || tracking.status !== 'active' || live) return undefined;

    const timer = setInterval(() => {
      sosApi
        .track(token)
        .then((data) => {
          setTracking(data.tracking);
          setLastUpdate(data.tracking?.currentLocation?.updatedAt);
        })
        .catch(() => {});
    }, 20000);

    return () => clearInterval(timer);
  }, [tracking?.status, live, token]);

  if (loading) {
    return (
      <div className="track-page">
        <div className="track-card center">
          <span className="spinner spinner-dark" style={{ width: 28, height: 28, margin: '0 auto' }} />
          <p className="muted mt-3 mb-0">Loading the alert...</p>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="track-page">
        <div className="track-card">
          <h1>This link is no longer active</h1>
          <p className="muted">
            {error || 'The alert may have been closed, or the link may have expired.'}
          </p>
          <p className="small muted mb-0">
            Tracking links stop working as soon as the person marks themselves safe, and expire on
            their own after 24 hours. If you are still worried, call them directly.
          </p>
        </div>
      </div>
    );
  }

  const { person, currentLocation, startLocation, trail, status } = tracking;
  const point = currentLocation || startLocation;
  const isActive = status === 'active';

  return (
    <div className="track-page">
      <header className={`track-header ${isActive ? 'is-active' : 'is-resolved'}`}>
        <div className="track-header-inner">
          <div>
            <span className="brand brand-light">
              <span className="brand-mark" aria-hidden="true">
                {'\u{1F6E1}'}
              </span>
              <span className="brand-name">Nirapod</span>
            </span>
            <h1>
              {isActive
                ? `${person.name} needs help`
                : `${person.name} has marked themselves safe`}
            </h1>
            <p className="mb-0">
              {isActive ? (
                <>
                  Alert raised {formatDateTime(tracking.startedAt)}.
                  {live ? ' Location is updating live.' : ' Refreshing every 20 seconds.'}
                </>
              ) : (
                <>The alert was closed {formatDateTime(tracking.resolvedAt)}.</>
              )}
            </p>
          </div>

          {isActive && (
            <span className="track-live-pill">
              <span className="sos-banner-dot" aria-hidden="true" />
              {live ? 'LIVE' : 'POLLING'}
            </span>
          )}
        </div>
      </header>

      <main className="track-body">
        {tracking.message && (
          <div className="alert alert-danger">
            <div>
              <strong>Their message</strong>
              <span>&ldquo;{tracking.message}&rdquo;</span>
            </div>
          </div>
        )}

        <div className="track-grid">
          <section className="track-card track-map-card">
            {point ? (
              <MapView
                center={point}
                zoom={16}
                height="100%"
                liveMarker={{ ...point, popup: `${person.name} is here` }}
                polyline={trail && trail.length > 1 ? trail : null}
                markers={
                  startLocation
                    ? [
                        {
                          id: 'start',
                          ...startLocation,
                          tone: 'warning',
                          glyph: 'S',
                          popup: 'Where the alert started',
                        },
                      ]
                    : []
                }
              />
            ) : (
              <div className="empty">
                <p className="mb-0">No location was available for this alert.</p>
              </div>
            )}
          </section>

          <div className="stack">
            <section className="track-card">
              <h2>What to do</h2>
              <ol className="track-steps">
                <li>
                  <strong>Call {person.name} first.</strong>
                  {person.phone ? (
                    <a href={`tel:${person.phone}`} className="btn btn-block mt-3">
                      Call {person.phone}
                    </a>
                  ) : (
                    <span className="small muted"> No phone number on their profile.</span>
                  )}
                </li>
                <li>
                  <strong>If you cannot reach them,</strong> call your local emergency number and
                  read out the coordinates below.
                </li>
                <li>
                  <strong>If you are nearby and it is safe,</strong> go to them.
                </li>
              </ol>
            </section>

            <section className="track-card">
              <h2>Details a responder will ask for</h2>
              <dl className="track-details">
                <div>
                  <dt>Name</dt>
                  <dd>{person.name}</dd>
                </div>
                {person.phone && (
                  <div>
                    <dt>Phone</dt>
                    <dd>
                      <a href={`tel:${person.phone}`}>{person.phone}</a>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Blood group</dt>
                  <dd>
                    {person.bloodGroup && person.bloodGroup !== 'unknown'
                      ? person.bloodGroup
                      : 'Not provided'}
                  </dd>
                </div>
                <div>
                  <dt>Medical notes</dt>
                  <dd>{person.medicalInfo || 'None recorded'}</dd>
                </div>
                {point && (
                  <div>
                    <dt>Coordinates</dt>
                    <dd className="mono">
                      {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
                    </dd>
                  </div>
                )}
                {lastUpdate && (
                  <div>
                    <dt>Last update</dt>
                    <dd>{timeAgo(lastUpdate)}</dd>
                  </div>
                )}
              </dl>

              {point && (
                <div className="row mt-3">
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions
                  </a>
                  <a
                    className="btn btn-secondary btn-sm"
                    href={`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=17/${point.lat}/${point.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in OpenStreetMap
                  </a>
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="track-footer">
          Sent by Nirapod, a community safety app. This page is a live view shared with you by{' '}
          {person.name}. It stops working when they mark themselves safe.
        </footer>
      </main>
    </div>
  );
}
