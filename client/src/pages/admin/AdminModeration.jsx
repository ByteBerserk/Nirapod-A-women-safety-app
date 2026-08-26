import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import {
  Avatar,
  LoadingState,
  EmptyState,
  ErrorState,
  Modal,
  Pagination,
  Field,
} from '../../components/ui';
import { timeAgo, formatDateTime } from '../../utils/format';

/** FR-13: the moderation queue. */

const REASON_LABELS = {
  fake: 'False or made up',
  offensive: 'Offensive',
  spam: 'Spam',
  abusive: 'Abusive',
  harmful: 'Puts someone at risk',
  duplicate: 'Duplicate',
  other: 'Other',
};

const ACTIONS = [
  {
    value: 'dismiss',
    label: 'Dismiss the flag',
    help: 'The content is fine. Nothing changes.',
  },
  {
    value: 'remove-content',
    label: 'Remove the content',
    help: 'It disappears from the map and the feed. The author is told.',
  },
  {
    value: 'warn-user',
    label: 'Warn the author',
    help: 'The content stays up, but the author gets a notice.',
  },
  {
    value: 'suspend-user',
    label: 'Remove and suspend the author',
    help: 'The strongest action. Ends every one of their sessions immediately.',
  },
  {
    value: 'restore-content',
    label: 'Restore previously removed content',
    help: 'Undo an earlier removal.',
  },
];

