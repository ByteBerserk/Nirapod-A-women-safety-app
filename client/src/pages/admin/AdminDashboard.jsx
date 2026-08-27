import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import MapView from '../../components/map/MapView';
import { LoadingState, ErrorState } from '../../components/ui';
import { formatNumber } from '../../utils/format';

export default function AdminDashboard() {
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [categories, setCategories] = useState(null);
  const [trends, setTrends] = useState(null);
  const [hotspots, setHotspots] = useState([]);
  const [mail, setMail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {

      const requests = isAdmin
        ? [
            adminApi.dashboard(days),
            adminApi.categories(days),
            adminApi.trends(days),
            adminApi.hotspots({ days: 90 }),
            adminApi.mailQueue(),
          ]
        : [adminApi.listReports({ limit: 1 })];

      const settled = await Promise.allSettled(requests);

      if (isAdmin) {
        const [dash, cats, trend, hot, queue] = settled;
        if (dash.status === 'fulfilled') setStats(dash.value);
        if (cats.status === 'fulfilled') setCategories(cats.value);
        if (trend.status === 'fulfilled') setTrends(trend.value);
        if (hot.status === 'fulfilled') setHotspots(hot.value?.hotspots || []);
        if (queue.status === 'fulfilled') setMail(queue.value);

        if (dash.status === 'rejected') setError(dash.reason?.message || 'Could not load.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState rows={5} />;

  if (!isAdmin) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Moderation</h1>
            <p>Review reported content and manage member accounts.</p>
          </div>
        </div>
        <div className="grid grid-2">
          <Link to="/admin/moderation" className="card quick-action">
            <span className="quick-action-icon" aria-hidden="true">
              {'\u{1F6A9}'}
            </span>
            <div>
              <h3 className="mb-0">Moderation queue</h3>
              <p className="small muted mb-0">Content members have flagged.</p>
            </div>
          </Link>
          <Link to="/admin/users" className="card quick-action">
            <span className="quick-action-icon" aria-hidden="true">
              {'\u{1F465}'}
            </span>
            <div>
              <h3 className="mb-0">Members</h3>
              <p className="small muted mb-0">Search accounts and manage suspensions.</p>
            </div>
          </Link>
        </div>
      </>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Administration</h1>
          <p>How the platform is being used, and what needs attention.</p>
        </div>

        <div className="field mb-0">
          <label htmlFor="period" className="sr-only">
            Reporting period
          </label>
          <select id="period" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {(stats?.moderation.openReports > 0 ||
        stats?.sos.active > 0 ||
        stats?.system.failedEmails > 0) && (
        <div className="attention-row mb-4">
          {stats.sos.active > 0 && (
            <div className="alert alert-danger mb-0">
              <div>
                <strong>{stats.sos.active} SOS alert(s) running right now</strong>
                <span>Someone may need help at this moment.</span>
              </div>
            </div>
          )}
          {stats.moderation.openReports > 0 && (
            <div className="alert alert-warning mb-0">
              <div>
                <strong>{stats.moderation.openReports} flagged item(s) awaiting review</strong>
                <span>
                  <Link to="/admin/moderation">Open the moderation queue</Link>
                </span>
              </div>
            </div>
          )}
          {stats.system.failedEmails > 0 && (
            <div className="alert alert-danger mb-0">
              <div>
                <strong>{stats.system.failedEmails} email(s) could not be delivered</strong>
                <span>
                  Some alerts never reached their recipient.{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={async () => {
                      try {
                        const response = await adminApi.retryMail();
                        toast.success(response.message);
                        load();
                      } catch (err) {
                        toast.error(err.message);
                      }
                    }}
                  >
                    Retry them all
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="grid grid-4">
        <Metric label="Members" value={stats.users.total} sub={`${stats.users.new} new`} trend={stats.users.trend} />
        <Metric
          label="Reports"
          value={stats.incidents.total}
          sub={`${stats.incidents.recent} this period`}
          trend={stats.incidents.trend}
        />
        <Metric label="SOS activations" value={stats.sos.total} sub={`${stats.sos.recent} this period`} />
        <Metric label="Safety groups" value={stats.groups.total} />
      </section>

      <div className="grid grid-2 mt-4">

        <section className="card">
          <div className="card-header">
            <h2 className="mb-0">Activity over time</h2>
          </div>
          {trends?.series?.length ? (
            <TrendChart series={trends.series} />
          ) : (
            <p className="muted small mb-0">Not enough data yet.</p>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="mb-0">What is being reported</h2>
          </div>

          {categories?.categories?.length ? (
            <ul className="breakdown-list">
              {categories.categories.map((entry) => (
                <li key={entry.category}>
                  <div className="row-between">
                    <span className="small">{entry.label}</span>
                    <span className="tiny muted">
                      {entry.count} ({entry.percentage}%)
                    </span>
                  </div>
                  <div className="breakdown-bar">
                    <span style={{ width: `${entry.percentage}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small mb-0">No reports in this period.</p>
          )}
        </section>
      </div>

      <section className="card mt-4">
        <div className="card-header">
          <h2 className="mb-0">High-risk areas (last 90 days)</h2>
          <span className="tiny muted">Grouped to roughly 1 km</span>
        </div>

        {hotspots.length === 0 ? (
          <p className="muted small mb-0">
            No area has had more than one report in the last 90 days.
          </p>
        ) : (
          <div className="grid grid-2">
            <MapView
              center={{ lat: hotspots[0].lat, lng: hotspots[0].lng }}
              zoom={12}
              height="340px"
              markers={hotspots.map((spot, index) => ({
                id: `${spot.lat}-${spot.lng}`,
                lat: spot.lat,
                lng: spot.lng,
                tone: spot.count >= 5 ? 'danger' : 'warning',
                glyph: String(spot.count),
                title: `${spot.count} reports`,
                popup: (
                  <div className="map-popup">
                    <strong>{spot.area || spot.city || `Area ${index + 1}`}</strong>
                    <span className="tiny muted">
                      {spot.count} reports &middot; mostly {spot.topCategoryLabel}
                    </span>
                  </div>
                ),
              }))}
              circles={hotspots.map((spot) => ({
                id: `c-${spot.lat}-${spot.lng}`,
                lat: spot.lat,
                lng: spot.lng,
                radius: 600,
                tone: spot.count >= 5 ? 'danger' : 'warning',
              }))}
            />

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Reports</th>
                    <th>Most common</th>
                  </tr>
                </thead>
                <tbody>
                  {hotspots.slice(0, 10).map((spot) => (
                    <tr key={`${spot.lat}-${spot.lng}`}>
                      <td>
                        {spot.area || spot.city || (
                          <span className="mono tiny">
                            {spot.lat.toFixed(2)}, {spot.lng.toFixed(2)}
                          </span>
                        )}
                      </td>
                      <td>
                        <strong>{spot.count}</strong>
                        {spot.criticalCount > 0 && (
                          <span className="badge badge-danger" style={{ marginLeft: 6 }}>
                            {spot.criticalCount} critical
                          </span>
                        )}
                      </td>
                      <td className="small">{spot.topCategoryLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-3 mt-4">
        <Link to="/admin/moderation" className="card quick-action">
          <span className="quick-action-icon" aria-hidden="true">
            {'\u{1F6A9}'}
          </span>
          <div>
            <h3 className="mb-0">Moderation queue</h3>
            <p className="small muted mb-0">
              {stats.moderation.openReports} item(s) waiting
            </p>
          </div>
        </Link>

        <Link to="/admin/users" className="card quick-action">
          <span className="quick-action-icon" aria-hidden="true">
            {'\u{1F465}'}
          </span>
          <div>
            <h3 className="mb-0">Members</h3>
            <p className="small muted mb-0">
              {formatNumber(stats.users.active)} active, {stats.users.suspended} suspended
            </p>
          </div>
        </Link>

        <Link to="/admin/audit" className="card quick-action">
          <span className="quick-action-icon" aria-hidden="true">
            {'\u{1F4DC}'}
          </span>
          <div>
            <h3 className="mb-0">Audit log</h3>
            <p className="small muted mb-0">Every sensitive action, recorded</p>
          </div>
        </Link>
      </section>

      {mail && (
        <section className="card mt-4">
          <div className="card-header">
            <h2 className="mb-0">Email queue</h2>
            <span className="tiny muted">Alerts are delivered by email, so this matters</span>
          </div>

          <div className="row">
            <span className="badge">Queued: {mail.counts.queued}</span>
            <span className="badge badge-info">Sending: {mail.counts.sending}</span>
            <span className="badge badge-success">Sent: {mail.counts.sent}</span>
            <span className={`badge ${mail.counts.abandoned ? 'badge-danger' : ''}`}>
              Gave up: {mail.counts.abandoned}
            </span>
          </div>

          {mail.recentFailures.length > 0 && (
            <>
              <h4 className="mt-4">Recent failures</h4>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>To</th>
                      <th>Type</th>
                      <th>Tries</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mail.recentFailures.map((failure) => (
                      <tr key={failure.id}>
                        <td className="small">{failure.to}</td>
                        <td className="small">{failure.kind}</td>
                        <td>{failure.attempts}</td>
                        <td className="tiny muted">{failure.lastError}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function Metric({ label, value, sub, trend }) {
  return (
    <div className="card metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{formatNumber(value)}</span>
      <span className="row tiny muted">
        {sub}
        {trend !== undefined && trend !== 0 && (
          <span className={trend > 0 ? 'trend-up' : 'trend-down'}>
            {trend > 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </span>
    </div>
  );
}

function TrendChart({ series }) {
  const width = 560;
  const height = 200;
  const padding = { top: 12, right: 12, bottom: 24, left: 32 };

  const max = Math.max(1, ...series.flatMap((point) => [point.incidents, point.sos, point.signups]));
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const x = (index) =>
    padding.left + (series.length > 1 ? (index / (series.length - 1)) * innerWidth : innerWidth / 2);
  const y = (value) => padding.top + innerHeight - (value / max) * innerHeight;

  const path = (key) =>
    series.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(point[key])}`).join(' ');

  const LINES = [
    { key: 'incidents', colour: '#7b3fa0', label: 'Reports' },
    { key: 'sos', colour: '#c62828', label: 'SOS' },
    { key: 'signups', colour: '#2e7d32', label: 'Sign-ups' },
  ];

  return (
    <>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-chart"
        role="img"
        aria-label={`Daily activity over the last ${series.length} days`}
      >
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(max * ratio)}
              y2={y(max * ratio)}
              stroke="#e3e7ee"
            />
            <text x={4} y={y(max * ratio) + 4} fontSize="10" fill="#79818f">
              {Math.round(max * ratio)}
            </text>
          </g>
        ))}

        {LINES.map((line) => (
          <path
            key={line.key}
            d={path(line.key)}
            fill="none"
            stroke={line.colour}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div className="row chart-legend">
        {LINES.map((line) => (
          <span key={line.key} className="tiny muted">
            <span className="legend-dot" style={{ background: line.colour }} /> {line.label}
          </span>
        ))}
      </div>
    </>
  );
}
