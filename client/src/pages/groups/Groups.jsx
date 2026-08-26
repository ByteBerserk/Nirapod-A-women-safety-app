import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { groupApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { LoadingState, EmptyState, ErrorState, Modal, Field } from '../../components/ui';
import { timeAgo } from '../../utils/format';

/** FR-14: create groups, and respond to invitations. */

export default function Groups() {
  const toast = useToast();
  const navigate = useNavigate();

  const [groups, setGroups] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await groupApi.list();
      setGroups(data.groups || []);
      setInvitations(data.invitations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    try {
      const response = await groupApi.create(form);
      toast.success(response.message);
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      navigate(`/groups/${response.data.group.id}`);
    } catch (err) {
      setErrors(err.details || { _general: err.message });
    } finally {
      setSaving(false);
    }
  };

  const respond = async (invitation, accept) => {
    try {
      // The code is not in the listing payload, so accepting from here uses
      // the dedicated invitation page instead.
      navigate(`/groups/invite/${invitation.group.id}/pending`, {
        state: { invitation, accept },
      });
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Safety groups</h1>
          <p>
            A private circle for family, flatmates or classmates. Everyone in a group is alerted
            the moment one of you raises an SOS.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
          Create a group
        </button>
      </div>

      {invitations.length > 0 && (
        <section className="card mb-4">
          <div className="card-header">
            <h2 className="mb-0">
              Invitations ({invitations.length})
            </h2>
          </div>
          <ul className="stack">
            {invitations.map((invitation) => (
              <li key={invitation.inviteId} className="invite-row">
                <div>
                  <strong>{invitation.group.name}</strong>
                  <p className="tiny muted mb-0">
                    {invitation.invitedBy?.name} invited you &middot; {invitation.group.memberCount}{' '}
                    member{invitation.group.memberCount === 1 ? '' : 's'}
                  </p>
                </div>
                <Link
                  to={`/groups/invite/${invitation.group.id}/from-email`}
                  className="btn btn-secondary btn-sm"
                >
                  View invitation
                </Link>
              </li>
            ))}
          </ul>
          <p className="tiny muted mt-3 mb-0">
            Open the link in your invitation email to accept. The code in that link is what proves
            the invitation is yours.
          </p>
        </section>
      )}

      {loading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={'\u{1F465}'}
          title="You are not in any safety group yet"
          message="Create one for the people you would want to know first - your family, your flatmates, the friends you walk home with."
          action={
            <button type="button" className="btn" onClick={() => setCreateOpen(true)}>
              Create your first group
            </button>
          }
        />
      ) : (
        <div className="grid grid-2">
          {groups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="card group-card">
              <div className="row-between">
                <h3 className="mb-0">{group.name}</h3>
                {group.isOwner && <span className="badge badge-brand">Owner</span>}
              </div>

              {group.description && <p className="small muted mt-3">{group.description}</p>}

              <div className="row tiny muted mt-3">
                <span>
                  {'\u{1F464}'} {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
                </span>
                {group.messageCount > 0 && (
                  <>
                    <span>&middot;</span>
                    <span>
                      {'\u{1F4AC}'} {group.messageCount}
                    </span>
                  </>
                )}
                {group.lastMessageAt && (
                  <>
                    <span>&middot;</span>
                    <span>Active {timeAgo(group.lastMessageAt)}</span>
                  </>
                )}
              </div>

              <div className="row mt-3">
                {group.alertMembersOnSos ? (
                  <span className="badge badge-success">SOS alerts on</span>
                ) : (
                  <span className="badge badge-warning">SOS alerts off</span>
                )}
                {group.myShareLocation && <span className="badge badge-info">Sharing location</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create a safety group"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" form="group-form" className="btn" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Create group'}
            </button>
          </>
        }
      >
        <form id="group-form" onSubmit={create} noValidate>
          {errors._general && (
            <div className="alert alert-danger" role="alert">
              <span>{errors._general}</span>
            </div>
          )}

          <Field
            label="Group name"
            name="name"
            value={form.name}
            onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
            error={errors.name}
            placeholder="Family, Flatmates, Night shift"
            required
            autoFocus
          />

          <Field
            label="What is this group for? (optional)"
            name="description"
            as="textarea"
            value={form.description}
            onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            error={errors.description}
            maxLength={500}
          />

          <div className="alert">
            <div>
              <strong>Everyone here gets your SOS</strong>
              <span>
                When you raise an alert, every member is notified in the app and by email. Only
                invite people you would actually want turning up.
              </span>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
