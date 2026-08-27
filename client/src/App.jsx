import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout';
import { LoadingState } from './components/ui';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Dashboard from './pages/Dashboard';
import ActiveSos from './pages/sos/ActiveSos';
import TrackSos from './pages/sos/TrackSos';

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

function RequireAuth({ children, staffOnly = false, adminOnly = false }) {
  const { isAuthenticated, booting, user } = useAuth();
  const location = useLocation();

  if (booting) return <FullPageLoader />;

  if (!isAuthenticated) {

    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  if (staffOnly && !['admin', 'moderator'].includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

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

        <Route path="/track/:token" element={<TrackSos />} />

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
