import { useEffect, useState, useCallback } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket, useSocketEvent } from '../../context/SocketContext';
import { useSos } from '../../context/SosContext';
import { useToast } from '../../context/ToastContext';
import { notificationApi, checkInApi } from '../../api/endpoints';
import { Avatar, Modal } from '../ui';
import { SosFab } from '../sos/SosButton';
import { timeAgo } from '../../utils/format';

/**
 * FR-26. The running check-in, for the banner below.
 *
 * Lives in the shell rather than on the check-in page because the whole point
 * of the prompt is that it finds the user wherever they happen to be. Someone
 * reading the incident feed when their timer runs out has to be asked there.
 */
function useActiveCheckIn() {
  const [checkIn, setCheckIn] = useState(null);

  const refresh = useCallback(() => {
    checkInApi
      .active()
      .then((data) => setCheckIn(data?.checkIn || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    // Half a minute is fine: the server decides when this escalates, and the
    // grace period is minutes rather than seconds.
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  // The socket makes the prompt appear the moment it is due, rather than up to
  // thirty seconds later.
  useSocketEvent('checkin:due', refresh);
  useSocketEvent('checkin:resolved', refresh);
  useSocketEvent('checkin:escalated', refresh);

  return checkIn;
}

/** The signed-in shell: header, notification bell, navigation, SOS button. */

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Home', icon: '\u{1F3E0}' },
  { to: '/map', label: 'Map', icon: '\u{1F5FA}' },
  { to: '/incidents', label: 'Reports', icon: '\u{1F4CB}' },
  { to: '/groups', label: 'Groups', icon: '\u{1F465}' },
  { to: '/nearby', label: 'Nearby', icon: '\u{1F3E5}' },
];

const MENU_ITEMS = [
  { to: '/profile', label: 'My profile' },
  { to: '/contacts', label: 'Emergency contacts' },
  { to: '/check-in', label: 'Safety check-in' },
  { to: '/safe-places', label: 'Safe places' },
  { to: '/sos/history', label: 'SOS history' },
  { to: '/resources', label: 'Safety resources' },
  { to: '/bookmarks', label: 'Saved items' },
  { to: '/feedback', label: 'Feedback & support' },
];

export default function Layout() {
  const { user, logout, isStaff } = useAuth();
  const { connected } = useSocket();
  const { hasActiveSos } = useSos();
  const activeCheckIn = useActiveCheckIn();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await notificationApi.list({ limit: 20 });
      setNotifications(data.data?.notifications || []);
      setUnread(data.data?.unreadCount || 0);
    } catch {
      // The bell is not important enough to interrupt anyone over.
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Any navigation closes the menus, so the back button behaves as expected.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useSocketEvent('notification:new', (notification) => {
    setNotifications((current) => [notification, ...current].slice(0, 20));
    setUnread((count) => count + 1);

    // Urgent notifications are SOS alerts from a group member. They get a
    // toast that does not auto-dismiss, because missing one matters.
    if (notification.isUrgent) {
      toast.error(`${notification.title}. ${notification.body}`, { duration: 0 });
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  });

  const markRead = async (notification) => {
    if (!notification.isRead) {
      setUnread((count) => Math.max(0, count - 1));
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      notificationApi.markRead(notification.id).catch(() => {});
    }
    if (notification.link) {
      setNotificationsOpen(false);
      navigate(notification.link);
    }
  };

  const markAllRead = async () => {
    setUnread(0);
    setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
    notificationApi.markAllRead().catch(() => {});
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/dashboard" className="brand">
            <span className="brand-mark" aria-hidden="true">
              {'\u{1F6E1}'}
            </span>
            <span className="brand-name">Nirapod</span>
          </Link>

          <nav className="header-nav" aria-label="Main">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `header-link ${isActive ? 'is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
            {isStaff && (
              <NavLink
                to="/admin"
                className={({ isActive }) => `header-link ${isActive ? 'is-active' : ''}`}
              >
                Admin
              </NavLink>
            )}
          </nav>

          <div className="header-actions">
            {/* A quiet indicator: it only appears when something is wrong. */}
            {!connected && (
              <span className="badge badge-warning" title="Reconnecting to live updates">
                Offline
              </span>
            )}

            <button
              type="button"
              className="icon-button"
              onClick={() => setNotificationsOpen(true)}
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            >
              <span aria-hidden="true">{'\u{1F514}'}</span>
              {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
            </button>

            <button
              type="button"
              className="icon-button avatar-button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label="Account menu"
            >
              <Avatar user={user} size={32} />
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  className="menu-scrim"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                />
                <div className="account-menu" role="menu">
                  <div className="account-menu-head">
                    <Avatar user={user} size={40} />
                    <div className="truncate">
                      <strong className="truncate">{user?.name}</strong>
                      <span className="tiny muted truncate">{user?.email}</span>
                    </div>
                  </div>
                  {MENU_ITEMS.map((item) => (
                    <Link key={item.to} to={item.to} className="account-menu-item" role="menuitem">
                      {item.label}
                    </Link>
                  ))}
                  <hr />
                  <button
                    type="button"
                    className="account-menu-item danger"
                    role="menuitem"
                    onClick={async () => {
                      await logout();
                      navigate('/login');
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {hasActiveSos && (
          <Link to="/sos/active" className="sos-banner" role="alert">
            <span className="sos-banner-dot" aria-hidden="true" />
            An emergency alert is running. Your contacts can see your location. Tap to manage it.
          </Link>
        )}

        {/* FR-26. Loud when it needs an answer, quiet while it is just counting. */}
        {!hasActiveSos && activeCheckIn?.isOpen && (
          <Link
            to="/check-in"
            className={`checkin-banner ${activeCheckIn.status === 'awaiting' ? 'is-due' : ''}`}
            role={activeCheckIn.status === 'awaiting' ? 'alert' : undefined}
          >
            {activeCheckIn.status === 'awaiting' ? (
              <>
                <span className="sos-banner-dot" aria-hidden="true" />
                Are you safe? Confirm your check-in or your contacts will be alerted.
              </>
            ) : (
              <>Check-in running: {activeCheckIn.label}. Tap to mark yourself safe.</>
            )}
          </Link>
        )}
      </header>

      <main id="main" className="page">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `bottom-nav-item ${isActive ? 'is-active' : ''}`}
          >
            <span className="bottom-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <SosFab />

      <Modal
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="Notifications"
        footer={
          notifications.length > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead}>
              Mark all as read
            </button>
          )
        }
      >
        {notifications.length === 0 ? (
          <p className="muted mb-0">Nothing here yet.</p>
        ) : (
          <ul className="notification-list">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <button
                  type="button"
                  className={`notification-item ${notification.isRead ? '' : 'is-unread'} ${
                    notification.isUrgent ? 'is-urgent' : ''
                  }`}
                  onClick={() => markRead(notification)}
                >
                  <strong>{notification.title}</strong>
                  {notification.body && <span className="small">{notification.body}</span>}
                  <span className="tiny muted">{timeAgo(notification.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