export default function AdminModeration() {
  const toast = useToast();

  const [reports, setReports] = useState([]);
  const [meta, setMeta] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await adminApi.listReports({ page, limit: 20, status });
      setReports(response.data?.reports || []);
      setOpenCount(response.data?.openCount || 0);
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

  const openDetail = async (report) => {
    try {
      const data = await adminApi.reportDetail(report.id);
      setSelected(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Moderation queue</h1>
          <p>
            Content members have flagged. Resolving one flag resolves every other flag on the same
            item.
          </p>
        </div>
        {openCount > 0 && <span className="badge badge-danger">{openCount} waiting</span>}
      </div>

      <div className="segmented mb-4">
        {[
          { value: 'open', label: 'Open' },
          { value: 'actioned', label: 'Actioned' },
          { value: 'dismissed', label: 'Dismissed' },
          { value: 'all', label: 'Everything' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            className={status === option.value ? 'is-active' : ''}
            onClick={() => {
              setStatus(option.value);
              setPage(1);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={'\u{2705}'}
          title={status === 'open' ? 'Nothing waiting' : 'Nothing here'}
          message={
            status === 'open'
              ? 'Every flag has been dealt with. Good.'
              : 'No reports match this filter.'
          }
        />
      ) : (
        <>
          <div className="stack">
            {reports.map((report) => (
              <article key={report.id} className="card moderation-row">
                <div className="moderation-main">
                  <div className="row">
                    <span className="badge badge-warning">{REASON_LABELS[report.reason]}</span>
                    <span className="badge">{report.targetType}</span>
                    {report.status !== 'open' && (
                      <span className="badge badge-success">{report.status}</span>
                    )}
                    <span className="tiny muted">{timeAgo(report.createdAt)}</span>
                  </div>

                  <p className="small mt-3 mb-0">
                    &ldquo;{report.targetExcerpt}&rdquo;
                  </p>

                  {report.details && (
                    <p className="tiny muted mt-1 mb-0">Reporter added: {report.details}</p>
                  )}

                  <div className="row mt-3 tiny muted">
                    <span className="row">
                      Flagged by <Avatar user={report.reporter} size={20} />{' '}
                      {report.reporter?.name}
                    </span>
                    {report.targetAuthor && (
                      <>
                        <span>&middot;</span>
                        <span className="row">
                          Posted by <Avatar user={report.targetAuthor} size={20} />{' '}
                          {report.targetAuthor.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="row">
                  {report.targetType === 'incident' && (
                    <Link
                      to={`/incidents/${report.targetId}`}
                      className="btn btn-ghost btn-sm"
                      target="_blank"
                    >
                      View
                    </Link>
                  )}
                  {/*
                    A reviewed report stays openable while its content is still
                    removed: undoing a removal is the one decision a moderator
                    can only take after the fact.
                  */}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openDetail(report)}
                    disabled={report.status !== 'open' && report.actionTaken !== 'content-removed'}
                  >
                    {report.status === 'open'
                      ? 'Review'
                      : report.actionTaken === 'content-removed'
                        ? 'Undo removal'
                        : 'Reviewed'}
                  </button>
                </div>
              </article>
            ))}
          </div>

          <Pagination meta={meta} onChange={setPage} />
        </>
      )}

      {/* Keying on the report remounts the form, so the note and the chosen
          action never carry over from the last one reviewed. */}
      <ReviewModal
        key={selected?.report?.id || 'none'}
        data={selected}
        onClose={() => setSelected(null)}
        onResolved={() => {
          setSelected(null);
          load();
        }}
      />
    </>
  );
}

function ReviewModal({ data, onClose, onResolved }) {
  const toast = useToast();
  const [action, setAction] = useState(null);
  const [note, setNote] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const { report, target, otherReports } = data;

  /*
   * Two different jobs share this modal. An open flag is a forward decision, so
   * it offers the four actions that move it along. A flag that has already been
   * actioned is only reopenable to undo a removal, so restoring is the only
   * thing on offer - showing "dismiss" next to it would be nonsense.
   */
  const undoingRemoval = report.status !== 'open' && report.actionTaken === 'content-removed';
  const availableActions = undoingRemoval
    ? ACTIONS.filter((option) => option.value === 'restore-content')
    : ACTIONS.filter((option) => option.value !== 'restore-content');

  /*
   * The modal stays mounted between reports, so a choice made on the last one
   * can still be in state. Falling back whenever it is not on offer here stops
   * a stale "suspend the author" being submitted against a restore.
   */
  const selectedAction = availableActions.some((option) => option.value === action)
    ? action
    : availableActions[0].value;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await adminApi.resolveReport(report.id, {
        action: selectedAction,
        note,
        suspendDays: days,
      });
      toast.success(response.message);
      onResolved();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Review flagged content"
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form="review-form"
            className={`btn ${selectedAction === 'suspend-user' ? 'btn-danger' : ''}`}
            disabled={busy}
          >
            {busy ? <span className="spinner" /> : 'Apply decision'}
          </button>
        </>
      }
    >
      <section className="card card-tight mb-4">
        <span className="tiny muted">The flagged content</span>
        {target ? (
          <>
            {target.title && <h4 className="mt-1 mb-1">{target.title}</h4>}
            <p className="small mb-1">{target.body}</p>
            <span className="tiny muted">
              Posted {formatDateTime(target.createdAt)} &middot; currently {target.status}
            </span>
          </>
        ) : (
          <p className="small muted mb-0">
            This content has already been deleted. You can still close the flag.
          </p>
        )}
      </section>

      <div className="row mb-4">
        <span className="badge badge-warning">{REASON_LABELS[report.reason]}</span>
        <span className="tiny muted">
          Flagged by {report.reporter?.name} &middot; {timeAgo(report.createdAt)}
        </span>
      </div>

      {report.details && (
        <div className="alert mb-4">
          <div>
            <strong>What the reporter said</strong>
            <span>{report.details}</span>
          </div>
        </div>
      )}

      {otherReports?.length > 0 && (
        <div className="alert alert-warning mb-4">
          <div>
            <strong>
              {otherReports.length} other member{otherReports.length === 1 ? '' : 's'} flagged this
              too
            </strong>
            <span>
              Reasons: {[...new Set(otherReports.map((r) => REASON_LABELS[r.reason]))].join(', ')}.
              Your decision applies to all of them.
            </span>
          </div>
        </div>
      )}

      <form id="review-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="action-group">What should happen?</label>
          <div className="action-list" id="action-group">
            {availableActions.map((option) => (
              <label
                key={option.value}
                className={`action-option ${selectedAction === option.value ? 'is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="action"
                  value={option.value}
                  checked={selectedAction === option.value}
                  onChange={(event) => setAction(event.target.value)}
                />
                <span>
                  <strong className="small">{option.label}</strong>
                  <span className="tiny muted" style={{ display: 'block' }}>
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {selectedAction === 'suspend-user' && (
          <Field
            label="Suspend for how long?"
            name="days"
            as="select"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </Field>
        )}

        <Field
          label="Note"
          name="note"
          as="textarea"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          hint="Recorded in the audit log. For removals and suspensions, this is what the author is told."
        />
      </form>
    </Modal>
  );
}
