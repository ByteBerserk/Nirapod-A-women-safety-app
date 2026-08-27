import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { resourceApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { LoadingState, ErrorState } from '../../components/ui';
import { formatDate } from '../../utils/format';

export default function ResourceDetail() {
  const { idOrSlug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [resource, setResource] = useState(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await resourceApi.detail(idOrSlug);
      setResource(data.resource);
      setBookmarked(Boolean(data.isBookmarked));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [idOrSlug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState rows={5} />;
  if (error || !resource) return <ErrorState message={error} onRetry={load} />;

  const toggleBookmark = async () => {
    try {
      if (bookmarked) {
        await resourceApi.removeBookmark('resource', resource.id);
        setBookmarked(false);
        toast.success('Removed from your saved items.');
      } else {
        await resourceApi.addBookmark({ targetType: 'resource', targetId: resource.id });
        setBookmarked(true);
        toast.success('Saved for later.');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <article className="reading-page">
      <button type="button" className="btn btn-ghost btn-sm mb-4" onClick={() => navigate(-1)}>
        &lsaquo; Back
      </button>

      <header className="reading-header">
        <span className="badge">{resource.category.replace(/-/g, ' ')}</span>
        <h1 className="mt-3">{resource.title}</h1>
        {resource.summary && <p className="lead">{resource.summary}</p>}

        <div className="row-between reading-meta">
          <span className="tiny muted">
            Updated {formatDate(resource.updatedAt)} &middot; {resource.viewCount} view
            {resource.viewCount === 1 ? '' : 's'}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={toggleBookmark}>
            {bookmarked ? '★ Saved' : '☆ Save for later'}
          </button>
        </div>
      </header>

      {resource.contactNumbers?.length > 0 && (
        <section className="card helpline-card">
          <h2>Numbers to call</h2>
          <ul className="helpline-list">
            {resource.contactNumbers.map((entry) => (
              <li key={`${entry.label}-${entry.number}`}>
                <span>{entry.label}</span>
                <a href={`tel:${entry.number}`} className="btn btn-secondary btn-sm">
                  {entry.number}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="reading-body">
        {resource.content.split(/\n{2,}/).map((block, index) => {
          const trimmed = block.trim();
          if (!trimmed) return null;

          const lines = trimmed.split('\n');
          if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
            return (

              <ul key={index}>
                {lines.map((line, i) => (

                  <li key={i}>{line.replace(/^\s*[-*]\s+/, '')}</li>
                ))}
              </ul>
            );
          }

          if (lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
            return (

              <ol key={index}>
                {lines.map((line, i) => (

                  <li key={i}>{line.replace(/^\s*\d+\.\s+/, '')}</li>
                ))}
              </ol>
            );
          }

          return <p key={index}>{trimmed}</p>;
        })}
      </div>

      {resource.externalUrl && (
        <a
          href={resource.externalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-secondary"
        >
          Read more at the source
        </a>
      )}

      {resource.tags?.length > 0 && (
        <div className="row mt-4">
          {resource.tags.map((tag) => (
            <span key={tag} className="badge">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
