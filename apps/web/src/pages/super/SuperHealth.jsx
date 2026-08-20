import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { PageFoot, StatusDot } from './shared';

export default function SuperHealth() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () =>
      api('/admin/platform/health')
        .then(setHealth)
        .catch((e) => setError(e.message));
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!health) return <p>Checking system health…</p>;

  const heapPct = health.storage?.heapTotalMb
    ? Math.min(100, Math.round((health.storage.heapUsedMb / health.storage.heapTotalMb) * 100))
    : 0;

  return (
    <div className="sa-page">
      <article className="sa-card">
        <ul className="pa-health-list">
          <li>
            <strong>API</strong>
            <StatusDot status={health.api === 'operational' ? 'operational' : 'down'} />
            <span>Uptime {Math.round((health.uptimeSec || 0) / 60)} min</span>
          </li>
          <li>
            <strong>Database</strong>
            <StatusDot status={health.database === 'operational' ? 'operational' : 'down'} />
            <span>{health.dbPingMs != null ? `${health.dbPingMs} ms ping` : 'Ping failed'}</span>
          </li>
          <li>
            <strong>Backup</strong>
            <span>Not configured — this process does not run backups.</span>
          </li>
          <li>
            <strong>Memory</strong>
            <span>
              Heap {health.storage?.heapUsedMb} / {health.storage?.heapTotalMb} MB · RSS {health.storage?.rssMb} MB
            </span>
            <div className="pa-meter">
              <i style={{ width: `${heapPct}%` }} />
            </div>
          </li>
          <li>
            <strong>Active sessions</strong>
            <span>{health.activeSessions || 0} live sockets</span>
          </li>
          <li>
            <strong>Registered devices</strong>
            <span>{health.registeredDevices || 0} push tokens</span>
          </li>
        </ul>
      </article>
      <PageFoot />
    </div>
  );
}
