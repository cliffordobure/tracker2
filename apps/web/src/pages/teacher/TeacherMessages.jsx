import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

export default function TeacherMessages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState('');
  const [q, setQ] = useState('');
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((c) => `${c.title} ${c.lastMessage}`.toLowerCase().includes(needle));
  }, [conversations, q]);

  const visibleContacts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) => `${c.name} ${c.subtitle}`.toLowerCase().includes(needle));
  }, [contacts, q]);

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

  return (
    <div className="tw-msg">
      <aside className="tw-msg-list">
        <div className="tw-row-between">
          <h2>Messages</h2>
          <button type="button" className="tw-btn tw-btn-secondary" onClick={() => setComposing((v) => !v)}>
            {composing ? 'Chats' : 'New'}
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={composing ? 'Search parents' : 'Search chats'} />
        {error && <div className="tw-alert">{error}</div>}
        {composing ? (
          <ul className="tw-list">
            {visibleContacts.map((c) => (
              <li key={c._id}>
                <button type="button" className="tw-note-btn" disabled={busy} onClick={() => startWith(c)}>
                  <div>
                    <strong>{c.name}</strong>
                    <div className="tw-muted">{c.subtitle || 'Parent'}</div>
                  </div>
                </button>
              </li>
            ))}
            {!visibleContacts.length && <p className="tw-empty">No parent contacts found.</p>}
          </ul>
        ) : (
          <ul className="tw-list">
            {filtered.map((c) => (
              <li key={c._id}>
                <button
                  type="button"
                  className={`tw-note-btn ${id === String(c._id) ? 'is-on' : ''}`}
                  onClick={() => navigate(`/teacher/messages/${c._id}`)}
                >
                  <div>
                    <strong>{c.title}</strong>
                    <div className="tw-muted">{c.lastMessage || 'No messages yet'}</div>
                    <small className="tw-muted">{c.timeLabel || ''}</small>
                  </div>
                  {c.unreadCount > 0 ? <span className="tw-badge">{c.unreadCount}</span> : null}
                </button>
              </li>
            ))}
            {!filtered.length && <p className="tw-empty">No parent chats yet. Start a new message.</p>}
          </ul>
        )}
      </aside>

      <section className="tw-msg-thread">
        {!id ? (
          <p className="tw-empty">Select a parent conversation or start a new one.</p>
        ) : (
          <>
            <header className="tw-panel-head">
              <div>
                <h3>{thread?.title || 'Parent'}</h3>
                <p>Direct chat with a guardian</p>
              </div>
            </header>
            <div className="tw-chat">
              {messages.map((m) => (
                <div key={m._id} className={`tw-bubble ${m.mine ? 'is-mine' : ''}`}>
                  <p>{m.body}</p>
                  <small>{m.timeLabel || ''}</small>
                </div>
              ))}
              {!messages.length && <p className="tw-empty">No messages yet. Say hello.</p>}
            </div>
            <form className="tw-chat-form" onSubmit={send}>
              <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
              <button className="tw-btn tw-btn-primary" type="submit" disabled={busy || !body.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
