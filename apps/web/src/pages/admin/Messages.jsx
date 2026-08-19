import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'parents', label: 'Parents' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'groups', label: 'Groups' },
  { id: 'archived', label: 'Archived' },
];

const EMOJIS = ['😊', '👍', '✅', '🙏', '🚌'];

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtCreated(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Messages() {
  const { globalSearch = '' } = useOutletContext() || {};
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(params.get('id') || '');
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [attachNote, setAttachNote] = useState(false);
  const [newForm, setNewForm] = useState({ kind: 'parent', contactId: '', title: '', body: '', type: 'direct' });
  const scroller = useRef(null);
  const year = new Date().getFullYear();

  const loadList = useCallback(async () => {
    const query = new URLSearchParams({ tab });
    if (q.trim()) query.set('q', q.trim());
    const next = await api(`/admin/messages?${query}`);
    setData(next);
    setError('');
    return next;
  }, [tab, q]);

  const loadThread = useCallback(async (id) => {
    if (!id) {
      setThread(null);
      return;
    }
    const next = await api(`/admin/messages/${id}`);
    setThread(next);
    setError('');
    return next;
  }, []);

  useEffect(() => {
    loadList().catch((err) => setError(err.message));
  }, [loadList]);

  useEffect(() => {
    if (globalSearch) setQ(globalSearch);
  }, [globalSearch]);

  useEffect(() => {
    const to = params.get('to');
    const kind = params.get('kind');
    if (to && kind) {
      setShowNew(true);
      setNewForm((f) => ({ ...f, contactId: to, kind, type: 'direct' }));
    }
  }, [params]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      return undefined;
    }
    loadThread(selectedId).catch((err) => setError(err.message));
    return undefined;
  }, [selectedId, loadThread]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const id = setInterval(() => {
      loadThread(selectedId).catch(() => {});
      loadList().catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, [selectedId, loadThread, loadList]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [thread?.messages?.length, selectedId]);

  const conversations = data?.conversations || [];
  const contacts = data?.contacts || [];
  const selected = conversations.find((c) => String(c._id) === selectedId) || thread?.conversation;
  const messages = thread?.messages || [];
  const members = thread?.members || [];
  const groups = useMemo(() => {
    const out = [];
    let last = '';
    for (const m of messages) {
      if (m.dateKey && m.dateKey !== last) {
        out.push({ kind: 'day', id: m.dateKey, label: m.dateLabel });
        last = m.dateKey;
      }
      out.push({ kind: 'msg', ...m });
    }
    return out;
  }, [messages]);

  const openConvo = (id) => {
    setSelectedId(id);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('id', id);
      next.delete('to');
      next.delete('kind');
      return next;
    });
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !selectedId) return;
    setSending(true);
    try {
      await api(`/admin/messages/${selectedId}`, { method: 'POST', body: { body } });
      setDraft('');
      await Promise.all([loadThread(selectedId), loadList()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const startNew = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const payload =
        newForm.type === 'group'
          ? { type: 'group', title: newForm.title, body: newForm.body }
          : { kind: newForm.kind, contactId: newForm.contactId, body: newForm.body };
      const next = await api('/admin/messages', { method: 'POST', body: payload });
      setShowNew(false);
      setNewForm({ kind: 'parent', contactId: '', title: '', body: '', type: 'direct' });
      await loadList();
      if (next.conversation?._id) openConvo(String(next.conversation._id));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const filteredContacts = contacts.filter((c) => c.kind === newForm.kind);

  return (
    <div className="sa-students sa-msg">
      {error && <div className="alert">{error}</div>}

      <section className="sa-msg-board">
        <aside className="sa-card sa-msg-list">
          <button type="button" className="sa-btn sa-btn-primary sa-msg-new" onClick={() => setShowNew(true)}>
            + New Message
          </button>
          <div className="sa-msg-list-tools">
            <label className="sa-stu-search">
              <span aria-hidden="true">⌕</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations..." />
            </label>
            <button type="button" className="sa-icon-btn" aria-label="Filters" onClick={() => setShowFilters((v) => !v)}>
              ⚙
            </button>
          </div>
          {showFilters && (
            <div className="sa-msg-tabs">
              {TABS.map((t) => (
                <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <ul>
            {conversations.map((c) => (
              <li key={c._id}>
                <button
                  type="button"
                  className={`sa-msg-item${String(c._id) === selectedId ? ' is-on' : ''}`}
                  onClick={() => openConvo(String(c._id))}
                >
                  <span className="sa-msg-ava">{c.photoUrl ? <img src={c.photoUrl} alt="" /> : initials(c.title)}</span>
                  <div>
                    <strong>{c.title}</strong>
                    <p>{c.lastMessage || c.roleLabel || 'No messages yet'}</p>
                  </div>
                  <div className="sa-msg-meta">
                    <time>{c.timeLabel}</time>
                    {c.unreadCount > 0 && <b>{c.unreadCount > 9 ? '9+' : c.unreadCount}</b>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {!conversations.length && <p className="sa-home-empty">No conversations in this view.</p>}
        </aside>

        <article className="sa-card sa-msg-thread">
          {selected ? (
            <>
              <header className="sa-msg-thread-head">
                <span className="sa-msg-ava">
                  {selected.photoUrl ? <img src={selected.photoUrl} alt="" /> : initials(selected.title)}
                </span>
                <div>
                  <strong>{selected.title}</strong>
                  <p>
                    {members.length
                      ? `${members.length} ${members.length === 1 ? 'person' : 'people'} in this thread`
                      : selected.roleLabel || selected.subtitle || 'Direct message'}
                  </p>
                </div>
                <div className="sa-msg-head-actions">
                  {selected.phone ? (
                    <a className="sa-icon-btn" href={`tel:${selected.phone}`} aria-label="Call">
                      ☎
                    </a>
                  ) : (
                    <button type="button" className="sa-icon-btn" disabled title="No phone number stored">
                      ☎
                    </button>
                  )}
                  <button type="button" className="sa-icon-btn" disabled title="Video calls are not available">
                    🎥
                  </button>
                </div>
              </header>
              <div className="sa-msg-scroll" ref={scroller}>
                {groups.map((item) =>
                  item.kind === 'day' ? (
                    <p key={item.id} className="sa-msg-day">
                      {item.label}
                    </p>
                  ) : (
                    <div key={item._id} className={`sa-msg-bubble${item.mine ? ' is-mine' : ''}`}>
                      {!item.mine && (
                        <span className="sa-msg-ava sm">{initials(item.senderName || selected.title)}</span>
                      )}
                      <div>
                        <small>
                          {item.mine ? 'You' : item.senderName || selected.title} · {item.timeLabel}
                        </small>
                        <p>{item.body}</p>
                      </div>
                    </div>
                  )
                )}
                {!messages.length && <p className="sa-home-empty">No messages in this conversation yet.</p>}
              </div>
              <form className="sa-msg-composer" onSubmit={send}>
                <button type="button" className="sa-icon-btn" aria-label="Attach" onClick={() => setAttachNote(true)}>
                  📎
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your message..."
                  maxLength={2000}
                />
                <div className="sa-msg-emoji">
                  {EMOJIS.map((e) => (
                    <button key={e} type="button" onClick={() => setDraft((d) => d + e)}>
                      {e}
                    </button>
                  ))}
                </div>
                <button type="submit" className="sa-btn sa-btn-primary" disabled={sending || !draft.trim()}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <p className="sa-home-empty">Select a conversation or start a new message.</p>
          )}
        </article>

        <aside className="sa-msg-info">
          {selected ? (
            <>
              <article className="sa-card">
                <h3>Conversation info</h3>
                <strong>{selected.title}</strong>
                <p className="sa-muted">{selected.subtitle || selected.roleLabel || '—'}</p>
                <p className="sa-muted">Started {fmtCreated(selected.createdAt)}</p>
                <p className="sa-muted">Who created the thread is not stored.</p>
              </article>
              <article className="sa-card">
                <h3>People in this thread</h3>
                {members.length ? (
                  <ul className="sa-msg-members">
                    {members.map((m) => (
                      <li key={m._id}>
                        <span className="sa-msg-ava sm">{m.photoUrl ? <img src={m.photoUrl} alt="" /> : initials(m.name)}</span>
                        <div>
                          <strong>{m.name}</strong>
                          <small>{m.roleLabel}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sa-muted">No linked people are stored on this conversation.</p>
                )}
              </article>
              <article className="sa-card">
                <h3>Quick actions</h3>
                <div className="sa-inc-quick">
                  <Link to="/school-admin/noticeboard">Create Announcement</Link>
                  <button type="button" onClick={() => setShowTemplates(true)}>
                    Message Templates
                  </button>
                  <button type="button" onClick={() => setShowSettings(true)}>
                    Message Settings
                  </button>
                </div>
              </article>
            </>
          ) : (
            <article className="sa-card">
              <h3>Conversation info</h3>
              <p className="sa-muted">Choose a thread to see the people linked to it.</p>
            </article>
          )}
        </aside>
      </section>

      {showNew && (
        <div className="sa-reports-modal" role="dialog" aria-labelledby="sa-msg-new">
          <form className="sa-card" onSubmit={startNew}>
            <h3 id="sa-msg-new">New message</h3>
            <label>
              Type
              <select
                value={newForm.type}
                onChange={(e) => setNewForm({ ...newForm, type: e.target.value })}
              >
                <option value="direct">Direct</option>
                <option value="group">Group (name only)</option>
              </select>
            </label>
            {newForm.type === 'group' ? (
              <label>
                Group name
                <input
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                  required
                />
              </label>
            ) : (
              <>
                <label>
                  Contact type
                  <select value={newForm.kind} onChange={(e) => setNewForm({ ...newForm, kind: e.target.value, contactId: '' })}>
                    <option value="parent">Parent</option>
                    <option value="driver">Driver</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </label>
                <label>
                  Contact
                  <select
                    value={newForm.contactId}
                    onChange={(e) => setNewForm({ ...newForm, contactId: e.target.value })}
                    required
                  >
                    <option value="">Select…</option>
                    {filteredContacts.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {newForm.type === 'group' && (
              <p className="sa-muted">Group member lists are not stored. Only the group name is saved.</p>
            )}
            <label>
              Message (optional)
              <textarea rows={3} value={newForm.body} onChange={(e) => setNewForm({ ...newForm, body: e.target.value })} />
            </label>
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowNew(false)}>
                Cancel
              </button>
              <button type="submit" className="sa-btn sa-btn-primary" disabled={sending}>
                Start conversation
              </button>
            </div>
          </form>
        </div>
      )}

      {showTemplates && (
        <div className="sa-reports-modal" role="dialog">
          <div className="sa-card">
            <h3>Message templates</h3>
            <p className="sa-muted">Saved templates are not stored yet.</p>
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setShowTemplates(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="sa-reports-modal" role="dialog">
          <div className="sa-card">
            <h3>Message settings</h3>
            <p className="sa-muted">Notification and quiet-hour preferences for messaging are not stored yet.</p>
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setShowSettings(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {attachNote && (
        <div className="sa-reports-modal" role="dialog">
          <div className="sa-card">
            <h3>Attachments</h3>
            <p className="sa-muted">File attachments are not stored on messages yet. Send text only for now.</p>
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setAttachNote(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <footer className="sa-home-foot">
        <span>© {year} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
