import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { contactApi, incidentApi, placeApi, groupApi } from '../api/endpoints';
import { SosButton } from '../components/sos/SosButton';
import { LoadingState } from '../components/ui';
import useGeolocation from '../hooks/useGeolocation';
import { timeAgo, CATEGORY_ICONS, formatDistance } from '../utils/format';

export default function Dashboard() {
  const { user } = useAuth();
  const { position, getPosition } = useGeolocation();

  const [contacts, setContacts] = useState(null);
  const [nearbyIncidents, setNearbyIncidents] = useState([]);
  const [groupCount, setGroupCount] = useState(0);
  const [safePlaceCount, setSafePlaceCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {

      const [contactResult, groupResult, placeResult] = await Promise.allSettled([
        contactApi.list(),
        groupApi.list(),
        placeApi.listSafePlaces(),
      ]);

      if (cancelled) return;

      if (contactResult.status === 'fulfilled') setContacts(contactResult.value);
      if (groupResult.status === 'fulfilled') {
        setGroupCount((groupResult.value?.groups || []).length);
      }
      if (placeResult.status === 'fulfilled') {
        setSafePlaceCount((placeResult.value?.places || []).length);
      }

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    getPosition({ enableHighAccuracy: false, maximumAge: 300000 })
      .then((point) =>
        incidentApi.list({
          lat: point.lat,
          lng: point.lng,
          radius: 3000,
          limit: 4,
          sort: '-occurredAt',
        })
      )
      .then((response) => {
        if (!cancelled) setNearbyIncidents(response?.data?.incidents || []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [getPosition]);

  const activeContacts = contacts?.activeCount ?? 0;
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hello, {firstName}</h1>
          <p>
            {activeContacts > 0
              ? `${activeContacts} emergency contact${activeContacts === 1 ? '' : 's'} will be emailed the moment you press SOS.`
              : 'Add an emergency contact so the SOS button has someone to alert.'}
          </p>
        </div>
      </div>

      <section className="sos-panel card">
        <SosButton size="large" />

        <div className="sos-panel-side">
          <h2>Emergency SOS</h2>
          <p className="small muted">
            Press and hold for a moment. Everyone on your contact list receives an email with
            your live location, your blood group and your medical notes. Your location keeps
            updating until you mark yourself safe.
          </p>

          {activeContacts === 0 && (
            <div className="alert alert-warning mb-0">
              <div>
                <strong>No contacts yet</strong>
                <span>
                  The button works, but nobody would be emailed.{' '}
                  <Link to="/contacts">Add someone now</Link>.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-4 mt-4">
        <StatCard
          to="/contacts"
          icon={'\u{1F46A}'}
          value={activeContacts}
          label="Emergency contacts"
          tone={activeContacts === 0 ? 'warning' : 'ok'}
        />
        <StatCard to="/groups" icon={'\u{1F465}'} value={groupCount} label="Safety groups" />
        <StatCard to="/safe-places" icon={'\u{1F4CD}'} value={safePlaceCount} label="Safe places" />
        <StatCard to="/check-in" icon={'\u{23F1}'} value="Set" label="Safety check-in" />
      </section>

      <section className="card mt-4">
        <div className="card-header">
          <h2>Reported near you</h2>
          <Link to="/map" className="small">
            Open the map
          </Link>
        </div>

        {loading ? (
          <LoadingState rows={2} />
        ) : !position ? (
          <p className="muted small mb-0">
            Allow location access to see what has been reported around you.
          </p>
        ) : nearbyIncidents.length === 0 ? (
          <p className="muted small mb-0">
            Nothing has been reported within 3 km recently. That is good news.
          </p>
        ) : (
          <ul className="incident-mini-list">
            {nearbyIncidents.map((incident) => (
              <li key={incident.id}>
                <Link to={`/incidents/${incident.id}`} className="incident-mini">
                  <span className="incident-mini-icon" aria-hidden="true">
                    {CATEGORY_ICONS[incident.category] || CATEGORY_ICONS.other}
                  </span>
                  <span className="incident-mini-body">
                    <strong className="truncate">{incident.title}</strong>
                    <span className="tiny muted">
                      {incident.area || incident.city || 'Nearby'} &middot;{' '}
                      {timeAgo(incident.occurredAt)}
                    </span>
                  </span>
                  {incident.status === 'verified' && (
                    <span className="badge badge-success">Verified</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-3 mt-4">
        <QuickAction
          to="/incidents/new"
          icon={'\u{1F4DD}'}
          title="Report an incident"
          body="Warn the people who walk the same streets."
        />
        <QuickAction
          to="/nearby"
          icon={'\u{1F3E5}'}
          title="Find help nearby"
          body="The closest police station, hospital and pharmacy."
        />
        <QuickAction
          to="/resources"
          icon={'\u{1F4D8}'}
          title="Safety guides"
          body="Practical advice, self-defence and your legal rights."
        />
      </section>
    </>
  );
}

function StatCard({ to, icon, value, label, tone }) {
  return (
    <Link to={to} className={`stat-card ${tone === 'warning' ? 'stat-card-warning' : ''}`}>
      <span className="stat-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </Link>
  );
}

function QuickAction({ to, icon, title, body }) {
  return (
    <Link to={to} className="card quick-action">
      <span className="quick-action-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3 className="mb-0">{title}</h3>
        <p className="small muted mb-0">{body}</p>
      </div>
    </Link>
  );
}
