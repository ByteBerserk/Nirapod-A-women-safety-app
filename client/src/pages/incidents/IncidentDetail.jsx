import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { incidentApi, resourceApi, adminApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import MapView from '../../components/map/MapView';
import {
  Avatar,
  LoadingState,
  ErrorState,
  Modal,
  ConfirmDialog,
  Field,
} from '../../components/ui';
import {
  timeAgo,
  formatDateTime,
  CATEGORY_ICONS,
  SEVERITY_STYLE,
  STATUS_STYLE,
} from '../../utils/format';

/** FR-9, FR-11, FR-12: read a report, react to it, comment, or flag it. */

const REACTIONS = [
  { type: 'helpful', label: 'Helpful', icon: '\u{1F44D}' },
  { type: 'important', label: 'Important', icon: '\u{2757}' },
  { type: 'support', label: 'Support', icon: '\u{1F49C}' },
];

const REPORT_REASONS = [
  { value: 'fake', label: 'This is false or made up' },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'abusive', label: 'Abusive or harassing' },
  { value: 'harmful', label: 'Puts someone at risk' },
  { value: 'duplicate', label: 'Already reported by someone else' },
  { value: 'other', label: 'Something else' },
];

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isStaff } = useAuth();
  const toast = useToast();

  const [incident, setIncident] = useState(null);
  const [comments, setComments] = useState([]);
  const [bookmarked, setBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [commentBody, setCommentBody] = useState('');
  const [commentAnonymous, setCommentAnonymous] = useState(false);
  const [posting, setPosting] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [detail, commentResponse] = await Promise.all([
        incidentApi.detail(id),
        incidentApi.listComments(id, { limit: 50 }),
      ]);

      setIncident(detail.incident);
      setBookmarked(Boolean(detail.isBookmarked));
      setComments(commentResponse.data?.comments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingState rows={5} />;
  if (error || !incident) return <ErrorState message={error} onRetry={load} />;

  const severity = SEVERITY_STYLE[incident.severity] || SEVERITY_STYLE.medium;
  const status = STATUS_STYLE[incident.status] || STATUS_STYLE.pending;

  const react = async (type) => {
    // Optimistic, then reconciled with the server's authoritative counts.
    const previous = { myReaction: incident.myReaction, counts: incident.reactionCounts };

    try {
      const result = await incidentApi.react(id, type);
      setIncident((current) => ({
        ...current,
        myReaction: result.myReaction,
        reactionCounts: result.reactionCounts,
      }));
    } catch (err) {
      toast.error(err.message);
      setIncident((current) => ({
        ...current,
        myReaction: previous.myReaction,
        reactionCounts: previous.counts,
      }));
    }
  };

  const toggleBookmark = async () => {
    try {
      if (bookmarked) {
        await resourceApi.removeBookmark('incident', id);
        setBookmarked(false);
        toast.success('Removed from your saved items.');
      } else {
        await resourceApi.addBookmark({ targetType: 'incident', targetId: id });
        setBookmarked(true);
        toast.success('Saved.');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const postComment = async (event) => {
    event.preventDefault();
    if (commentBody.trim().length < 2) return;

    setPosting(true);
    try {
      const result = await incidentApi.addComment(id, {
        body: commentBody.trim(),
        isAnonymous: commentAnonymous,
      });

      setComments((current) => [...current, result.comment]);
      setCommentBody('');
      setIncident((current) => ({ ...current, commentCount: current.commentCount + 1 }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (commentId) => {
    try {
      await incidentApi.deleteComment(id, commentId);
      setComments((current) => current.filter((c) => c.id !== commentId));
      setIncident((current) => ({
        ...current,
        commentCount: Math.max(0, current.commentCount - 1),
      }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm mb-4" onClick={() => navigate(-1)}>
        &lsaquo; Back
      </button>

      <div className="grid grid-2">
        <div className="stack">
          <article className="card">
            <div className="row">
              <span className="badge">
                <span aria-hidden="true">{CATEGORY_ICONS[incident.category]}</span>{' '}
                {incident.categoryLabel}
              </span>
              <span className={`badge ${severity.className}`}>{severity.label} severity</span>
              <span className={`badge ${status.className}`}>{status.label}</span>
            </div>

            <h1 className="mt-3">{incident.title}</h1>

            <div className="row-between incident-byline">
              <span className="row">
                <Avatar user={incident.reporter} size={32} />
                <span>
                  <strong className="small">{incident.reporter.name}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    Reported {timeAgo(incident.createdAt)}
                  </span>
                </span>
              </span>

              <span className="tiny muted">
                {incident.viewCount} view{incident.viewCount === 1 ? '' : 's'}
              </span>
            </div>

            <p className="incident-description">{incident.description}</p>

            <dl className="incident-facts">
              <div>
                <dt>Happened</dt>
                <dd>{formatDateTime(incident.occurredAt)}</dd>
              </div>
              {(incident.area || incident.city) && (
                <div>
                  <dt>Area</dt>
                  <dd>{[incident.area, incident.city].filter(Boolean).join(', ')}</dd>
                </div>
              )}
              {incident.address && (
                <div>
                  <dt>Address</dt>
                  <dd>{incident.address}</dd>
                </div>
              )}
            </dl>

            {incident.media?.length > 0 && (
              <>
                <h3 className="mt-4">Attached evidence</h3>
                <div className="media-grid">
                  {incident.media.map((item) => (
                    <MediaItem key={item.url} item={item} onOpen={() => setLightbox(item)} />
                  ))}
                </div>
              </>
            )}

            {/* --------------------------------------------- FR-11 --- */}
            <div className="reaction-bar">
              {REACTIONS.map((reaction) => {
                const active = incident.myReaction === reaction.type;
                const count = incident.reactionCounts[reaction.type] || 0;

                return (
                  <button
                    key={reaction.type}
                    type="button"
                    className={`reaction ${active ? 'is-active' : ''}`}
                    onClick={() => react(reaction.type)}
                    aria-pressed={active}
                  >
                    <span aria-hidden="true">{reaction.icon}</span>
                    <span>{reaction.label}</span>
                    {count > 0 && <span className="reaction-count">{count}</span>}
                  </button>
                );
              })}

              <span className="spacer" />

              <button type="button" className="btn btn-ghost btn-sm" onClick={toggleBookmark}>
                {bookmarked ? '\u{2605} Saved' : '\u{2606} Save'}
              </button>

              {!incident.isMine && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFlagOpen(true)}
                >
                  Report
                </button>
              )}
            </div>

            {(incident.isMine || isStaff) && (
              <div className="row mt-4 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                {incident.isMine && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete my report
                  </button>
                )}
                {isStaff && <StaffControls incident={incident} onChanged={load} />}
              </div>
            )}
          </article>

          {/* ------------------------------------------------- FR-9 --- */}
          <section className="card">
            <div className="card-header">
              <h2 className="mb-0">
                Comments {incident.commentCount > 0 && `(${incident.commentCount})`}
              </h2>
            </div>

            <form onSubmit={postComment} className="mb-4">
              <label htmlFor="comment-body" className="sr-only">
                Add a comment
              </label>
              <textarea
                id="comment-body"
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                maxLength={1000}
                placeholder="Add something useful - what you saw, or advice for people going that way."
                style={{ minHeight: 84 }}
              />
              <div className="row-between mt-3">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={commentAnonymous}
                    onChange={(event) => setCommentAnonymous(event.target.checked)}
                  />
                  <span className="small">Comment anonymously</span>
                </label>
                <button
                  type="submit"
                  className="btn btn-sm"
                  disabled={posting || commentBody.trim().length < 2}
                >
                  {posting ? <span className="spinner" /> : 'Post comment'}
                </button>
              </div>
            </form>

            {comments.length === 0 ? (
              <p className="muted small mb-0">
                No comments yet. If you know this area, your input would help.
              </p>
            ) : (
              <ul className="comment-list">
                {comments.map((comment) => (
                  <li key={comment.id} className={comment.isRemoved ? 'is-removed' : ''}>
                    <Avatar user={comment.author} size={32} />
                    <div className="comment-body">
                      <div className="row">
                        <strong className="small">{comment.author.name}</strong>
                        <span className="tiny muted">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="small mb-0">{comment.body}</p>
                    </div>
                    {comment.canDelete && !comment.isRemoved && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => deleteComment(comment.id)}
                      >
                        <span className="sr-only">Delete comment</span>
                        <span aria-hidden="true">&times;</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ----------------------------------------------------- map --- */}
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2 className="mb-0">Location</h2>
            </div>
            {incident.location ? (
              <MapView
                center={incident.location}
                zoom={16}
                height="320px"
                scrollWheelZoom={false}
                markers={[
                  {
                    id: incident.id,
                    ...incident.location,
                    tone: 'danger',
                    glyph: '!',
                    popup: incident.title,
                  },
                ]}
              />
            ) : (
              <p className="muted mb-0">No location was recorded.</p>
            )}

            {incident.location && (
              <a
                className="btn btn-secondary btn-sm btn-block mt-3"
                href={`https://www.openstreetmap.org/?mlat=${incident.location.lat}&mlon=${incident.location.lng}#map=17/${incident.location.lat}/${incident.location.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in OpenStreetMap
              </a>
            )}
          </section>

          <section className="card">
            <h3>Stay safe around here</h3>
            <ul className="tip-list small">
              <li>Share your live location with a safety group before you pass through.</li>
              <li>Travel with someone if you can, especially after dark.</li>
              <li>Save the nearest police station so it is one tap away.</li>
            </ul>
            <Link to="/nearby" className="btn btn-secondary btn-sm btn-block">
              Find help nearby
            </Link>
          </section>
        </div>
      </div>

      <FlagModal
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        targetType="incident"
        targetId={id}
      />

      <ConfirmDialog
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await incidentApi.remove(id);
            toast.success('Your report has been deleted.');
            navigate('/incidents', { replace: true });
          } catch (err) {
            toast.error(err.message);
          }
        }}
        title="Delete this report?"
        message="It will be removed from the community map, along with its comments. This cannot be undone."
        confirmLabel="Delete"
        danger
      />

      <Modal open={Boolean(lightbox)} onClose={() => setLightbox(null)} title="Evidence" size="lg">
        {lightbox && <MediaItem item={lightbox} full />}
      </Modal>
    </>
  );
}

function MediaItem({ item, onOpen, full = false }) {
  if (item.type === 'image') {
    return full ? (
      <img src={item.url} alt={item.originalName || 'Evidence'} style={{ width: '100%' }} />
    ) : (
      <button type="button" className="media-tile" onClick={onOpen}>
        <img src={item.url} alt={item.originalName || 'Evidence'} loading="lazy" />
      </button>
    );
  }

  if (item.type === 'video') {
    return (
      <video controls preload="metadata" className={full ? 'media-full' : 'media-tile'}>
        <source src={item.url} type={item.mimeType} />
        Your browser cannot play this video.
      </video>
    );
  }

  return (
    <audio controls preload="metadata" className="media-audio">
      <source src={item.url} type={item.mimeType} />
      Your browser cannot play this recording.
    </audio>
  );
}

/** FR-12 */
function FlagModal({ open, onClose, targetType, targetId }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const response = await adminApi.reportContent({ targetType, targetId, reason, details });
      toast.success(response.message);
      onClose();
      setReason('');
      setDetails('');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report this to a moderator"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="flag-form" className="btn" disabled={saving || !reason}>
            {saving ? <span className="spinner" /> : 'Send report'}
          </button>
        </>
      }
    >
      <form id="flag-form" onSubmit={submit}>
        <Field
          label="Why are you reporting this?"
          name="reason"
          as="select"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
        >
          <option value="">Choose a reason</option>
          {REPORT_REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Field>

        <Field
          label="Anything else? (optional)"
          name="details"
          as="textarea"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={1000}
        />
      </form>
    </Modal>
  );
}

/** FR-25: verification controls, shown inline for moderators and admins. */
function StaffControls({ incident, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await incidentApi.setStatus(incident.id, { status });
      toast.success(`Report marked as ${status}.`);
      onChanged();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {incident.status !== 'verified' && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setStatus('verified')}
          disabled={busy}
        >
          Mark verified
        </button>
      )}
      {incident.status !== 'removed' && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setStatus('removed')}
          disabled={busy}
        >
          Remove from map
        </button>
      )}
      {incident.status === 'removed' && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setStatus('pending')}
          disabled={busy}
        >
          Restore
        </button>
      )}
    </>
  );
}
