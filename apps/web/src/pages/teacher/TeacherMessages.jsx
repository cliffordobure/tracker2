import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

const TONES = ['mint', 'purple', 'rose', 'blue', 'orange'];

function initials(name) {
  return String(name || 'P')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'P';
}

function toneFor(name) {
  const s = String(name || '');
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n += s.charCodeAt(i);
  return TONES[n % TONES.length];
}

function convoKind(c) {
  const t = `${c.title || ''} ${c.roleLabel || ''} ${c.subtitle || ''}`.toLowerCase();
  if (t.includes('school') || t.includes('admin')) return 'school';
  if (t.includes('student')) return 'students';
  return 'parents';
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Icon({ name }) {
  switch (name) {
    case 'chat':
      return (
        <svg {...iconProps}>
          <path d="M21 12a8.5 8.5 0 0 1-8.5 8.5H8l-4 3v-5.2A8.5 8.5 0 1 1 21 12Z" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...iconProps}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'search':
      return (
        <svg {...iconProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...iconProps}>
          <path d="M7 3.5h3.2l1 3.2-2 1.4a12 12 0 0 0 6.7 6.7l1.4-2 3.2 1V17a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.7 2 2 0 0 1 7 3.5Z" />
        </svg>
      );
    case 'video':
      return (
        <svg {...iconProps}>
          <rect x="3" y="7" width="12" height="10" rx="2" />
          <path d="m15 10 6-3v10l-6-3" />
        </svg>
      );
    case 'clip':
      return (
        <svg {...iconProps}>
          <path d="m15 8-6.8 6.8a2.4 2.4 0 0 0 3.4 3.4L19 11.8a4 4 0 0 0-5.7-5.7L6.5 13" />
        </svg>
      );
    case 'send':
      return (
        <svg {...iconProps}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12Z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TeacherMessages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { showToast } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [composing, setComposing] = useState(false);

  const loadList = async () => {
    const data = await api('/teacher/messages');
    setConversations(data.conversations || []);
    setContacts(data.contacts || []);
  };

  const loadThread = async (threadId) => {
    const data = await api(`/teacher/messages/${threadId}`);
    setThread(data.conversation);
    setMessages(data.messages || []);
  };

  useEffect(() => {
    loadList().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!id) {
      setThread(null);
      setMessages([]);
      return;
    }
    loadThread(id).catch((e) => setError(e.message));
  }, [id]);

  const headerQ = (params.get('q') || '').trim().toLowerCase();

  const filtered = useMemo(() => {
    const needle = (q.trim() || headerQ).toLowerCase();
    return conversations.filter((c) => {
      if (kind !== 'all' && convoKind(c) !== kind) return false;
      if (!needle) return true;
      return `${c.title} ${c.lastMessage} ${c.subtitle}`.toLowerCase().includes(needle);
    });
  }, [conversations, q, headerQ, kind]);

  const visibleContacts = useMemo(() => {
    const needle = (q.trim() || headerQ).toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) => `${c.name} ${c.subtitle}`.toLowerCase().includes(needle));
  }, [contacts, q, headerQ]);

  const send = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || !id) return;
    setBusy(true);
    try {
      const res = await api(`/teacher/messages/${id}`, { method: 'POST', body: { body: text } });
      setBody('');
      if (res.message) setMessages((prev) => [...prev, res.message]);
      await loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const startWith = async (contact) => {
    setBusy(true);
    try {
      const res = await api('/teacher/messages', { method: 'POST', body: { parentId: contact._id } });
      const convo = res.conversation;
      setComposing(false);
      showToast(`Chat with ${contact.name}`, 'success');
      navigate(`/teacher/messages/${convo._id}`);
      await loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const title = thread?.title || 'Parent';

  return (
    <div className="tmsg">
      <div className="tmsg-head">
        <div>
          <p className="tw-kicker">Teacher / Messages</p>
          <h2>Messages</h2>
          <p>Chat with parents and guardians. Keep everyone informed and connected.</p>
        </div>
        <div className="tmsg-art" aria-hidden="true">
          <span>💬</span>
          <strong>Strong communication</strong>
          <small>builds brighter futures.</small>
        </div>
      </div>

      {error && <div className="tw-alert">{error}</div>}

      <div className="tmsg-grid">
        <aside className="tmsg-list">
          <div className="tmsg-list-head">
            <h3>Messages</h3>
            <button type="button" className="tmsg-btn tmsg-btn--teal" onClick={() => setComposing((v) => !v)}>
              <Icon name="plus" /> {composing ? 'Chats' : 'New message'}
            </button>
          </div>
          <label className="tmsg-search">
            <Icon name="search" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={composing ? 'Search parents...' : 'Search chats...'}
            />
          </label>
          <div className="tmsg-pills">
            {[
              ['all', 'All'],
              ['parents', 'Parents'],
              ['students', 'Students'],
              ['school', 'School'],
            ].map(([id, label]) => (
              <button key={id} type="button" className={kind === id ? 'is-on' : ''} onClick={() => { setKind(id); setComposing(false); }}>
                {label}
              </button>
            ))}
          </div>

          {composing ? (
            <ul>
              {visibleContacts.map((c) => (
                <li key={c._id}>
                  <button type="button" disabled={busy} onClick={() => startWith(c)}>
                    <span className={`tmsg-ava is-${toneFor(c.name)}`}>
                      {c.photoUrl ? <img src={c.photoUrl} alt="" /> : initials(c.name)}
                    </span>
                    <div>
                      <strong>{c.name}</strong>
                      <small>{c.subtitle || 'Parent / Guardian'}</small>
                    </div>
                  </button>
                </li>
              ))}
              {!visibleContacts.length && <p className="tw-empty">No parent contacts found.</p>}
            </ul>
          ) : (
            <ul>
              {filtered.map((c) => (
                <li key={c._id}>
                  <button
                    type="button"
                    className={id === String(c._id) ? 'is-on' : ''}
                    onClick={() => navigate(`/teacher/messages/${c._id}`)}
                  >
                    <span className={`tmsg-ava is-${toneFor(c.title)}`}>
                      {c.photoUrl ? <img src={c.photoUrl} alt="" /> : initials(c.title)}
                    </span>
                    <div>
                      <strong>{c.title}</strong>
                      <small>{c.lastMessage || 'No messages yet'}</small>
                    </div>
                    <em>
                      {c.timeLabel || ''}
                      {c.unreadCount > 0 ? <b>{c.unreadCount}</b> : null}
                    </em>
                  </button>
                </li>
              ))}
              {!filtered.length && <p className="tw-empty">No chats in this view. Start a new message.</p>}
            </ul>
          )}
        </aside>

        <section className="tmsg-thread">
          {id ? (
            <>
              <header className="tmsg-thread-head">
                <span className={`tmsg-ava is-${toneFor(title)}`}>
                  {thread?.photoUrl ? <img src={thread.photoUrl} alt="" /> : initials(title)}
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{thread?.roleLabel || 'Parent / Guardian'}</p>
                </div>
                <div className="tmsg-thread-tools">
                  <button type="button" aria-label="Call" title="Voice call is not available yet"><Icon name="phone" /></button>
                  <button type="button" aria-label="Video" title="Video call is not available yet"><Icon name="video" /></button>
                  <button type="button" aria-label="More">⋯</button>
                </div>
              </header>
              <div className="tmsg-chat">
                {messages.map((m) => (
                  <div key={m._id} className={`tmsg-bubble ${m.mine ? 'is-mine' : ''}`}>
                    <p>{m.body}</p>
                    <small>{m.timeLabel || ''}</small>
                  </div>
                ))}
                {!messages.length && (
                  <div className="tmsg-empty">
                    <span aria-hidden="true">💬</span>
                    <strong>No messages yet</strong>
                    <p>Start the conversation with {title}. Send a message to share updates, ask questions, or provide feedback.</p>
                    <div className="tmsg-tip">
                      <span aria-hidden="true">💡</span>
                      Tip: Keep parents informed about their child&apos;s progress, homework, and important notices.
                    </div>
                  </div>
                )}
              </div>
              <form className="tmsg-compose" onSubmit={send}>
                <label className="tmsg-icon-btn" title="Attach">
                  <Icon name="clip" />
                  <input
                    type="file"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setBody((prev) => `${prev}${prev ? ' ' : ''}📎 ${file.name}`);
                      e.target.value = '';
                    }}
                  />
                </label>
                <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message..." />
                <button type="button" className="tmsg-icon-btn" onClick={() => setBody((prev) => `${prev}😊`)} aria-label="Emoji">
                  😊
                </button>
                <button className="tmsg-btn tmsg-btn--teal" type="submit" disabled={busy || !body.trim()}>
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="tmsg-empty">
              <span aria-hidden="true">💬</span>
              <strong>Select a conversation</strong>
              <p>Choose a parent chat or start a new message to keep families informed.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
