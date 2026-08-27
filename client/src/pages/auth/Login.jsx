import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Field } from '../../components/ui';
import AuthShell from './AuthShell';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ identifier: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));

    setErrors((current) => ({ ...current, [name]: undefined, _general: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      await login(form);
      toast.success('Welcome back.');

      navigate(location.state?.from?.pathname || '/dashboard', { replace: true });
    } catch (error) {

      setErrors({ ...(error.details || {}), _general: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to reach your safety network."
      footer={
        <p className="small mb-0">
          New to Nirapod? <Link to="/register">Create an account</Link>
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
          label="Email or username"
          name="identifier"
          type="text"
          autoComplete="username"
          value={form.identifier}
          onChange={update}
          error={errors.identifier}
          required
          autoFocus
        />

        <div className="password-field">
          <Field
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={form.password}
            onChange={update}
            error={errors.password}
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="row-between mb-4">
          <span />
          <Link to="/forgot-password" className="small">
            Forgot your password?
          </Link>
        </div>

        <button type="submit" className="btn btn-block" disabled={submitting}>
          {submitting ? <span className="spinner" /> : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}
