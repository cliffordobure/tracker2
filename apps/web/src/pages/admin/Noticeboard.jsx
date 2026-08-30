import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api, uploadFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZES = [10, 25, 50];
const BODY_MAX = 1000;
const FILE_MAX = 10 * 1024 * 1024;
const FILE_ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'general', label: 'General' },
  { id: 'class', label: 'Class' },
  { id: 'events', label: 'Events' },
  { id: 'urgent', label: 'Urgent' },
];
const CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'class', label: 'Class' },
  { id: 'events', label: 'Events' },
  { id: 'urgent', label: 'Urgent' },
];

const empty = {
  title: '',
  body: '',
  category: 'general',
  attachmentUrl: '',
  attachmentName: '',
  attachmentPublicId: '',
};

function pageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) items.push('…');
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < pages - 1) items.push('…');
  items.push(pages);
  return items;
}

function rowId(row) {
  return String(row.id || row._id || '');
}

function formatStamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

function categoryOf(row) {
  const value = String(row?.category || 'general').toLowerCase();
  return CATEGORIES.some((c) => c.id === value) ? value : 'general';
}

function NoticeIcon({ name }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (name === 'megaphone') {
    return (
      <svg {...p}>
        <path d="M4 10v4M4 11.2 16 6v12L4 12.8" />
        <path d="M16 9.2c1.6.8 2.6 2 2.6 2.8s-1 2-2.6 2.8" />
        <path d="M7.2 14.4v2.2c0 1.4 1.6 2.2 3.1 1.4" />
      </svg>
    );
  }
  if (name === 'people') {
    return (
      <svg {...p}>
        <circle cx="9" cy="8.4" r="2.6" />
        <circle cx="16.2" cy="9" r="2.2" />
        <path d="M4.6 18.6c.7-2.6 2.8-4.1 5.4-4.1 2.6 0 4.7 1.5 5.4 4.1" />
        <path d="M15.2 14.8c1.8 0 3.4 1 4.1 2.8" />
      </svg>
    );
  }
  if (name === 'book') {
    return (
      <svg {...p}>
        <path d="M4.6 5.4h6.2A2.6 2.6 0 0 1 13.4 8v11.2H7.2A2.6 2.6 0 0 1 4.6 16.6V5.4Z" />
        <path d="M19.4 5.4h-6.2A2.6 2.6 0 0 0 10.6 8v11.2h6.2a2.6 2.6 0 0 0 2.6-2.6V5.4Z" />
      </svg>
    );
  }
  if (name === 'trophy') {
    return (
      <svg {...p}>
        <path d="M8 5h8v4.2a4 4 0 0 1-8 0V5Z" />
        <path d="M8 7.2H5.6A2.2 2.2 0 0 0 5.6 11 3.4 3.4 0 0 0 8 9.4" />
        <path d="M16 7.2h2.4A2.2 2.2 0 0 1 18.4 11 3.4 3.4 0 0 1 16 9.4" />
        <path d="M12 13.2v2.2M9.4 19h5.2M10.4 17.2h3.2v1.8h-3.2z" />
      </svg>
    );
  }
  if (name === 'plus') return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
  if (name === 'send') {
    return (
      <svg {...p}>
        <path d="M4.4 12 19.2 4.8 15.4 19.2l-3.4-6.2L4.4 12Z" />
        <path d="m12 13 7.2-8.2" />
      </svg>
    );
  }
  if (name === 'caret') return <svg {...p} width={12} height={12}><path d="m6 9 5-6H1l5 6Z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'file') {
    return (
      <svg {...p} width={20} height={20}>
        <path d="M7 4.4h6.4L17 8v11.6H7V4.4Z" />
        <path d="M13.4 4.4V8H17" />
      </svg>
    );
  }
  if (name === 'info') return <svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 10.6V16M12 7.6h.01" /></svg>;
  return null;
}

const CATEGORY_UI = {
  urgent: { icon: 'megaphone', label: 'Urgent' },
  general: { icon: 'people', label: 'General' },
  class: { icon: 'book', label: 'Class' },
  events: { icon: 'trophy', label: 'Events' },
};

