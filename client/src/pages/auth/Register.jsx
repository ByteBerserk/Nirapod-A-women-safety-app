import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Field } from '../../components/ui';
import AuthShell from './AuthShell';

const BLOOD_GROUPS = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

function scorePassword(password) {
  if (!password) return { score: 0, label: '', className: '' };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const levels = [
    { label: 'Very weak', className: 'strength-0' },
    { label: 'Weak', className: 'strength-1' },
    { label: 'Fair', className: 'strength-2' },
    { label: 'Good', className: 'strength-3' },
    { label: 'Strong', className: 'strength-4' },
    { label: 'Very strong', className: 'strength-5' },
  ];

  return { score, ...levels[score] };
}

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    bloodGroup: 'unknown',
    acceptedTerms: false,
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => scorePassword(form.password), [form.password]);

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setErrors((current) => ({ ...current, [name]: undefined, _general: undefined }));
  };

  const validateLocally = () => {
    const found = {};

    if (form.name.trim().length < 2) found.name = 'Please enter your name.';
    if (!/^[a-z0-9_.]{3,30}$/.test(form.username.trim().toLowerCase())) {
      found.username = 'Use 3 to 30 letters, numbers, dots or underscores.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      found.email = 'Please enter a valid email address.';
    }
    if (form.phone && !/^\+?\d{6,15}$/.test(form.phone.replace(/[\s-]/g, ''))) {
      found.phone = 'Please enter a valid phone number.';
    }
    if (form.password.length < 8) {
      found.password = 'Your password must be at least 8 characters.';
    } else if (!/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      found.password = 'Include at least one letter and one number.';
    }
    if (form.password !== form.confirmPassword) {
      found.confirmPassword = 'The two passwords do not match.';
    }
    if (!form.acceptedTerms) {
      found.acceptedTerms = 'Please confirm you understand how Nirapod works.';
    }

    return found;
  };

  const submit = async (event) => {
    event.preventDefault();

    const localErrors = validateLocally();
    if (Object.keys(localErrors).length) {
      setErrors(localErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      await register({
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.replace(/[\s-]/g, ''),
        password: form.password,
        bloodGroup: form.bloodGroup,
      });

      toast.success('Account created. Add your emergency contacts next.');
      navigate('/contacts', { replace: true });
    } catch (error) {
      setErrors({ ...(error.details || {}), _general: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes a minute. Adding contacts afterwards takes another."
      footer={
        <p className="small mb-0">
          Already have an account? <Link to="/login">Sign in</Link>
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
          label="Full name"
          name="name"
          type="text"
          autoComplete="name"
          value={form.name}
          onChange={update}
          error={errors.name}
          required
          autoFocus
        />

        <div className="grid grid-2">
          <Field
            label="Username"
            name="username"
            type="text"
            autoComplete="username"
            value={form.username}
            onChange={update}
            error={errors.username}
            hint="How friends find you when inviting you to a group."
            required
          />
          <Field
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={update}
            error={errors.phone}
            hint="Shown to your contacts during an alert."
          />
        </div>

        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={update}
          error={errors.email}
          required
        />

        <Field
          label="Blood group"
          name="bloodGroup"
          as="select"
          value={form.bloodGroup}
          onChange={update}
          hint="Included in every SOS email. You can add medical notes later."
        >
          {BLOOD_GROUPS.map((group) => (
            <option key={group} value={group}>
              {group === 'unknown' ? 'Prefer not to say' : group}
            </option>
          ))}
        </Field>

        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={update}
          error={errors.password}
          required
        />

        {form.password && (
          <div className="strength" aria-live="polite">
            <div className={`strength-bar ${strength.className}`}>
              <span style={{ width: `${(strength.score / 5) * 100}%` }} />
            </div>
            <span className="tiny muted">{strength.label}</span>
          </div>
        )}

        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={update}
          error={errors.confirmPassword}
          required
        />

        <div className="field">
          <label className="checkbox">
            <input
              type="checkbox"
              name="acceptedTerms"
              checked={form.acceptedTerms}
              onChange={update}
            />
            <span className="small">
              I understand Nirapod alerts the people I choose, and is not a replacement for calling
              emergency services.
            </span>
          </label>
          {errors.acceptedTerms && (
            <p className="error" role="alert">
              {errors.acceptedTerms}
            </p>
          )}
        </div>

        <button type="submit" className="btn btn-block" disabled={submitting}>
          {submitting ? <span className="spinner" /> : 'Create account'}
        </button>
      </form>
    </AuthShell>
  );
}
