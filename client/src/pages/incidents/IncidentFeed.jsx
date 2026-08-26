import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { incidentApi, metaApi } from '../../api/endpoints';
import { LoadingState, EmptyState, ErrorState, Pagination, Avatar } from '../../components/ui';
import useGeolocation from '../../hooks/useGeolocation';
import { timeAgo, CATEGORY_ICONS, SEVERITY_STYLE, STATUS_STYLE } from '../../utils/format';

/** FR-9: search and browse what the community has reported. */

export default function IncidentFeed() {
  const [params, setParams] = useSearchParams();
  const { position, getPosition } = useGeolocation();

  const [incidents, setIncidents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Search text is held locally and only pushed to the URL on submit, so the
  // list does not re-request on every keystroke.
  const [searchTerm, setSearchTerm] = useState(params.get('q') || '');
  const [nearMe, setNearMe] = useState(false);

  const page = Number(params.get('page')) || 1;
  const category = params.get('category') || '';
  const query = params.get('q') || '';

  useEffect(() => {
    metaApi
      .get()
      .then((data) => setCategories(data.incidentCategories || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const request = { page, limit: 12, q: query || undefined, category: category || undefined };

      if (nearMe) {
        const point = position || (await getPosition({ enableHighAccuracy: false }));
        request.lat = point.lat;
        request.lng = point.lng;
        request.radius = 5000;
      }

      const response = await incidentApi.list(request);
      setIncidents(response.data?.incidents || []);
      setMeta(response.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query, category, nearMe]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change resets to the first page, otherwise you can land on
    // page 7 of a 2-page result and see nothing.
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Community reports</h1>
          <p>What people have reported around them. Search by place, area or keyword.</p>
        </div>
        <Link to="/incidents/new" className="btn">
          Report an incident
        </Link>
      </div>

      <div className="card filter-bar">
        <form
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault();
            setParam('q', searchTerm.trim());
          }}
        >
          <label htmlFor="incident-search" className="sr-only">
            Search reports
          </label>
          <input
            id="incident-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search by keyword, street or area"
          />
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>

        <div className="filter-chips">
          <button
            type="button"
            className={`chip ${!category ? 'is-active' : ''}`}
            onClick={() => setParam('category', '')}
          >
            All
          </button>
          {categories.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`chip ${category === item.value ? 'is-active' : ''}`}
              onClick={() => setParam('category', category === item.value ? '' : item.value)}
            >
              <span aria-hidden="true">{CATEGORY_ICONS[item.value]}</span> {item.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${nearMe ? 'is-active' : ''}`}
            onClick={() => setNearMe((on) => !on)}
          >
            <span aria-hidden="true">{'\u{1F4CD}'}</span> Within 5 km
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : incidents.length === 0 ? (
        <EmptyState
          icon={'\u{1F50D}'}
          title="No reports match"
          message={
            query || category || nearMe
              ? 'Try a different search or clear the filters.'
              : 'Nothing has been reported yet. If something happened to you, telling people helps.'
          }
          action={
            <Link to="/incidents/new" className="btn">
              Report an incident
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-2">
            {incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
          <Pagination meta={meta} onChange={(next) => setParam('page', next)} />
        </>
      )}
    </>
  );
}

function IncidentCard({ incident }) {
  const severity = SEVERITY_STYLE[incident.severity] || SEVERITY_STYLE.medium;
  const status = STATUS_STYLE[incident.status];

  return (
    <Link to={`/incidents/${incident.id}`} className="card incident-card">
      {incident.thumbnail && (
        <img className="incident-thumb" src={incident.thumbnail} alt="" loading="lazy" />
      )}

      <div className="incident-card-body">
        <div className="row">
          <span className="badge">
            <span aria-hidden="true">{CATEGORY_ICONS[incident.category]}</span>{' '}
            {incident.categoryLabel}
          </span>
          <span className={`badge ${severity.className}`}>{severity.label}</span>
          {incident.status === 'verified' && (
            <span className={`badge ${status.className}`}>{status.label}</span>
          )}
        </div>

        <h3 className="mt-3">{incident.title}</h3>
        <p className="small muted">{incident.excerpt}</p>

        <div className="incident-card-meta">
          <span className="row">
            <Avatar user={incident.reporter} size={22} />
            <span className="tiny muted">
              {incident.reporter.name} &middot; {timeAgo(incident.occurredAt)}
            </span>
          </span>

          <span className="row tiny muted">
            {incident.reactionCounts.helpful + incident.reactionCounts.important > 0 && (
              <span>
                {'\u{1F44D}'} {incident.reactionCounts.helpful + incident.reactionCounts.important}
              </span>
            )}
            {incident.commentCount > 0 && (
              <span>
                {'\u{1F4AC}'} {incident.commentCount}
              </span>
            )}
          </span>
        </div>

        {(incident.area || incident.city) && (
          <p className="tiny muted mb-0 truncate">
            {'\u{1F4CD}'} {[incident.area, incident.city].filter(Boolean).join(', ')}
          </p>
        )}
      </div>
    </Link>
  );
}
