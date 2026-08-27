import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NotFound() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="card center" style={{ maxWidth: 480, margin: '64px auto' }}>
      <span style={{ fontSize: '2.6rem' }} aria-hidden="true">
        {'\u{1F5FA}'}
      </span>
      <h1 className="mt-3">This page does not exist</h1>
      <p className="muted">
        The link may be out of date, or it may have been mistyped.
      </p>
      <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn">
        {isAuthenticated ? 'Back to home' : 'Go to sign in'}
      </Link>
    </div>
  );
}
