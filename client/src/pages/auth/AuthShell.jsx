import { Link } from 'react-router-dom';

/** The shared frame around every signed-out screen. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth-shell">
      <div className="auth-aside">
        <Link to="/login" className="brand brand-light">
          <span className="brand-mark" aria-hidden="true">
            {'\u{1F6E1}'}
          </span>
          <span className="brand-name">Nirapod</span>
        </Link>

        <h2 className="auth-aside-title">Safety is easier together.</h2>

        <ul className="auth-points">
          <li>
            <strong>One-tap SOS.</strong> Your contacts get your live location, your blood group
            and your medical notes by email, within seconds.
          </li>
          <li>
            <strong>A map built by your community.</strong> See what has been reported on the
            streets you walk.
          </li>
          <li>
            <strong>Safety groups.</strong> Family and friends in one place, alerted together.
          </li>
          <li>
            <strong>Help nearby.</strong> The closest police station, hospital and pharmacy, with
            directions.
          </li>
        </ul>

        <p className="auth-aside-note">
          Nirapod is a community safety app, not an emergency service. In immediate danger, call
          your local emergency number.
        </p>
      </div>

      <div className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
