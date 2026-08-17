import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import MediaPicker from '../../components/MediaPicker';

export default function Noticeboard() {
  const { showToast } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    body: '',
    category: 'general',
    attachmentUrl: '',
    attachmentName: '',
    attachmentPublicId: '',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api('/admin/announcements');
      setItems(data.announcements || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/admin/announcements', { method: 'POST', body: form });
      setForm({
        title: '',
        body: '',
        category: 'general',
        attachmentUrl: '',
        attachmentName: '',
        attachmentPublicId: '',
      });
      showToast?.('Announcement published', 'success');
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sa-page">
      <div className="sa-page-head">
        <div>
          <h1>Noticeboard</h1>
          <p>Publish school announcements for parents.</p>
        </div>
      </div>

      <div className="sa-two-col">
        <form className="sa-card" onSubmit={submit}>
          <h3>New announcement</h3>
          <label className="sa-field">
            <span>Title</span>
            <input
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Parents meeting"
            />
          </label>
          <label className="sa-field">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="general">General</option>
              <option value="class">Class</option>
              <option value="transport">Transport</option>
              <option value="events">Events</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <label className="sa-field">
            <span>Message</span>
            <textarea
              required
              rows={5}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Write the announcement…"
            />
          </label>
          <MediaPicker
            label="Attachment (optional)"
            folder="announcements"
            value={
              form.attachmentUrl
                ? {
                    url: form.attachmentUrl,
                    publicId: form.attachmentPublicId,
                    originalName: form.attachmentName,
                  }
                : null
            }
            onChange={(file) =>
              setForm((f) => ({
                ...f,
                attachmentUrl: file?.url || '',
                attachmentPublicId: file?.publicId || '',
                attachmentName: file?.originalName || '',
              }))
            }
            hint="Image, video, PDF, or document."
          />
          <button className="sa-btn sa-btn-primary" type="submit" disabled={saving}>
            {saving ? 'Publishing…' : 'Publish'}
          </button>
        </form>

        <div className="sa-card">
          <h3>Published</h3>
          {loading && <p className="sa-muted">Loading…</p>}
          {error && <p className="sa-error">{error}</p>}
          {!loading && items.length === 0 && <p className="sa-muted">No announcements yet.</p>}
          <div className="sa-notice-list">
            {items.map((a) => (
              <article key={a._id} className="sa-notice-item">
                <div className="sa-notice-top">
                  <strong>{a.title}</strong>
                  <span className={`sa-pill sa-pill-${a.category || 'general'}`}>
                    {a.category || 'general'}
                  </span>
                </div>
                <p>{a.body}</p>
                {a.attachmentUrl ? (
                  <p>
                    <a href={a.attachmentUrl} target="_blank" rel="noreferrer">
                      {a.attachmentName || 'Attachment'}
                    </a>
                  </p>
                ) : null}
                <small>
                  {a.authorName || 'Admin'} ·{' '}
                  {a.publishedAt ? new Date(a.publishedAt).toLocaleString() : ''}
                </small>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
