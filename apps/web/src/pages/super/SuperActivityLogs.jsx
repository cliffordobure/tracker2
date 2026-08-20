import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Empty, PageFoot, formatWhen } from './shared';

export default function SuperActivityLogs() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/platform/activity')
      .then((d) => setEvents(d.events || []))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="alert">{error}</div>;

  return (
    <div className="sa-page">
      <article className="sa-card">
        {events.length ? (
          <ul className="sa-history">
            {events.map((ev) => (
              <li key={ev.id}>
                <strong>{ev.title}</strong>
                <span>
                  {formatWhen(ev.at)} · {ev.detail}
                  {ev.actor ? ` · ${ev.actor}` : ''}
                  {ev.school ? ` · ${ev.school}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No activity recorded yet.</Empty>
        )}
      </article>
      <PageFoot />
    </div>
  );
}