export default function Noticeboard() {
  const { showToast } = useAuth();
  const { globalSearch = '' } = useOutletContext() || {};
  const titleRef = useRef(null);
  const fileRef = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAddMenu, setShowAddMenu] = useState('');
  const [menuId, setMenuId] = useState('');

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

  useEffect(() => {
    const close = () => {
      setShowAddMenu('');
      setMenuId('');
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const resetForm = (preset = {}) => {
    setEditingId('');
    setForm({ ...empty, ...preset });
    setUploadError('');
  };

  const focusComposer = (preset = {}) => {
    resetForm(preset);
    setShowAddMenu('');
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const startEdit = (row) => {
    setEditingId(rowId(row));
    setForm({
      title: row.title || '',
      body: row.body || '',
      category: categoryOf(row),
      attachmentUrl: row.attachmentUrl || '',
      attachmentName: row.attachmentName || '',
      attachmentPublicId: row.attachmentPublicId || '',
    });
    setMenuId('');
    setUploadError('');
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const filtered = useMemo(() => {
    const q = String(globalSearch || '').trim().toLowerCase();
    return items.filter((row) => {
      const cat = categoryOf(row);
      if (filter !== 'all' && cat !== filter) return false;
      if (!q) return true;
      return [row.title, row.body, row.authorName, cat].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [items, filter, globalSearch]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = filtered.length ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(safePage * pageSize, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [filter, globalSearch, pageSize]);

  const attachFile = async (file) => {
    if (!file) return;
    if (file.size > FILE_MAX) {
      setUploadError('File is too large. Max size is 10MB.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const uploaded = await uploadFile(file, { folder: 'announcements' });
      setForm((f) => ({
        ...f,
        attachmentUrl: uploaded?.url || '',
        attachmentPublicId: uploaded?.publicId || '',
        attachmentName: uploaded?.originalName || file.name,
      }));
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e, categoryOverride) => {
    e?.preventDefault?.();
    const nextCategory = categoryOverride || form.category;
    if (!form.title.trim() || !form.body.trim()) {
      showToast?.('Title and message are required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, category: nextCategory, body: form.body.slice(0, BODY_MAX) };
      if (editingId) {
        await api(`/admin/announcements/${editingId}`, { method: 'PUT', body: payload });
        showToast?.('Announcement updated', 'success');
      } else {
        await api('/admin/announcements', { method: 'POST', body: payload });
        showToast?.('Announcement published', 'success');
      }
      resetForm({ category: nextCategory });
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    } finally {
      setSaving(false);
      setShowAddMenu('');
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Remove “${row.title}”?`)) return;
    setMenuId('');
    try {
      await api(`/admin/announcements/${rowId(row)}`, { method: 'DELETE' });
      if (editingId === rowId(row)) resetForm();
      showToast?.('Announcement removed', 'success');
      await load();
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  return (
    <div className="sa-students sa-users sa-notice">
      {error && <div className="alert">{error}</div>}

      <div className="sa-notice-grid">
        <form className="sa-card sa-notice-compose" onSubmit={submit}>
          <h3>{editingId ? 'Edit announcement' : 'Create New Announcement'}</h3>

          <label className="sa-field">
            <span>
              Title <em className="sa-req">*</em>
            </span>
            <input
              ref={titleRef}
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Enter announcement title"
            />
          </label>

          <label className="sa-field">
            <span>
              Category <em className="sa-req">*</em>
            </span>
            <select
              required
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="sa-field">
            <span>
              Message <em className="sa-req">*</em>
            </span>
            <div className="sa-notice-message">
              <textarea
                required
                rows={7}
                maxLength={BODY_MAX}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value.slice(0, BODY_MAX) }))}
                placeholder="Write your announcement here..."
              />
              <em>
                {form.body.length} / {BODY_MAX}
              </em>
            </div>
          </label>

          <div className="sa-field">
            <span>Attachment (optional)</span>
            <div
              className={`sa-notice-drop${dragOver ? ' is-over' : ''}${form.attachmentUrl ? ' has-file' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                attachFile(e.dataTransfer.files?.[0]);
              }}
            >
              <i aria-hidden="true">
                <NoticeIcon name="file" />
              </i>
              <div>
                <strong>{form.attachmentName || 'No file chosen'}</strong>
                <p>{uploading ? 'Uploading…' : form.attachmentUrl ? 'File ready to publish' : 'Upload a file or drag and drop'}</p>
              </div>
              <div className="sa-notice-drop-actions">
                <button type="button" className="sa-btn sa-btn-outline sa-notice-browse" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  Browse files
                </button>
                {form.attachmentUrl ? (
                  <button
                    type="button"
                    className="sa-btn sa-btn-ghost"
                    onClick={() => setForm((f) => ({ ...f, attachmentUrl: '', attachmentName: '', attachmentPublicId: '' }))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={FILE_ACCEPT}
                hidden
                onChange={(e) => {
                  attachFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <small>Image, video, PDF or document. Max size: 10MB</small>
            {uploadError ? <p className="sa-error">{uploadError}</p> : null}
          </div>

          <div className="sa-users-add sa-subj-split sa-notice-publish">
            <button className="sa-btn sa-btn-primary" type="submit" disabled={saving || uploading}>
              <NoticeIcon name="send" />
              {saving ? (editingId ? 'Saving…' : 'Publishing…') : editingId ? 'Save changes' : 'Publish announcement'}
            </button>
            <button
              type="button"
              className="sa-btn sa-btn-primary sa-subj-split-caret"
              aria-label="Publish options"
              disabled={saving || uploading}
              onClick={(e) => {
                e.stopPropagation();
                setShowAddMenu((cur) => (cur === 'publish' ? '' : 'publish'));
              }}
            >
              <NoticeIcon name="caret" />
            </button>
            {showAddMenu === 'publish' && (
              <div className="sa-users-add-menu" onClick={(e) => e.stopPropagation()}>
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" onClick={(e) => submit(e, c.id)}>
                    {editingId ? `Save as ${c.label}` : `Publish as ${c.label}`}
                  </button>
                ))}
                {editingId ? (
                  <button type="button" onClick={() => focusComposer()}>
                    Cancel edit
                  </button>
                ) : null}
              </div>
            )}
          </div>

          <p className="sa-notice-hint">
            <NoticeIcon name="info" />
            Published announcements will be visible to all relevant users.
          </p>
        </form>

        <article className="sa-card sa-notice-board">
          <header className="sa-notice-board-head">
            <h3>Published Announcements</h3>
            <div className="sa-users-add sa-subj-split">
              <button type="button" className="sa-btn sa-btn-primary" onClick={() => focusComposer()}>
                <NoticeIcon name="plus" />
                New announcement
              </button>
              <button
                type="button"
                className="sa-btn sa-btn-primary sa-subj-split-caret"
                aria-label="Choose category"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddMenu((cur) => (cur === 'new' ? '' : 'new'));
                }}
              >
                <NoticeIcon name="caret" />
              </button>
              {showAddMenu === 'new' && (
                <div className="sa-users-add-menu" onClick={(e) => e.stopPropagation()}>
                  {CATEGORIES.map((c) => (
                    <button key={c.id} type="button" onClick={() => focusComposer({ category: c.id })}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </header>

          <div className="sa-notice-pills" role="tablist" aria-label="Announcement categories">
            {FILTERS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={filter === tab.id ? 'is-on' : ''}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="sa-notice-list">
            {loading && <p className="sa-muted">Loading…</p>}
            {!loading &&
              slice.map((row) => {
                const cat = categoryOf(row);
                const ui = CATEGORY_UI[cat] || CATEGORY_UI.general;
                const id = rowId(row);
                return (
                  <article key={id} className={`sa-notice-item is-${cat}`}>
                    <i className="sa-notice-icon" aria-hidden="true">
                      <NoticeIcon name={ui.icon} />
                    </i>
                    <div className="sa-notice-main">
                      <div className="sa-notice-top">
                        <strong>{row.title}</strong>
                        <span className={`sa-notice-tag is-${cat}`}>{ui.label}</span>
                      </div>
                      <p>{row.body}</p>
                      <small>
                        {row.authorName || 'School Admin'} • {formatStamp(row.publishedAt || row.createdAt)}
                      </small>
                    </div>
                    <div className="sa-inc-row-actions sa-notice-more">
                      <button
                        type="button"
                        className="sa-icon-btn"
                        aria-label="More"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId(menuId === id ? '' : id);
                        }}
                      >
                        ⋮
                      </button>
                      {menuId === id && (
                        <div className="sa-inc-menu" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => startEdit(row)}>
                            Edit
                          </button>
                          {row.attachmentUrl ? (
                            <a href={row.attachmentUrl} target="_blank" rel="noreferrer">
                              Open attachment
                            </a>
                          ) : null}
                          <button type="button" onClick={() => remove(row)}>
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>

          {!loading && !filtered.length && (
            <div className="sa-assign-empty">
              <strong>{items.length ? 'No matching announcements' : 'No announcements yet'}</strong>
              <p>
                {items.length
                  ? 'Try another category or clear the search.'
                  : 'Publish a notice from the form and it will appear here for staff and parents.'}
              </p>
              {!items.length && (
                <button type="button" className="sa-btn sa-btn-primary" onClick={() => focusComposer()}>
                  <NoticeIcon name="plus" />
                  New announcement
                </button>
              )}
            </div>
          )}

          <div className="sa-table-foot sa-stu-foot sa-inc-foot">
            <span>
              Showing {from} to {to} of {filtered.length} {filtered.length === 1 ? 'announcement' : 'announcements'}
            </span>
            <div className="sa-inc-pager">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Per page"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
              <div className="sa-pager">
                <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">
                  ‹
                </button>
                {pageItems(safePage, pages).map((item, i) =>
                  item === '…' ? (
                    <span key={`e${i}`}>…</span>
                  ) : (
                    <button key={item} type="button" className={item === safePage ? 'is-on' : ''} onClick={() => setPage(item)}>
                      {item}
                    </button>
                  )
                )}
                <button type="button" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page">
                  ›
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
