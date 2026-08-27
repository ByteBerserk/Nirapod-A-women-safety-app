import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resourceApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { LoadingState, EmptyState, ErrorState, Pagination } from '../../components/ui';

const CATEGORY_META = {
  'safety-tips': { label: 'Safety tips', icon: '\u{1F6E1}' },
  'self-defense': { label: 'Self-defence', icon: '\u{1F94B}' },
  'legal-rights': { label: 'Legal rights', icon: '\u{2696}' },
  'emergency-guide': { label: 'Emergency guides', icon: '\u{1F6A8}' },
  'mental-health': { label: 'Mental health', icon: '\u{1F49A}' },
  helpline: { label: 'Helplines', icon: '\u{260E}' },
};

export default function Resources() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();

  const [resources, setResources] = useState([]);
  const [meta, setMeta] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState(params.get('q') || '');

  const page = Number(params.get('page')) || 1;
  const category = params.get('category') || '';
  const query = params.get('q') || '';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await resourceApi.list({
        page,
        limit: 12,
        category: category || undefined,
        q: query || undefined,
      });

      setResources(response.data?.resources || []);
      setCategories(response.data?.categories || []);
      setMeta(response.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, category, query]);

  useEffect(() => {
    load();
  }, [load]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const toggleBookmark = async (resource, event) => {

    event.preventDefault();
    event.stopPropagation();

    try {
      if (resource.isBookmarked) {
        await resourceApi.removeBookmark('resource', resource.id);
      } else {
        await resourceApi.addBookmark({ targetType: 'resource', targetId: resource.id });
      }

      setResources((current) =>
        current.map((item) =>
          item.id === resource.id ? { ...item, isBookmarked: !item.isBookmarked } : item
        )
      );
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Safety resources</h1>
          <p>
            Practical guides written to be read before you need them, and findable when you do.
          </p>
        </div>
        <Link to="/bookmarks" className="btn btn-secondary">
          Saved items
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
          <label htmlFor="resource-search" className="sr-only">
            Search resources
          </label>
          <input
            id="resource-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search guides and helplines"
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
            Everything
          </button>
          {categories.map((value) => {
            const info = CATEGORY_META[value] || { label: value, icon: '\u{1F4C4}' };
            return (
              <button
                key={value}
                type="button"
                className={`chip ${category === value ? 'is-active' : ''}`}
                onClick={() => setParam('category', category === value ? '' : value)}
              >
                <span aria-hidden="true">{info.icon}</span> {info.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <LoadingState rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : resources.length === 0 ? (
        <EmptyState
          icon={'\u{1F4DA}'}
          title="Nothing found"
          message={
            query || category
              ? 'Try a different search or clear the filters.'
              : 'No resources have been published yet.'
          }
        />
      ) : (
        <>
          <div className="grid grid-3">
            {resources.map((resource) => {
              const info = CATEGORY_META[resource.category] || {
                label: resource.category,
                icon: '\u{1F4C4}',
              };

              return (

                <article key={resource.id} className="card resource-card">
                  <Link
                    to={`/resources/${resource.slug || resource.id}`}
                    className="stretched-link"
                  >
                    <span className="sr-only">{resource.title}</span>
                  </Link>

                  <div className="row-between">
                    <span className="badge">
                      <span aria-hidden="true">{info.icon}</span> {info.label}
                    </span>
                    <button
                      type="button"
                      className="bookmark-toggle above-stretched-link"
                      onClick={(event) => toggleBookmark(resource, event)}
                      aria-label={resource.isBookmarked ? 'Remove from saved' : 'Save for later'}
                    >
                      {resource.isBookmarked ? '★' : '☆'}
                    </button>
                  </div>

                  {resource.isPinned && <span className="badge badge-brand mt-3">Start here</span>}

                  <h3 className="mt-3">{resource.title}</h3>
                  {resource.summary && <p className="small muted">{resource.summary}</p>}

                  {resource.contactNumbers?.length > 0 && (
                    <ul className="helpline-preview">
                      {resource.contactNumbers.slice(0, 3).map((entry) => (
                        <li key={entry.number}>
                          <span className="tiny muted">{entry.label}</span>

                          <a href={`tel:${entry.number}`} className="above-stretched-link">
                            {entry.number}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>

          <Pagination meta={meta} onChange={(next) => setParam('page', next)} />
        </>
      )}
    </>
  );
}
