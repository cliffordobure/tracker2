import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, formatWhen } from './shared';

export default function SuperNotifications() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/platform/notifications')
      .then((d) => setItems(d.notifications || []))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;

  return (
    <div className="sa-page">
      <article className="sa-card">
        {items.length ? (
          <ul className="sa-history">
            {items.map((n) => (
              <li key={n._id}>
                <strong>{n.title}</strong>
                <span>
                  {n.body} · {formatWhen(n.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No notifications for this Super Admin account.</Empty>
        )}
      </article>
      <PageFoot />
    </div>
  );
}
