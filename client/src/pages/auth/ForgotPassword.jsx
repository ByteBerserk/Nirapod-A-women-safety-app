import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../../api/endpoints';
import { Field } from '../../components/ui';
import AuthShell from './AuthShell';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await authApi.forgotPassword(email.trim().toLowerCase());
      // The server replies the same way whether or not the address exists, so
      // the screen must too. Saying "no such account" here would let anyone
      // test which addresses are registered.
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        footer={
          <p className="small mb-0">
            <Link to="/login">Back to sign in</Link>
          </p>
        }
      >
        <div className="alert alert-success">
          <span>
            If <strong>{email}</strong> has an account, a reset link is on its way. It works once
            and expires in an hour.
          </span>
        </div>
        <p className="small muted">
          Nothing after a few minutes? Check your spam folder, then{' '}
          <button type="button" className="link-button" onClick={() => setSent(false)}>
            try a different address
          </button>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Tell us the address on your account and we will email you a link."
      footer={
        <p className="small mb-0">
          Remembered it? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={submit} noValidate>
        {error && (
          <div className="alert alert-danger" role="alert">
            <span>{error}</span>
          </div>
        )}

        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoFocus
        />

        <button type="submit" className="btn btn-block" disabled={submitting || !email}>
          {submitting ? <span className="spinner" /> : 'Send reset link'}
        </button>
      </form>
    </AuthShell>
  );
}
