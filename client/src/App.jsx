import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import { LoadingState } from './components/ui';

/* Eagerly loaded: the screens on the critical path. */
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import ActiveSos from './pages/sos/ActiveSos';
import TrackSos from './pages/sos/TrackSos';

/*
 * Everything else is split out. The map screens in particular pull in Leaflet,
 * which is large, and most visits never open them.
 */
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Profile = lazy(() => import('./pages/Profile'));
const Contacts = lazy(() => import('./pages/Contacts'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const SosHistory = lazy(() => import('./pages/sos/SosHistory'));
const IncidentFeed = lazy(() => import('./pages/incidents/IncidentFeed'));
const IncidentDetail = lazy(() => import('./pages/incidents/IncidentDetail'));
const ReportIncident = lazy(() => import('./pages/incidents/ReportIncident'));
const SafetyMap = lazy(() => import('./pages/SafetyMap'));
const Groups = lazy(() => import('./pages/groups/Groups'));
const GroupDetail = lazy(() => import('./pages/groups/GroupDetail'));
const GroupInvite = lazy(() => import('./pages/groups/GroupInvite'));
const Nearby = lazy(() => import('./pages/Nearby'));
const SafePlaces = lazy(() => import('./pages/SafePlaces'));
const Resources = lazy(() => import('./pages/resources/Resources'));
const ResourceDetail = lazy(() => import('./pages/resources/ResourceDetail'));
const Bookmarks = lazy(() => import('./pages/resources/Bookmarks'));
const Feedback = lazy(() => import('./pages/Feedback'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminModeration = lazy(() => import('./pages/admin/AdminModeration'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const NotFound = lazy(() => import('./pages/NotFound'));

/** Blocks a route until the session is known, then redirects if there is none. */
function RequireAuth({ children, staffOnly = false, adminOnly = false }) {
  const { isAuthenticated, booting, user } = useAuth();
  const location = useLocation();

  // Without this the boot-time refresh would flash the login page on every
  // reload before the session comes back.
  if (booting) return <FullPageLoader />;

  if (!isAuthenticated) {
    // `state.from` lets the login page send the user back where they were.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (staffOnly && !['admin', 'moderator'].includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

/** Keeps a signed-in visitor away from the login and register screens. */
function RequireGuest({ children }) {
  const { isAuthenticated, booting } = useAuth();
  if (booting) return <FullPageLoader />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

function FullPageLoader() {
  return (
    <div className="full-page-loader">
      <span className="spinner spinner-dark" style={{ width: 30, height: 30 }} />
      <p className="muted small mt-3">Loading Nirapod...</p>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            <RequireGuest>
              <Login />
            </RequireGuest>
          }
        />
        <Route
          path="/register"
          element={
            <RequireGuest>
              <Register />
            </RequireGuest>
          }
        />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Opened by an emergency contact straight from their email. */}
        <Route path="/track/:token" element={<TrackSos />} />

        {/* Signed in */}
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/check-in" element={<CheckIn />} />

          <Route path="/sos/active" element={<ActiveSos />} />
          <Route path="/sos/history" element={<SosHistory />} />

          <Route path="/incidents" element={<IncidentFeed />} />
          <Route path="/incidents/new" element={<ReportIncident />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="/map" element={<SafetyMap />} />

          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/groups/invite/:id/:code" element={<GroupInvite />} />

          <Route path="/nearby" element={<Nearby />} />
          <Route path="/safe-places" element={<SafePlaces />} />

          <Route path="/resources" element={<Resources />} />
          <Route path="/resources/:idOrSlug" element={<ResourceDetail />} />
          <Route path="/bookmarks" element={<Bookmarks />} />

          <Route path="/feedback" element={<Feedback />} />

          <Route
            path="/admin"
            element={
              <RequireAuth staffOnly>
                <AdminDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth staffOnly>
                <AdminUsers />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/moderation"
            element={
              <RequireAuth staffOnly>
                <AdminModeration />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <RequireAuth adminOnly>
                <AdminAudit />
              </RequireAuth>
            }
          />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
