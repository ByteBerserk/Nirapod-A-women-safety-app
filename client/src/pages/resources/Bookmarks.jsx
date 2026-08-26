import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resourceApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { LoadingState, EmptyState, ErrorState, Pagination } from '../../components/ui';
import { timeAgo, CATEGORY_ICONS } from '../../utils/format';

/** FR-22: everything the user has saved, resources and reports together. */

export default function Bookmarks() {
  const toast = useToast();

  const [bookmarks, setBookmarks] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await resourceApi.listBookmarks({
        page,
        limit: 20,
        type: filter || undefined,
      });
      setBookmarks(response.data?.bookmarks || []);
      setMeta(response.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (bookmark) => {
    // Optimistic removal - the item vanishes from a list, which is easy to undo
    // by saving it again if the request fails.
    setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));

    try {
      await resourceApi.removeBookmark(bookmark.targetType, bookmark.targetId);
    } catch (err) {
      toast.error(err.message);
      load();
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Saved items</h1>
          <p>Guides and reports you kept for later.</p>
        </div>
      </div>

      <div className="segmented mb-4">
        <button type="button" className={!filter ? 'is-active' : ''} onClick={() => { setFilter(''); setPage(1); }}>
          Everything
        </button>
        <button
          type="button"
          className={filter === 'resource' ? 'is-active' : ''}
          onClick={() => {
            setFilter('resource');
            setPage(1);
          }}
        >
          Guides
        </button>
        <button
          type="button"
          className={filter === 'incident' ? 'is-active' : ''}
          onClick={() => {
            setFilter('incident');
            setPage(1);
          }}
        >
          Reports
        </button>
      </div>

      {loading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : bookmarks.length === 0 ? (
        <EmptyState
          icon={'\u{2606}'}
          title="Nothing saved yet"
          message="Tap the star on any guide or report to keep it here."
          action={
            <Link to="/resources" className="btn">
              Browse safety resources
            </Link>
          }
        />
      ) : (
        <>
          <div className="stack">
            {bookmarks.map((bookmark) => (
              <article key={bookmark.id} className="card bookmark-row">
                <Link
                  to={
                    bookmark.targetType === 'resource'
                      ? `/resources/${bookmark.target.slug || bookmark.target.id}`
                      : `/incidents/${bookmark.target.id}`
                  }
                  className="bookmark-main"
                >
                  <span className="bookmark-icon" aria-hidden="true">
                    {bookmark.targetType === 'resource'
                      ? '\u{1F4D8}'
                      : CATEGORY_ICONS[bookmark.target.category] || '\u{1F4CD}'}
                  </span>

                  <span>
                    <strong>{bookmark.target.title}</strong>
                    <span className="tiny muted" style={{ display: 'block' }}>
                      {bookmark.targetType === 'resource' ? 'Guide' : 'Community report'} &middot;
                      saved {timeAgo(bookmark.createdAt)}
                    </span>
                  </span>
                </Link>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => remove(bookmark)}
                >
                  Remove
                </button>
              </article>
            ))}
          </div>

          <Pagination meta={meta} onChange={setPage} />
        </>
      )}
    </>
  );
}
