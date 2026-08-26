import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { groupApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import MapView from '../../components/map/MapView';
import {
  Avatar,
  LoadingState,
  ErrorState,
  Modal,
  ConfirmDialog,
  Field,
} from '../../components/ui';
import useGeolocation from '../../hooks/useGeolocation';
import { timeAgo, formatDateTime } from '../../utils/format';

/** FR-15, FR-16, FR-17: chat, location sharing and group emergency alerts. */

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'map', label: 'Live map' },
  { id: 'members', label: 'Members' },
  { id: 'settings', label: 'Settings' },
];

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { emit } = useSocket();
  const { getPosition } = useGeolocation();

  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('chat');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);

  const messagesEnd = useRef(null);
  const typingTimeout = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [detail, messageResponse] = await Promise.all([
        groupApi.detail(id),
        groupApi.messages(id, { limit: 60 }),
      ]);

      setGroup(detail.group);
      setMessages(messageResponse.data?.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Join the room explicitly: a group created or joined after the socket
  // connected is not in the room list from the handshake.
  useEffect(() => {
    if (group) emit('group:join', { groupId: id });
    return () => emit('group:leave', { groupId: id });
  }, [group?.id, id, emit]);

  useSocketEvent(
    'group:message',
    (message) => {
      // Ignore events for other groups - the socket relays all of them.
      if (message.groupId && message.groupId !== id) return;
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message]
      );
    },
    [id]
  );

  useSocketEvent(
    'group:location',
    (payload) => {
      if (payload.groupId !== id) return;
      setLocations((current) => [
        ...current.filter((entry) => entry.userId !== payload.userId),
        payload,
      ]);
    },
    [id]
  );

  useSocketEvent(
    'group:typing',
    (payload) => {
      if (payload.groupId !== id || payload.user.id === user?.id) return;

      setTypingUsers((current) => {
        const others = current.filter((entry) => entry.id !== payload.user.id);
        return payload.isTyping ? [...others, payload.user] : others;
      });
    },
    [id, user?.id]
  );

  /* Auto-scroll to the newest message. */
  useEffect(() => {
    if (tab === 'chat') messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, tab]);

  /* Live positions when the map tab is open. */
  useEffect(() => {
    if (tab !== 'map') return undefined;

    let cancelled = false;
    const load = () =>
      groupApi
        .locations(id)
        .then((data) => !cancelled && setLocations(data.locations || []))
        .catch(() => {});

    load();
    const timer = setInterval(load, 30000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tab, id]);

  if (loading) return <LoadingState rows={5} />;
  if (error || !group) return <ErrorState message={error} onRetry={load} />;

  const send = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setDraft('');
    emit('group:typing', { groupId: id, isTyping: false });

    try {
      const result = await groupApi.sendMessage(id, body);
      // The socket echo may arrive first; guard against showing it twice.
      setMessages((current) =>
        current.some((m) => m.id === result.message.id) ? current : [...current, result.message]
      );
    } catch (err) {
      toast.error(err.message);
      setDraft(body); // put the text back rather than losing it
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (event) => {
    setDraft(event.target.value);

    emit('group:typing', { groupId: id, isTyping: true });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(
      () => emit('group:typing', { groupId: id, isTyping: false }),
      2000
    );
  };

  const toggleShareLocation = async () => {
    setSharing(true);

    try {
      if (group.myShareLocation) {
        await groupApi.stopSharing(id);
        toast.success('You have stopped sharing your location with this group.');
        setGroup((current) => ({ ...current, myShareLocation: false }));
        setLocations((current) => current.filter((entry) => entry.userId !== user.id));
      } else {
        const point = await getPosition();
        await groupApi.shareLocation(id, {
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
          postToChat: true,
        });
        toast.success('Your location is now visible to this group.');
        setGroup((current) => ({ ...current, myShareLocation: true }));
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSharing(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <button type="button" className="btn btn-ghost btn-sm mb-3" onClick={() => navigate('/groups')}>
            &lsaquo; All groups
          </button>
          <h1 className="mb-0">{group.name}</h1>
          <p className="mb-0">
            {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
            {group.description && ` · ${group.description}`}
          </p>
        </div>

        <div className="row">
          <button
            type="button"
            className={`btn ${group.myShareLocation ? 'btn-secondary' : ''}`}
            onClick={toggleShareLocation}
            disabled={sharing}
          >
            {sharing ? (
              <span className="spinner spinner-dark" />
            ) : group.myShareLocation ? (
              'Stop sharing location'
            ) : (
              'Share my location'
            )}
          </button>
          {group.canManage && (
            <button type="button" className="btn btn-secondary" onClick={() => setInviteOpen(true)}>
              Invite
            </button>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* -------------------------------------------------------- chat --- */}
      {tab === 'chat' && (
        <section className="card chat-panel">
          <div className="chat-scroll">
            {messages.length === 0 ? (
              <p className="muted small center" style={{ padding: '32px 0' }}>
                No messages yet. Say hello.
              </p>
            ) : (
              messages.map((message) => <ChatMessage key={message.id} message={message} me={user} />)
            )}
            <div ref={messagesEnd} />
          </div>

          {typingUsers.length > 0 && (
            <p className="tiny muted typing-indicator">
              {typingUsers.map((entry) => entry.name).join(', ')}{' '}
              {typingUsers.length === 1 ? 'is' : 'are'} typing...
            </p>
          )}

          <form className="chat-composer" onSubmit={send}>
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <input
              id="chat-input"
              type="text"
              value={draft}
              onChange={onDraftChange}
              placeholder="Write a message"
              maxLength={2000}
              autoComplete="off"
            />
            <button type="submit" className="btn" disabled={sending || !draft.trim()}>
              {sending ? <span className="spinner" /> : 'Send'}
            </button>
          </form>
        </section>
      )}

      {/* --------------------------------------------------------- map --- */}
      {tab === 'map' && (
        <section className="card">
          {locations.length === 0 ? (
            <div className="empty">
              <div className="icon" aria-hidden="true">
                {'\u{1F5FA}'}
              </div>
              <h3>Nobody is sharing their location</h3>
              <p>
                Location sharing is off by default. Anyone in the group can switch it on for
                themselves, and switch it off again at any time.
              </p>
              <button type="button" className="btn" onClick={toggleShareLocation} disabled={sharing}>
                Share my location
              </button>
            </div>
          ) : (
            <>
              <MapView
                center={{ lat: locations[0].lat, lng: locations[0].lng }}
                zoom={13}
                height="440px"
                markers={locations.map((entry) => ({
                  id: entry.userId,
                  lat: entry.lat,
                  lng: entry.lng,
                  tone: entry.userId === user.id ? 'success' : 'person',
                  glyph: entry.name?.[0]?.toUpperCase() || '?',
                  title: entry.name,
                  popup: (
                    <div className="map-popup">
                      <strong>{entry.userId === user.id ? 'You' : entry.name}</strong>
                      <span className="tiny muted">Updated {timeAgo(entry.updatedAt)}</span>
                    </div>
                  ),
                }))}
              />
              <ul className="location-list mt-3">
                {locations.map((entry) => (
                  <li key={entry.userId}>
                    <Avatar user={entry} size={28} />
                    <span className="truncate">
                      <strong className="small">
                        {entry.userId === user.id ? 'You' : entry.name}
                      </strong>
                      <span className="tiny muted" style={{ display: 'block' }}>
                        Updated {timeAgo(entry.updatedAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ----------------------------------------------------- members --- */}
      {tab === 'members' && (
        <MembersPanel group={group} me={user} onChanged={load} />
      )}

      {/* ---------------------------------------------------- settings --- */}
      {tab === 'settings' && (
        <SettingsPanel
          group={group}
          onChanged={load}
          onLeave={() => setLeaveOpen(true)}
        />
      )}

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groupId={id}
        onInvited={load}
      />

      <ConfirmDialog
        open={leaveOpen}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={async () => {
          try {
            const response = await groupApi.leave(id);
            toast.success(response.message);
            navigate('/groups', { replace: true });
          } catch (err) {
            toast.error(err.message);
          }
        }}
        title={`Leave "${group.name}"?`}
        message={
          group.isOwner
            ? 'You own this group. Ownership will pass to another member, or the group closes if you are the last one.'
            : 'You will stop receiving this group’s messages and emergency alerts.'
        }
        confirmLabel="Leave group"
        danger
      />
    </>
  );
}

function ChatMessage({ message, me }) {
  if (message.isSystem) {
    return (
      <div className="chat-system">
        <span className="tiny muted">
          {message.body} &middot; {timeAgo(message.createdAt)}
        </span>
      </div>
    );
  }

  if (message.type === 'sos') {
    return (
      <div className="chat-sos" role="alert">
        <strong>{'\u{1F6A8}'} {message.body}</strong>
        <span className="tiny">{formatDateTime(message.createdAt)}</span>
        {message.location && (
          <a
            className="btn btn-danger btn-sm mt-3"
            href={`https://www.openstreetmap.org/?mlat=${message.location.lat}&mlon=${message.location.lng}#map=17/${message.location.lat}/${message.location.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            See where they were
          </a>
        )}
      </div>
    );
  }

  const mine = message.sender?.id === me?.id;

  return (
    <div className={`chat-message ${mine ? 'is-mine' : ''}`}>
      {!mine && <Avatar user={message.sender} size={30} />}
      <div className="chat-bubble">
        {!mine && <strong className="tiny">{message.sender?.name}</strong>}

        {message.type === 'location' && message.location ? (
          <>
            <span className="small">{'\u{1F4CD}'} {message.body || 'Shared a location'}</span>
            <a
              className="tiny"
              href={`https://www.openstreetmap.org/?mlat=${message.location.lat}&mlon=${message.location.lng}#map=17/${message.location.lat}/${message.location.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Open on the map
            </a>
          </>
        ) : (
          <span>{message.body}</span>
        )}

        <span className="chat-time tiny">{timeAgo(message.createdAt)}</span>
      </div>
    </div>
  );
}

function MembersPanel({ group, me, onChanged }) {
  const toast = useToast();
  const [removing, setRemoving] = useState(null);

  const changeRole = async (member, role) => {
    try {
      const response = await groupApi.setRole(group.id, member.id, role);
      toast.success(response.message);
      onChanged();
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <>
      <section className="card">
        <ul className="member-list">
          {group.members.map((member) => (
            <li key={member.id}>
              <Avatar user={member} size={40} />

              <div className="member-main">
                <div className="row">
                  <strong>{member.id === me.id ? 'You' : member.name}</strong>
                  {member.groupRole === 'owner' && <span className="badge badge-brand">Owner</span>}
                  {member.groupRole === 'admin' && <span className="badge">Admin</span>}
                  {member.shareLocation && <span className="badge badge-info">Sharing location</span>}
                </div>
                <span className="tiny muted">
                  @{member.username} &middot; joined {timeAgo(member.joinedAt)}
                </span>
              </div>

              {group.isOwner && member.id !== me.id && (
                <div className="row">
                  <label className="sr-only" htmlFor={`role-${member.id}`}>
                    Role for {member.name}
                  </label>
                  <select
                    id={`role-${member.id}`}
                    value={member.groupRole}
                    onChange={(event) => changeRole(member, event.target.value)}
                    className="chip-select"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Make owner</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRemoving(member)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {group.invites?.length > 0 && (
        <section className="card mt-4">
          <div className="card-header">
            <h3 className="mb-0">Pending invitations</h3>
          </div>
          <ul className="stack">
            {group.invites.map((invite) => (
              <li key={invite.id} className="invite-row">
                <div>
                  <strong className="small">{invite.email}</strong>
                  <p className="tiny muted mb-0">
                    Invited {timeAgo(invite.createdAt)}
                    {invite.isExpired && ' · expired'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    try {
                      await groupApi.revokeInvite(group.id, invite.id);
                      toast.success('Invitation cancelled.');
                      onChanged();
                    } catch (error) {
                      toast.error(error.message);
                    }
                  }}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await groupApi.removeMember(group.id, removing.id);
            toast.success(`${removing.name} has been removed.`);
            setRemoving(null);
            onChanged();
          } catch (error) {
            toast.error(error.message);
          }
        }}
        title="Remove this member?"
        message={`${removing?.name} will stop receiving this group's messages and alerts.`}
        confirmLabel="Remove"
        danger
      />
    </>
  );
}

function SettingsPanel({ group, onChanged, onLeave }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: group.name,
    description: group.description || '',
    alertMembersOnSos: group.alertMembersOnSos,
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="stack">
      {group.canManage && (
        <section className="card">
          <h3>Group settings</h3>

          <Field
            label="Group name"
            name="name"
            value={form.name}
            onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
          />
          <Field
            label="Description"
            name="description"
            as="textarea"
            value={form.description}
            onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            maxLength={500}
          />

          <label className="checkbox mb-4">
            <input
              type="checkbox"
              checked={form.alertMembersOnSos}
              onChange={(event) =>
                setForm((c) => ({ ...c, alertMembersOnSos: event.target.checked }))
              }
            />
            <span>
              Alert every member when someone in this group raises an SOS
              <span className="hint" style={{ display: 'block' }}>
                Turning this off means group members are not told. Their own emergency contacts are
                still emailed.
              </span>
            </span>
          </label>

          <button
            type="button"
            className="btn"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const response = await groupApi.update(group.id, form);
                toast.success(response.message);
                onChanged();
              } catch (error) {
                toast.error(error.message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? <span className="spinner" /> : 'Save settings'}
          </button>
        </section>
      )}

      <section className="card">
        <h3>Leave this group</h3>
        <p className="small muted">
          You will stop receiving messages and emergency alerts from this group.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onLeave}>
          Leave group
        </button>
      </section>
    </div>
  );
}

function InviteModal({ open, onClose, groupId, onInvited }) {
  const toast = useToast();
  const [mode, setMode] = useState('email');
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    try {
      const payload = mode === 'email' ? { email: value.trim() } : { username: value.trim() };
      const response = await groupApi.invite(groupId, payload);
      toast.success(response.message);
      setValue('');
      onClose();
      onInvited();
    } catch (error) {
      setErrors(error.details || { _general: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite someone to this group"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="invite-form" className="btn" disabled={saving || !value}>
            {saving ? <span className="spinner" /> : 'Send invitation'}
          </button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} noValidate>
        {errors._general && (
          <div className="alert alert-danger" role="alert">
            <span>{errors._general}</span>
          </div>
        )}

        <div className="segmented mb-4">
          <button
            type="button"
            className={mode === 'email' ? 'is-active' : ''}
            onClick={() => setMode('email')}
          >
            By email
          </button>
          <button
            type="button"
            className={mode === 'username' ? 'is-active' : ''}
            onClick={() => setMode('username')}
          >
            By username
          </button>
        </div>

        <Field
          label={mode === 'email' ? 'Email address' : 'Username'}
          name={mode}
          type={mode === 'email' ? 'email' : 'text'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={errors.email || errors.username}
          hint={
            mode === 'email'
              ? 'They will get an invitation email. They do not need an account yet.'
              : 'They must already have a Nirapod account.'
          }
          required
          autoFocus
        />
      </form>
    </Modal>
  );
}
