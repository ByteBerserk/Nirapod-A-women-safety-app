import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { userApi, authApi } from '../api/endpoints';
import { Avatar, Field, LoadingState, Modal } from '../components/ui';

const BLOOD_GROUPS = ['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'prefer-not-to-say', label: 'Prefer not to say' },
];

const TABS = [
  { id: 'personal', label: 'Personal details' },
  { id: 'medical', label: 'Medical & emergency' },
  { id: 'privacy', label: 'Privacy & notifications' },
  { id: 'security', label: 'Security' },
];

export default function Profile() {
  const { user, patchUser, reloadUser, logout } = useAuth();
  const toast = useToast();
  const fileInput = useRef(null);

  const [tab, setTab] = useState('personal');
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);

  useEffect(() => {
    userApi
      .getProfile()
      .then((data) => {
        setProfile(data.user);
        setForm(toFormState(data.user));
      })
      .catch((error) => toast.error(error.message));

  }, []);

  if (!form) return <LoadingState rows={5} />;

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    const nextValue = type === 'checkbox' ? checked : value;

    if (name.includes('.')) {
      const [group, key] = name.split('.');
      setForm((current) => ({ ...current, [group]: { ...current[group], [key]: nextValue } }));
    } else {
      setForm((current) => ({ ...current, [name]: nextValue }));
    }
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    try {
      const response = await userApi.updateProfile({
        name: form.name,
        username: form.username,
        phone: form.phone,
        gender: form.gender,
        dateOfBirth: form.dateOfBirth || undefined,
        bloodGroup: form.bloodGroup,
        medicalInfo: form.medicalInfo,
        address: form.address,
      });

      const updated = response.data.user;
      setProfile(updated);
      patchUser(updated);
      toast.success(response.message);
    } catch (error) {
      setErrors(error.details || {});
      if (!error.details) toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      const response = await userApi.updatePreferences({
        notificationPrefs: form.notificationPrefs,
        privacyPrefs: form.privacyPrefs,
      });
      setProfile(response.data.user);
      patchUser(response.data.user);
      toast.success(response.message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('That image is larger than 5 MB. Please choose a smaller one.');
      return;
    }

    setUploading(true);
    try {
      const response = await userApi.uploadAvatar(file);
      setProfile(response.data.user);
      patchUser(response.data.user);
      toast.success(response.message);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setUploading(false);

      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Your profile</h1>
          <p>
            The details here go into every emergency alert, so keep the medical section accurate.
          </p>
        </div>
      </div>

      <div className="profile-head card">
        <div className="profile-avatar">
          <Avatar user={profile} size={84} />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
          >
            {uploading ? <span className="spinner spinner-dark" /> : 'Change photo'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={uploadAvatar}
            className="sr-only"
          />
        </div>

        <div>
          <h2 className="mb-0">{profile.name}</h2>
          <p className="muted small mb-0">
            @{profile.username} &middot; {profile.email}
          </p>
          {profile.role !== 'user' && (
            <span className="badge badge-brand mt-3">
              {profile.role === 'admin' ? 'Administrator' : 'Moderator'}
            </span>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && (
        <form onSubmit={saveProfile} className="card">
          <div className="grid grid-2">
            <Field label="Full name" name="name" value={form.name} onChange={update} error={errors.name} required />
            <Field
              label="Username"
              name="username"
              value={form.username}
              onChange={update}
              error={errors.username}
              required
            />
          </div>

          <div className="grid grid-2">
            <Field
              label="Phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={update}
              error={errors.phone}
              hint="Shown to contacts during an alert so they can call you."
            />
            <Field
              label="Date of birth"
              name="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={update}
              error={errors.dateOfBirth}
            />
          </div>

          <Field label="Gender" name="gender" as="select" value={form.gender} onChange={update}>
            {GENDERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Field>

          <h3 className="mt-4">Address</h3>
          <Field
            label="Street address"
            name="address.line1"
            value={form.address.line1}
            onChange={update}
          />
          <div className="grid grid-2">
            <Field label="City" name="address.city" value={form.address.city} onChange={update} />
            <Field label="State / division" name="address.state" value={form.address.state} onChange={update} />
            <Field label="Postcode" name="address.postalCode" value={form.address.postalCode} onChange={update} />
            <Field label="Country" name="address.country" value={form.address.country} onChange={update} />
          </div>

          <button type="submit" className="btn" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save changes'}
          </button>
        </form>
      )}

      {tab === 'medical' && (
        <form onSubmit={saveProfile} className="card">
          <div className="alert">
            <div>
              <strong>This section is included in every SOS email</strong>
              <span>
                Whoever receives your alert - and any paramedic they hand the phone to - sees
                exactly what you write here.
              </span>
            </div>
          </div>

          <Field
            label="Blood group"
            name="bloodGroup"
            as="select"
            value={form.bloodGroup}
            onChange={update}
          >
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group === 'unknown' ? 'Prefer not to say' : group}
              </option>
            ))}
          </Field>

          <Field
            label="Medical notes"
            name="medicalInfo"
            as="textarea"
            value={form.medicalInfo}
            onChange={update}
            error={errors.medicalInfo}
            maxLength={1000}
            placeholder="Allergies, conditions, medication, anything a paramedic should know."
            hint={`${form.medicalInfo.length} of 1000 characters.`}
          />

          <button type="submit" className="btn" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save medical details'}
          </button>
        </form>
      )}

      {tab === 'privacy' && (
        <div className="card">
          <h3>Email notifications</h3>
          <Toggle
            name="notificationPrefs.emailSosAlerts"
            checked={form.notificationPrefs.emailSosAlerts}
            onChange={update}
            label="Email me when someone in my safety group raises an SOS"
          />
          <Toggle
            name="notificationPrefs.emailGroupAlerts"
            checked={form.notificationPrefs.emailGroupAlerts}
            onChange={update}
            label="Email me about group emergencies"
            hint="Turning this off does not affect in-app alerts."
          />
          <Toggle
            name="notificationPrefs.emailSafePlace"
            checked={form.notificationPrefs.emailSafePlace}
            onChange={update}
            label="Email me when I arrive at or leave a saved place"
          />

          <hr />

          <h3>Privacy</h3>
          <Toggle
            name="privacyPrefs.shareLocationWithGroups"
            checked={form.privacyPrefs.shareLocationWithGroups}
            onChange={update}
            label="Let me share my live location with safety groups"
            hint="You still choose per group. This is the master switch."
          />
          <Toggle
            name="privacyPrefs.notifyContactsOnSafePlace"
            checked={form.privacyPrefs.notifyContactsOnSafePlace}
            onChange={update}
            label="Tell my emergency contacts when I arrive at or leave a saved place"
            hint="Useful for family. Off by default, because it is a lot of information to share."
          />
          <Toggle
            name="privacyPrefs.showProfileToGroupMembers"
            checked={form.privacyPrefs.showProfileToGroupMembers}
            onChange={update}
            label="Show my profile to members of my safety groups"
          />

          <button type="button" className="btn mt-4" onClick={savePreferences} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save preferences'}
          </button>
        </div>
      )}

      {tab === 'security' && (
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h3 className="mb-0">Password</h3>
            </div>
            <p className="small muted">
              Changing your password signs you out on every other device.
            </p>
            <button type="button" className="btn btn-secondary" onClick={() => setPasswordModal(true)}>
              Change password
            </button>
          </section>

          <section className="card">
            <div className="card-header">
              <h3 className="mb-0">Sessions</h3>
            </div>
            <p className="small muted">
              If you have signed in somewhere you should not have, end every session at once.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={async () => {
                try {
                  await authApi.logoutAll();
                  toast.success('Signed out everywhere. Please sign in again.');
                  await logout();
                } catch (error) {
                  toast.error(error.message);
                }
              }}
            >
              Sign out of all devices
            </button>
          </section>

          <section className="card">
            <div className="card-header">
              <h3 className="mb-0">Deactivate account</h3>
            </div>
            <p className="small muted">
              Your reports stay on the community map so the warnings are not lost, but your account
              is closed and you stop receiving alerts. Contact an administrator to reopen it.
            </p>
            <DeactivateForm onDone={logout} />
          </section>
        </div>
      )}

      <PasswordModal
        open={passwordModal}
        onClose={() => setPasswordModal(false)}
        onSaved={() => {
          setPasswordModal(false);
          reloadUser().catch(() => {});
        }}
      />
    </>
  );
}

