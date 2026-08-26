import { useCallback, useEffect, useState } from 'react';
import { contactApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import {
  LoadingState,
  EmptyState,
  ErrorState,
  Modal,
  ConfirmDialog,
  Field,
} from '../components/ui';
import { timeAgo } from '../utils/format';

/** FR-5: the people who get emailed the moment the SOS button is held. */

const EMPTY_FORM = { name: '', email: '', phone: '', relationship: '', priority: 1 };

export default function Contacts() {
  const toast = useToast();

  const [contacts, setContacts] = useState([]);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(null); // null | 'new' | contact
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await contactApi.list();
      setContacts(data.contacts || []);
      setLimit(data.limit || 10);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setEditing('new');
  };

  const openEdit = (contact) => {
    setForm({
      name: contact.name,
      email: contact.email,
      phone: contact.phone || '',
      relationship: contact.relationship || '',
      priority: contact.priority || 1,
    });
    setFormErrors({});
    setEditing(contact);
  };

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFormErrors((current) => ({ ...current, [name]: undefined, _general: undefined }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormErrors({});

    try {
      const payload = { ...form, priority: Number(form.priority) || 1 };

      if (editing === 'new') {
        const response = await contactApi.create(payload);
        toast.success(response.message);
      } else {
        const response = await contactApi.update(editing.id, payload);
        toast.success(response.message);
      }

      setEditing(null);
      await load();
    } catch (err) {
      setFormErrors({ ...(err.details || {}), _general: err.details ? undefined : err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (contact) => {
    // Optimistic: the switch should feel instant. Reverted below if it fails.
    setContacts((current) =>
      current.map((c) => (c.id === contact.id ? { ...c, isActive: !c.isActive } : c))
    );

    try {
      await contactApi.update(contact.id, { isActive: !contact.isActive });
    } catch (err) {
      toast.error(err.message);
      setContacts((current) =>
        current.map((c) => (c.id === contact.id ? { ...c, isActive: contact.isActive } : c))
      );
    }
  };

  const confirmDelete = async () => {
    try {
      await contactApi.remove(deleting.id);
      toast.success(`${deleting.name} has been removed.`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const activeCount = contacts.filter((c) => c.isActive).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Emergency contacts</h1>
          <p>
            These people are emailed the instant you raise an SOS. The message includes your live
            location, your blood group and your medical notes.
          </p>
        </div>
        <button type="button" className="btn" onClick={openNew} disabled={contacts.length >= limit}>
          Add a contact
        </button>
      </div>

      {activeCount === 0 && !loading && contacts.length > 0 && (
        <div className="alert alert-warning">
          <div>
            <strong>Every contact is switched off</strong>
            <span>Nobody would be emailed if you pressed SOS right now.</span>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={'\u{1F46A}'}
          title="No emergency contacts yet"
          message="The SOS button works, but there is nobody for it to alert. Add the two or three people you would call first."
          action={
            <button type="button" className="btn" onClick={openNew}>
              Add your first contact
            </button>
          }
        />
      ) : (
        <div className="stack">
          {contacts.map((contact) => (
            <article key={contact.id} className={`card contact-row ${contact.isActive ? '' : 'is-inactive'}`}>
              <div className="contact-main">
                <div className="row">
                  <h3 className="mb-0">{contact.name}</h3>
                  {contact.relationship && <span className="badge">{contact.relationship}</span>}
                  {contact.priority === 1 && <span className="badge badge-brand">Notified first</span>}
                  {!contact.isActive && <span className="badge badge-warning">Switched off</span>}
                </div>

                <p className="small muted mb-0 mt-1">
                  {contact.email}
                  {contact.phone && ` · ${contact.phone}`}
                </p>

                {contact.notifyCount > 0 && (
                  <p className="tiny muted mb-0 mt-1">
                    Alerted {contact.notifyCount} time{contact.notifyCount === 1 ? '' : 's'} &middot;
                    last {timeAgo(contact.lastNotifiedAt)}
                  </p>
                )}
              </div>

              <div className="contact-actions">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={contact.isActive}
                    onChange={() => toggleActive(contact)}
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span className="switch-thumb" />
                  </span>
                  <span className="sr-only">
                    {contact.isActive ? 'Switch off alerts for' : 'Switch on alerts for'}{' '}
                    {contact.name}
                  </span>
                </label>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => openEdit(contact)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDeleting(contact)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}

          <p className="tiny muted center">
            {contacts.length} of {limit} contacts used.
          </p>
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => !saving && setEditing(null)}
        title={editing === 'new' ? 'Add an emergency contact' : 'Edit contact'}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" form="contact-form" className="btn" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Save contact'}
            </button>
          </>
        }
      >
        <form id="contact-form" onSubmit={save} noValidate>
          {formErrors._general && (
            <div className="alert alert-danger" role="alert">
              <span>{formErrors._general}</span>
            </div>
          )}

          <Field
            label="Name"
            name="name"
            type="text"
            value={form.name}
            onChange={update}
            error={formErrors.name}
            required
            autoFocus
          />

          <Field
            label="Email address"
            name="email"
            type="email"
            value={form.email}
            onChange={update}
            error={formErrors.email}
            hint="Alerts are sent by email, so this has to be right."
            required
          />

          <div className="grid grid-2">
            <Field
              label="Phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={update}
              error={formErrors.phone}
              hint="So you can call them from the app."
            />
            <Field
              label="Relationship"
              name="relationship"
              type="text"
              value={form.relationship}
              onChange={update}
              error={formErrors.relationship}
              placeholder="Mother, flatmate, friend"
            />
          </div>

          <Field
            label="Notification order"
            name="priority"
            as="select"
            value={form.priority}
            onChange={update}
            hint="Everyone is emailed at once. This decides who is listed first."
          >
            <option value={1}>First</option>
            <option value={2}>Second</option>
            <option value={3}>Third</option>
            <option value={5}>Later</option>
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Remove this contact?"
        message={`${deleting?.name} will no longer be emailed when you raise an SOS.`}
        confirmLabel="Remove"
        danger
      />
    </>
  );
}
