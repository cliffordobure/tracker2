import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

export default function TeacherNoticeboard() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/teacher/announcements')
      .then((d) => setItems(d.announcements || []))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="stack">
      <div>
        <h2>Noticeboard</h2>
        <p className="lede">School announcements published by admin. Teachers can read, not post.</p>
      </div>
      {error && <div className="alert">{error}</div>}
      {!items.length && !error && <p className="muted">No announcements yet.</p>}
      <ul className="notif-list">
        {items.map((a) => (
          <li key={a._id}>
            <span className="pill">{a.category || 'general'}</span>
            <strong>{a.title}</strong>
            <p>{a.body}</p>
            <small>
              {a.authorName || 'Admin'} ·{' '}
              {a.publishedAt ? new Date(a.publishedAt).toLocaleString() : ''}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}