function toFormState(user) {
  return {
    name: user.name || '',
    username: user.username || '',
    phone: user.phone || '',
    gender: user.gender || 'prefer-not-to-say',
    dateOfBirth: user.dateOfBirth ? String(user.dateOfBirth).slice(0, 10) : '',
    bloodGroup: user.bloodGroup || 'unknown',
    medicalInfo: user.medicalInfo || '',
    address: {
      line1: user.address?.line1 || '',
      city: user.address?.city || '',
      state: user.address?.state || '',
      postalCode: user.address?.postalCode || '',
      country: user.address?.country || '',
    },
    notificationPrefs: { ...user.notificationPrefs },
    privacyPrefs: { ...user.privacyPrefs },
  };
}

function Toggle({ name, checked, onChange, label, hint }) {
  return (
    <div className="toggle-row">
      <label className="checkbox">
        <input type="checkbox" name={name} checked={checked} onChange={onChange} />
        <span>
          {label}
          {hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}
        </span>
      </label>
    </div>
  );
}

function PasswordModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    if (form.newPassword !== form.confirmPassword) {
      setErrors({ confirmPassword: 'The two passwords do not match.' });
      return;
    }

    setSaving(true);
    setErrors({});

    try {
      const response = await authApi.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success(response.message);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      onSaved();
    } catch (error) {
      setErrors(error.details || { _general: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change your password"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="password-form" className="btn" disabled={saving}>
            {saving ? <span className="spinner" /> : 'Update password'}
          </button>
        </>
      }
    >
      <form id="password-form" onSubmit={submit} noValidate>
        {errors._general && (
          <div className="alert alert-danger" role="alert">
            <span>{errors._general}</span>
          </div>
        )}
        <Field
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm((c) => ({ ...c, currentPassword: e.target.value }))}
          error={errors.currentPassword}
          required
        />
        <Field
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm((c) => ({ ...c, newPassword: e.target.value }))}
          error={errors.newPassword}
          hint="At least 8 characters, with one letter and one number."
          required
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => setForm((c) => ({ ...c, confirmPassword: e.target.value }))}
          error={errors.confirmPassword}
          required
        />
      </form>
    </Modal>
  );
}

function DeactivateForm({ onDone }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
        Deactivate my account
      </button>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await userApi.deactivate(password);
          toast.success('Your account has been deactivated.');
          await onDone();
        } catch (error) {
          toast.error(error.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label="Enter your password to confirm"
        name="deactivate-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      <div className="row">
        <button type="submit" className="btn btn-danger" disabled={busy || !password}>
          {busy ? <span className="spinner" /> : 'Deactivate permanently'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
