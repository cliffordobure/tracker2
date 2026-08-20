import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'groups', label: 'Groups' },
  { id: 'archived', label: 'Archived' },
];

const EXTRA_TABS = [
  { id: 'parents', label: 'Parents' },
  { id: 'drivers', label: 'Drivers' },
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

function renderBody(text) {
  const parts = String(text || '').split(/(@[\w.-]+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <em key={`${part}-${i}`} className="sa-msg-mention">
        {part}
      </em>
    ) : (
      part
    )
  );
}

export default function Messages() {
  const { user } = useAuth();
  const { globalSearch = '', schoolName = '' } = useOutletContext() || {};
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedId = routeId || params.get('id') || '';
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [attachNote, setAttachNote] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ title: '', description: '' });
  const [memberPick, setMemberPick] = useState('');
  const [newForm, setNewForm] = useState({ kind: 'parent', contactId: '', title: '', body: '', type: 'direct' });
  const infoRef = useRef(null);
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
      return null;
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
    if (params.get('id') && !routeId) {
      navigate(`/school-admin/messages/${params.get('id')}`, { replace: true });
    }
  }, [params, routeId, navigate]);

  useEffect(() => {
    if (!selectedId) {
      setThread(null);
      setEditingInfo(false);
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
  const counts = data?.counts || { all: 0, unread: 0, groups: 0, archived: 0 };
  const selected = thread?.conversation || conversations.find((c) => String(c._id) === selectedId);
  const messages = thread?.messages || [];
  const members = thread?.members || [];
  const visibleMembers = showAllMembers ? members : members.slice(0, 6);
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

  const addableContacts = contacts.filter(
    (c) => !members.some((m) => String(m._id) === String(c._id)) && String(c._id) !== String(user?.id)
  );

  const openConvo = (id) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('id');
      next.delete('to');
      next.delete('kind');
      return next;
    });
    navigate(`/school-admin/messages/${id}`);
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

  const saveInfo = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    try {
      const next = await api(`/admin/messages/${selectedId}`, {
        method: 'PUT',
        body: { title: infoForm.title, description: infoForm.description },
      });
      setThread((prev) =>
        prev
          ? { ...prev, conversation: next.conversation, members: next.members || prev.members }
          : prev
      );
      setEditingInfo(false);
      await loadList();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleMute = async () => {
    if (!selectedId || !selected) return;
    try {
      const next = await api(`/admin/messages/${selectedId}`, {
        method: 'PUT',
        body: { muted: !selected.muted },
      });
      setThread((prev) =>
        prev ? { ...prev, conversation: next.conversation, members: next.members || prev.members } : prev
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const archiveConvo = async (archived = true) => {
    if (!selectedId) return;
    try {
      await api(`/admin/messages/${selectedId}/archive`, { method: 'POST', body: { archived } });
      setNotice(archived ? 'Conversation archived.' : 'Conversation restored.');
      await loadList();
      if (archived) navigate('/school-admin/messages');
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteConvo = async () => {
    if (!selectedId) return;
    if (!window.confirm('Delete this conversation and its messages? This cannot be undone.')) return;
    try {
      await api(`/admin/messages/${selectedId}`, { method: 'DELETE' });
      setThread(null);
      navigate('/school-admin/messages');
      await loadList();
    } catch (err) {
      setError(err.message);
    }
  };

  const addMember = async (e) => {
    e.preventDefault();
    if (!memberPick) return;
    try {
      const next = await api(`/admin/messages/${selectedId}/members`, {
        method: 'POST',
        body: { userId: memberPick },
      });
      setThread((prev) =>
        prev ? { ...prev, conversation: next.conversation, members: next.members || prev.members } : prev
      );
      setShowAddMember(false);
      setMemberPick('');
      await loadList();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredContacts = contacts.filter((c) => c.kind === newForm.kind);

  return (
    <div className="sa-students sa-msg">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      <section className="sa-msg-board">
        <aside className="sa-card sa-msg-list">
          <header className="sa-msg-list-head">
            <h3>All Conversations</h3>
            <button type="button" className="sa-icon-btn" aria-label="Filters" onClick={() => setShowFilters((v) => !v)}>
              ⚙
            </button>
          </header>
          <div className="sa-msg-list-tools">
            <label className="sa-stu-search">
              <span aria-hidden="true">⌕</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations..." />
            </label>
          </div>
          <div className="sa-msg-tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === 'unread' && counts.unread > 0 && <b>{counts.unread > 9 ? '9+' : counts.unread}</b>}
              </button>
            ))}
            {showFilters &&
              EXTRA_TABS.map((t) => (
                <button key={t.id} type="button" className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
          </div>
          <button type="button" className="sa-btn sa-btn-primary sa-msg-new" onClick={() => setShowNew(true)}>
            + New Message
          </button>
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
          <Link className="sa-msg-view-all" to="/school-admin/messages" onClick={() => setTab('all')}>
            View all conversations
          </Link>
        </aside>

        <article className="sa-card sa-msg-thread">
          {selected ? (
            <>
              <header className="sa-msg-thread-head">
                <span className="sa-msg-ava">
                  {selected.photoUrl ? <img src={selected.photoUrl} alt="" /> : initials(selected.title)}
                </span>
                <div>
                  <strong>
                    {selected.title}
                    {members.length ? ` (${members.length} ${members.length === 1 ? 'member' : 'members'})` : ''}
                  </strong>
                  <p>{selected.roleLabel || selected.subtitle || (selected.type === 'group' ? 'Group' : 'Direct message')}</p>
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
                  <button
                    type="button"
                    className="sa-icon-btn"
                    aria-label="Conversation info"
                    onClick={() => infoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  >
                    ⓘ
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
                        <span className="sa-msg-ava sm">
                          {initials(item.senderName || selected.title)}
                        </span>
                      )}
                      <div>
                        <small>
                          {item.mine ? 'You' : item.senderName || selected.title} · {item.timeLabel}
                        </small>
                        <p>{renderBody(item.body)}</p>
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
                <button
                  type="submit"
                  className="sa-msg-send"
                  disabled={sending || !draft.trim()}
                  aria-label="Send"
                >
                  ➤
                </button>
              </form>
            </>
          ) : (
            <p className="sa-home-empty">Select a conversation or start a new message.</p>
          )}
        </article>

        <aside className="sa-msg-info" ref={infoRef}>
          {selected ? (
            <>
              <article className="sa-card">
                <header className="sa-msg-info-head">
                  <h3>Conversation info</h3>
                  <button
                    type="button"
                    className="sa-icon-btn"
                    aria-label="Edit conversation"
                    onClick={() => {
                      setInfoForm({ title: selected.title || '', description: selected.description || '' });
                      setEditingInfo(true);
                    }}
                  >
                    ✎
                  </button>
                </header>
                <div className="sa-msg-info-hero">
                  <span className="sa-msg-ava lg">
                    {selected.photoUrl ? <img src={selected.photoUrl} alt="" /> : initials(selected.title)}
                  </span>
                  <strong>{selected.title}</strong>
                </div>
                {editingInfo ? (
                  <form className="sa-set-stack" onSubmit={saveInfo}>
                    <label>
                      Name
                      <input
                        value={infoForm.title}
                        onChange={(e) => setInfoForm({ ...infoForm, title: e.target.value })}
                        required
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        rows={3}
                        value={infoForm.description}
                        onChange={(e) => setInfoForm({ ...infoForm, description: e.target.value })}
                        placeholder="Optional"
                      />
                    </label>
                    <div className="sa-reports-actions">
                      <button type="button" className="sa-btn sa-btn-outline" onClick={() => setEditingInfo(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="sa-btn sa-btn-primary">
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p className="sa-muted">{selected.description || selected.subtitle || selected.roleLabel || '—'}</p>
                    <dl className="sa-set-info">
                      <div>
                        <dt>Created by</dt>
                        <dd>{selected.createdBy?.name || '—'}</dd>
                      </div>
                      <div>
                        <dt>Created on</dt>
                        <dd>{fmtCreated(selected.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Last updated</dt>
                        <dd>{fmtCreated(selected.updatedAt || selected.lastMessageAt)}</dd>
                      </div>
                    </dl>
                  </>
                )}
              </article>

              <article className="sa-card">
                <header className="sa-msg-info-head">
                  <h3>Members {members.length ? `(${members.length})` : ''}</h3>
                  {members.length > 6 && (
                    <button type="button" className="sa-text-link" onClick={() => setShowAllMembers((v) => !v)}>
                      {showAllMembers ? 'Show less' : 'View all'}
                    </button>
                  )}
                </header>
                {members.length ? (
                  <ul className="sa-msg-members">
                    {visibleMembers.map((m) => (
                      <li key={m._id}>
                        <span className="sa-msg-ava sm">
                          {m.photoUrl ? <img src={m.photoUrl} alt="" /> : initials(m.name)}
                        </span>
                        <div>
                          <strong>{m.name}</strong>
                          <small>{m.roleLabel}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="sa-muted">No linked people are stored on this conversation yet.</p>
                )}
              </article>

              <article className="sa-card">
                <h3>Quick actions</h3>
                <div className="sa-inc-quick">
                  {selected.type === 'group' ? (
                    <button type="button" onClick={() => setShowAddMember(true)}>
                      Add members
                    </button>
                  ) : (
                    <button type="button" disabled title="Direct threads have a fixed contact">
                      Add members
                    </button>
                  )}
                  <label className="sa-msg-mute">
                    <span>Mute notifications</span>
                    <input type="checkbox" checked={selected.muted === true} onChange={toggleMute} />
                  </label>
                  {selected.archived ? (
                    <button type="button" onClick={() => archiveConvo(false)}>
                      Restore conversation
                    </button>
                  ) : (
                    <button type="button" onClick={() => archiveConvo(true)}>
                      Archive conversation
                    </button>
                  )}
                  <button type="button" className="is-danger" onClick={deleteConvo}>
                    Delete conversation
                  </button>
                  <Link to="/school-admin/noticeboard">Create announcement</Link>
                  <button type="button" onClick={() => setShowTemplates(true)}>
                    Message templates
                  </button>
                  <button type="button" onClick={() => setShowSettings(true)}>
                    Message settings
                  </button>
                </div>
              </article>
            </>
          ) : (
            <article className="sa-card">
              <h3>Conversation info</h3>
              <p className="sa-muted">Choose a thread to see details, members, and actions.</p>
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
              <select value={newForm.type} onChange={(e) => setNewForm({ ...newForm, type: e.target.value })}>
                <option value="direct">Direct</option>
                <option value="group">Group</option>
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
                  <select
                    value={newForm.kind}
                    onChange={(e) => setNewForm({ ...newForm, kind: e.target.value, contactId: '' })}
                  >
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
              <p className="sa-muted">You can add members after the group is created.</p>
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

      {showAddMember && (
        <div className="sa-reports-modal" role="dialog">
          <form className="sa-card" onSubmit={addMember}>
            <h3>Add members</h3>
            <label>
              Person
              <select value={memberPick} onChange={(e) => setMemberPick(e.target.value)} required>
                <option value="">Select…</option>
                {addableContacts.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.roleLabel})
                  </option>
                ))}
              </select>
            </label>
            {!addableContacts.length && <p className="sa-muted">Everyone available is already in this group.</p>}
            <div className="sa-reports-actions">
              <button type="button" className="sa-btn sa-btn-outline" onClick={() => setShowAddMember(false)}>
                Cancel
              </button>
              <button className="sa-btn sa-btn-primary" type="submit" disabled={!memberPick}>
                Add
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
            <p className="sa-muted">Use Mute on a conversation to silence it. Other message defaults are not stored yet.</p>
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
        <span>
          © {year} {schoolName || 'School'}. All rights reserved.
        </span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
