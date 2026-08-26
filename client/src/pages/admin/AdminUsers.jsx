import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar, LoadingState, ErrorState, Modal, Pagination, Field } from '../../components/ui';
import { formatDate, timeAgo } from '../../utils/format';

/** FR-25: manage member accounts. */

const STATUS_STYLE = {
  active: 'badge-success',
  suspended: 'badge-danger',
  deactivated: 'badge',
};

export default function AdminUsers() {
  const { user: me, isAdmin } = useAuth();
  const toast = useToast();

  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await adminApi.listUsers({
        page,
        limit: 20,
        q: term || undefined,
        status: status || undefined,
        role: role || undefined,
      });

      setUsers(response.data?.users || []);
      setMeta(response.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, term, status, role]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (row) => {
    try {
      const data = await adminApi.userDetail(row.id);
      setSelected(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Members</h1>
          <p>Search accounts, review activity, and act on abuse.</p>
        </div>
      </div>

      <div className="card filter-bar">
        <form
          className="search-row"
          onSubmit={(event) => {
            event.preventDefault();
            setTerm(search.trim());
            setPage(1);
          }}
        >
          <label htmlFor="user-search" className="sr-only">
            Search members
          </label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, username or email"
          />
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>

        <div className="row">
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="chip-select"
            aria-label="Filter by status"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
          </select>

          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
            className="chip-select"
            aria-label="Filter by role"
          >
            <option value="">Any role</option>
            <option value="user">Member</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="row">
                        <Avatar user={row} size={32} />
                        <span className="truncate">
                          <strong className="small">{row.name}</strong>
                          <span className="tiny muted" style={{ display: 'block' }}>
                            @{row.username} &middot; {row.email}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${row.role !== 'user' ? 'badge-brand' : ''}`}>
                        {row.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_STYLE[row.accountStatus]}`}>
                        {row.accountStatus}
                      </span>
                    </td>
                    <td className="tiny muted">{formatDate(row.createdAt)}</td>
                    <td className="tiny muted">
                      {row.lastLoginAt ? timeAgo(row.lastLoginAt) : 'Never'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openDetail(row)}
                        disabled={row.id === me.id}
                      >
                        {row.id === me.id ? 'You' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={meta} onChange={setPage} />
        </>
      )}

      <ManageUserModal
        data={selected}
        isAdmin={isAdmin}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          load();
        }}
      />
    </>
  );
}

function ManageUserModal({ data, isAdmin, onClose, onChanged }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const { user, stats } = data;

  const act = async (fn, successMessage) => {
    setBusy(true);
    try {
      const response = await fn();
      toast.success(response?.message || successMessage);
      onChanged();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Manage ${user.name}`} size="md">
      <div className="row mb-4">
        <Avatar user={user} size={52} />
        <div>
          <strong>{user.name}</strong>
          <span className="tiny muted" style={{ display: 'block' }}>
            @{user.username} &middot; {user.email}
          </span>
          <span className="tiny muted">Joined {formatDate(user.createdAt)}</span>
        </div>
      </div>

      <div className="grid grid-4 mb-4">
        <StatBox label="Reports" value={stats.incidents} />
        <StatBox label="SOS events" value={stats.sosEvents} />
        <StatBox label="Groups" value={stats.groups} />
        <StatBox label="Flags against" value={stats.reportsAgainst} tone={stats.reportsAgainst > 0 ? 'warn' : ''} />
      </div>

      {user.accountStatus === 'suspended' && user.suspension && (
        <div className="alert alert-danger">
          <div>
            <strong>Currently suspended</strong>
            <span>
              {user.suspension.reason}
              {user.suspension.until && ` · until ${formatDate(user.suspension.until)}`}
            </span>
          </div>
        </div>
      )}

      <hr />

      {user.accountStatus === 'active' ? (
        <>
          <h4>Suspend this account</h4>
          <p className="small muted">
            They will be signed out everywhere immediately and emailed an explanation.
          </p>

          <Field
            label="Reason"
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Repeated false reports"
            maxLength={500}
          />

          <Field
            label="For how long?"
            name="days"
            as="select"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>A year</option>
          </Field>

          <button
            type="button"
            className="btn btn-danger"
            disabled={busy || !reason.trim()}
            onClick={() =>
              act(
                () => adminApi.setUserStatus(user.id, { status: 'suspended', reason, days }),
                'Account suspended.'
              )
            }
          >
            {busy ? <span className="spinner" /> : 'Suspend account'}
          </button>
        </>
      ) : (
        <>
          <h4>Reinstate this account</h4>
          <p className="small muted">They will be able to sign in again and will be emailed.</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              act(
                () => adminApi.setUserStatus(user.id, { status: 'active' }),
                'Account reinstated.'
              )
            }
          >
            {busy ? <span className="spinner" /> : 'Reinstate account'}
          </button>
        </>
      )}

      {isAdmin && (
        <>
          <hr />
          <h4>Role</h4>
          <p className="small muted">
            Moderators can review flagged content and suspend members. Administrators can do
            everything, including changing roles.
          </p>
          <div className="row">
            {['user', 'moderator', 'admin'].map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn-sm ${user.role === option ? '' : 'btn-secondary'}`}
                disabled={busy || user.role === option}
                onClick={() =>
                  act(() => adminApi.setUserRole(user.id, option), `Role changed to ${option}.`)
                }
              >
                {option === 'user' ? 'Member' : option === 'moderator' ? 'Moderator' : 'Administrator'}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

function StatBox({ label, value, tone }) {
  return (
    <div className={`stat-box ${tone === 'warn' ? 'is-warn' : ''}`}>
      <span className="stat-box-value">{value}</span>
      <span className="tiny muted">{label}</span>
    </div>
  );
}
