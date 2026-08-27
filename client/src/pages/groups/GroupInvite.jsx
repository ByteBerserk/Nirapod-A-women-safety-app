import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { groupApi } from '../../api/endpoints';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { Avatar, LoadingState } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

export default function GroupInvite() {
  const { id, code } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { emit } = useSocket();

  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    groupApi
      .previewInvite(id, code)
      .then((data) => !cancelled && setInvitation(data.invitation))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [id, code]);

  const respond = async (accept) => {
    setResponding(true);

    try {
      const response = await groupApi.respondToInvite(id, code, accept);
      toast.success(response.message);

      if (accept) {

        emit('group:join', { groupId: id });
        navigate(`/groups/${id}`, { replace: true });
      } else {
        navigate('/groups', { replace: true });
      }
    } catch (err) {
      toast.error(err.message);
      setResponding(false);
    }
  };

  if (loading) return <LoadingState rows={3} />;

  if (error || !invitation) {
    return (
      <div className="card center" style={{ maxWidth: 520, margin: '48px auto' }}>
        <h1>This invitation is not valid</h1>
        <p className="muted">
          {error || 'It may have been cancelled, already used, or sent to a different address.'}
        </p>
        <Link to="/groups" className="btn">
          Go to my groups
        </Link>
      </div>
    );
  }

  return (
    <div className="card invite-page">
      <span className="badge badge-brand">Invitation</span>

      <h1 className="mt-3">{invitation.group.name}</h1>
      {invitation.group.description && <p className="muted">{invitation.group.description}</p>}

      <div className="row invite-meta">
        <Avatar user={invitation.invitedBy} size={36} />
        <span>
          <strong className="small">{invitation.invitedBy?.name}</strong>
          <span className="tiny muted" style={{ display: 'block' }}>
            invited you &middot; {invitation.group.memberCount} member
            {invitation.group.memberCount === 1 ? '' : 's'}
          </span>
        </span>
      </div>

      <div className="alert mt-4">
        <div>
          <strong>What joining means</strong>
          <span>
            You will be alerted immediately if anyone in this group raises an SOS, and you can
            message them and choose to share your live location. You can leave at any time.
          </span>
        </div>
      </div>

      {invitation.isExpired ? (
        <div className="alert alert-warning">
          <span>
            This invitation expired on {formatDateTime(invitation.expiresAt)}. Ask{' '}
            {invitation.invitedBy?.name} to send a new one.
          </span>
        </div>
      ) : (
        <>
          <div className="row mt-4">
            <button type="button" className="btn" onClick={() => respond(true)} disabled={responding}>
              {responding ? <span className="spinner" /> : 'Join this group'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => respond(false)}
              disabled={responding}
            >
              Decline
            </button>
          </div>

          <p className="tiny muted mt-3 mb-0">
            This invitation expires on {formatDateTime(invitation.expiresAt)}.
          </p>
        </>
      )}
    </div>
  );
}
