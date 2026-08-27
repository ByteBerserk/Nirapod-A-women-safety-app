import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/endpoints';
import { useToast } from '../../context/ToastContext';
import { Field } from '../../components/ui';
import AuthShell from './AuthShell';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined, _general: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();

    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      setErrors({ password: 'At least 8 characters, with one letter and one number.' });
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: 'The two passwords do not match.' });
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      await authApi.resetPassword({ token, password: form.password });
      toast.success('Your password has been changed. Please sign in with it.');
      navigate('/login', { replace: true });
    } catch (error) {
      setErrors({ ...(error.details || {}), _general: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="This link is incomplete">
        <div className="alert alert-danger">
          <span>
            The reset link is missing its token. Open the link from your email exactly as it was
            sent, or request a new one.
          </span>
        </div>
        <Link to="/forgot-password" className="btn btn-block">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Once you save it, you will be signed out everywhere else."
      footer={
        <p className="small mb-0">
          <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      <form onSubmit={submit} noValidate>
        {errors._general && (
          <div className="alert alert-danger" role="alert">
            <span>{errors._general}</span>
          </div>
        )}

        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update}
          error={errors.password}
          hint="At least 8 characters, with one letter and one number."
          required
          autoFocus
        />

        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={update}
          error={errors.confirmPassword}
          required
        />

        <button type="submit" className="btn btn-block" disabled={submitting}>
          {submitting ? <span className="spinner" /> : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  );
}
