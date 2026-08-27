import { useEffect, useState } from 'react';
import { feedbackApi } from '../api/endpoints';
import { useToast } from '../context/ToastContext';
import { Field, LoadingState, EmptyState } from '../components/ui';
import { timeAgo } from '../utils/format';

const TYPES = [
  { value: 'bug', label: 'Something is broken', icon: '\u{1F41B}' },
  { value: 'suggestion', label: 'A suggestion', icon: '\u{1F4A1}' },
  { value: 'feature-request', label: 'A feature request', icon: '\u{2728}' },
  { value: 'complaint', label: 'A complaint', icon: '\u{1F614}' },
  { value: 'other', label: 'Something else', icon: '\u{1F4AC}' },
];

const STATUS_STYLE = {
  new: { label: 'Received', className: 'badge' },
  triaged: { label: 'Being looked at', className: 'badge-info' },
  'in-progress': { label: 'In progress', className: 'badge-warning' },
  resolved: { label: 'Resolved', className: 'badge-success' },
  closed: { label: 'Closed', className: 'badge' },
};

export default function Feedback() {
  const toast = useToast();

  const [form, setForm] = useState({ type: 'bug', subject: '', message: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadHistory = () => {
    setLoadingHistory(true);
    feedbackApi
      .mine({ limit: 20 })
      .then((response) => setHistory(response.data?.feedback || []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false));
  };

  useEffect(loadHistory, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    try {
      const response = await feedbackApi.submit({
        ...form,

        appVersion: '1.0.0',
      });

      toast.success(response.message);
      setForm({ type: 'bug', subject: '', message: '' });
      loadHistory();
    } catch (error) {
      setErrors(error.details || { _general: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Feedback &amp; support</h1>
          <p>
            Tell us what is broken or what is missing. Every message is read, and you will get a
            reply on this page.
          </p>
        </div>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <h2>Send us a message</h2>

          <form onSubmit={submit} noValidate>
            {errors._general && (
              <div className="alert alert-danger" role="alert">
                <span>{errors._general}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="feedback-type">What is this about?</label>
              <div className="category-grid" id="feedback-type">
                {TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    className={`category-option ${form.type === type.value ? 'is-active' : ''}`}
                    onClick={() => setForm((c) => ({ ...c, type: type.value }))}
                    aria-pressed={form.type === type.value}
                  >
                    <span aria-hidden="true">{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <Field
              label="Subject"
              name="subject"
              value={form.subject}
              onChange={(event) => setForm((c) => ({ ...c, subject: event.target.value }))}
              error={errors.subject}
              maxLength={140}
              placeholder="The SOS button does not respond on my phone"
              required
            />

            <Field
              label="Message"
              name="message"
              as="textarea"
              value={form.message}
              onChange={(event) => setForm((c) => ({ ...c, message: event.target.value }))}
              error={errors.message}
              maxLength={4000}
              placeholder={
                form.type === 'bug'
                  ? 'What did you do, what did you expect to happen, and what happened instead?'
                  : 'Tell us as much as you like.'
              }
              hint={`${form.message.length} of 4000 characters.`}
              required
              style={{ minHeight: 160 }}
            />

            <button type="submit" className="btn btn-block" disabled={submitting}>
              {submitting ? <span className="spinner" /> : 'Send message'}
            </button>
          </form>
        </section>

        <section>
          <h2>Your previous messages</h2>

          {loadingHistory ? (
            <LoadingState rows={2} />
          ) : history.length === 0 ? (
            <EmptyState
              icon={'\u{1F4E8}'}
              title="Nothing sent yet"
              message="Anything you send appears here, along with our reply."
            />
          ) : (
            <div className="stack">
              {history.map((item) => {
                const status = STATUS_STYLE[item.status] || STATUS_STYLE.new;

                return (
                  <article key={item.id} className="card">
                    <div className="row-between">
                      <span className={`badge ${status.className}`}>{status.label}</span>
                      <span className="tiny muted">{timeAgo(item.createdAt)}</span>
                    </div>

                    <h3 className="mt-3">{item.subject}</h3>
                    <p className="small muted">{item.message}</p>

                    {item.adminResponse && (
                      <div className="alert alert-success mb-0 mt-3">
                        <div>
                          <strong>Our reply</strong>
                          <span>{item.adminResponse}</span>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
