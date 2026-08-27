import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/endpoints';
import { Avatar, LoadingState, EmptyState, ErrorState, Pagination } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

const SEVERITY_STYLE = {
  info: 'badge',
  notice: 'badge-info',
  warning: 'badge-warning',
  critical: 'badge-danger',
};

const ACTION_LABELS = {
  'auth.register': 'Account created',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.logout': 'Signed out',
  'auth.password_reset_request': 'Password reset requested',
  'auth.password_reset': 'Password reset',
  'auth.password_change': 'Password changed',
  'profile.update': 'Profile updated',
  'contact.add': 'Emergency contact added',
  'contact.remove': 'Emergency contact removed',
  'sos.activate': 'SOS ACTIVATED',
  'sos.resolve': 'SOS closed',
  'sos.alert_sent': 'SOS alerts sent',
  'incident.create': 'Report submitted',
  'incident.update': 'Report edited',
  'incident.delete': 'Report deleted',
  'incident.status_change': 'Report status changed',
  'content.report': 'Content flagged',
  'moderation.action': 'Moderator action',
  'group.create': 'Group created',
  'group.invite': 'Group invitation sent',
  'group.join': 'Joined a group',
  'group.leave': 'Left a group',
  'group.delete': 'Group deleted',
  'safe_place.create': 'Safe place saved',
  'safe_place.delete': 'Safe place removed',
  'safe_place.transition': 'Arrived at / left a safe place',
  'admin.role_change': 'ROLE CHANGED',
  'admin.user_status': 'Account status changed',
  'admin.resource': 'Resource edited',
  'system.error': 'Server error',
};

export default function AdminAudit() {
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await adminApi.auditLogs({
        page,
        limit: 50,
        action: action || undefined,
        severity: severity || undefined,
      });

      setLogs(response.data?.logs || []);
      setMeta(response.meta || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, action, severity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <p>
            Every SOS activation, moderation decision and administrative action, kept for a year.
          </p>
        </div>
      </div>

      <div className="card filter-bar">
        <div className="row">
          <label htmlFor="audit-action" className="sr-only">
            Filter by action
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            className="chip-select"
          >
            <option value="">Every action</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label htmlFor="audit-severity" className="sr-only">
            Filter by severity
          </label>
          <select
            id="audit-severity"
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setPage(1);
            }}
            className="chip-select"
          >
            <option value="">Any severity</option>
            <option value="info">Info</option>
            <option value="notice">Notice</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : logs.length === 0 ? (
        <EmptyState icon={'\u{1F4DC}'} title="No entries" message="Nothing matches these filters." />
      ) : (
        <>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Who</th>
                  <th>Detail</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="tiny muted nowrap">{formatDateTime(log.createdAt)}</td>
                    <td>
                      <span className={`badge ${SEVERITY_STYLE[log.severity]}`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td>
                      {log.actor ? (
                        <span className="row">
                          <Avatar user={log.actor} size={24} />
                          <span className="tiny truncate">{log.actor.name}</span>
                        </span>
                      ) : (
                        <span className="tiny muted">{log.actorEmail || 'System'}</span>
                      )}
                    </td>
                    <td className="small">{log.message}</td>
                    <td className="tiny muted mono">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination meta={meta} onChange={setPage} />
        </>
      )}
    </>
  );
}
