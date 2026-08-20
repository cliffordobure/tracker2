import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'documents', label: 'Documents' },
  { id: 'trips', label: 'Trips' },
  { id: 'fuel', label: 'Fuel & Costs' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity Log' },
];

const TYPE_LABELS = {
  school_bus: 'School Bus',
  bus: 'Bus',
  minibus: 'Minibus',
  van: 'Van',
};

const FUEL_LABELS = {
  diesel: 'Diesel',
  petrol: 'Petrol',
  hybrid: 'Hybrid',
  electric: 'Electric',
};

function dash(value) {
  if (value == null || value === 0) return value === 0 ? '0' : '—';
  const s = String(value).trim();
  return s || '—';
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'B';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function daysUntil(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function vehicleName(bus) {
  return bus?.label || bus?.plate || 'Vehicle';
}

function statusMeta(bus) {
  if (bus?.status === 'maintenance' || bus?.serviceStatus === 'maintenance') {
    return { key: 'inactive', label: 'Under Maintenance' };
  }
  if (bus?.status === 'out_of_service' || bus?.serviceStatus === 'out_of_service' || bus?.active === false) {
    return { key: 'noroute', label: 'Out of Service' };
  }
  return { key: 'active', label: 'Active' };
}

function tripStatusMeta(status) {
  if (status === 'completed') return { key: 'active', label: 'Completed' };
  if (status === 'active') return { key: 'active', label: 'In progress' };
  if (status === 'scheduled') return { key: 'inactive', label: 'Scheduled' };
  if (status === 'cancelled') return { key: 'noroute', label: 'Cancelled' };
  return { key: 'muted', label: status || '—' };
}

function daysNote(days, { expiredLabel, todayLabel, leftLabel }) {
  if (days == null) return null;
  if (days < 0) return <small className="sa-drv-expiry is-expired">{expiredLabel}</small>;
  if (days === 0) return <small className="sa-dd-days">{todayLabel}</small>;
  return <small className={leftLabel === 'service' ? 'sa-bus-service' : 'sa-dd-days'}>{`${days} days left`}</small>;
}

export default function VehicleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [menuOpen, setMenuOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api(`/admin/buses/${id}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const bus = data?.bus;
  const driver = data?.drivers?.[0];
  const year = new Date().getFullYear();
  const status = statusMeta(bus);
  const insDays = daysUntil(bus?.insuranceExpiry);
  const svcDays = daysUntil(bus?.nextServiceAt);

  const setStatus = async (serviceStatus) => {
    try {
      await api(`/admin/buses/${bus._id}`, { method: 'PUT', body: { serviceStatus } });
      setMenuOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!confirm(`Remove ${vehicleName(bus)}?`)) return;
    try {
      await api(`/admin/buses/${bus._id}`, { method: 'DELETE' });
      navigate('/school-admin/buses');
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="sa-sd">
        <div className="sa-skeleton sa-skeleton-hero" />
      </div>
    );
  }

  if (error && !bus) return <div className="alert">{error}</div>;
  if (!bus) return <div className="sa-empty-panel"><h2>Vehicle not found</h2></div>;

  return (
    <div className="sa-sd sa-vd">
      {error && <div className="alert">{error}</div>}

      <div className="sa-sd-top">
        <Link to="/school-admin/buses" className="sa-text-link">
          ← Back to Vehicles
        </Link>
        <div className="sa-sd-top-actions">
          <Link to={`/school-admin/buses?edit=${bus._id}`} className="sa-btn sa-btn-outline">
            Edit Vehicle
          </Link>
          <div className="sa-sd-menu-wrap">
            <button type="button" className="sa-btn sa-btn-primary" onClick={() => setMenuOpen((v) => !v)}>
              Actions ▾
            </button>
            {menuOpen && (
              <div className="sa-stu-menu sa-sd-menu">
                {status.label !== 'Active' && (
                  <button type="button" onClick={() => setStatus('active')}>Mark active</button>
                )}
                {status.label !== 'Under Maintenance' && (
                  <button type="button" onClick={() => setStatus('maintenance')}>Under maintenance</button>
                )}
                {status.label !== 'Out of Service' && (
                  <button type="button" onClick={() => setStatus('out_of_service')}>Out of service</button>
                )}
                <button type="button" className="is-danger" onClick={remove}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="sa-card sa-sd-profile sa-vd-profile">
        <div className="sa-sd-identity">
          {bus.photoUrl ? <img src={bus.photoUrl} alt="" /> : <span>{initials(vehicleName(bus))}</span>}
          <div>
            <div className="sa-sd-name">
              <h2>{vehicleName(bus)}</h2>
              <em className={`sa-stu-status is-${status.key}`}>{status.label}</em>
            </div>
            <p className="sa-sd-meta">
              {[
                bus.plate ? `Reg. ${bus.plate}` : null,
                bus.code ? `ID ${bus.code}` : null,
              ]
                .filter(Boolean)
                .join('  ·  ') || '—'}
            </p>
            <p className="sa-sd-meta">
              {[
                bus.model,
                TYPE_LABELS[bus.vehicleType],
                bus.seats ? `${bus.seats} seats` : null,
                FUEL_LABELS[bus.fuelType],
              ]
                .filter(Boolean)
                .join('  ·  ') || '—'}
            </p>
          </div>
        </div>
        <div className="sa-sd-sidebits sa-vd-bits">
          <div>
            <strong>Insurance</strong>
            <p>{dash(bus.insuranceProvider)}</p>
            <p>{bus.insurancePolicyNo ? `Policy ${bus.insurancePolicyNo}` : 'No policy on file'}</p>
            <p>
              {bus.insuranceExpiry ? (
                <>
                  Expires {fmtDate(bus.insuranceExpiry)}
                  {daysNote(insDays, { expiredLabel: 'Expired', todayLabel: 'Expires today' })}
                </>
              ) : (
                'No expiry on file'
              )}
            </p>
          </div>
          <div>
            <strong>Service</strong>
            <p>
              {bus.nextServiceAt ? (
                <>
                  Next {fmtDate(bus.nextServiceAt)}
                  {daysNote(svcDays, { expiredLabel: 'Overdue', todayLabel: 'Due today', leftLabel: 'service' })}
                </>
              ) : (
                'No service date on file'
              )}
            </p>
            <p>{bus.lastServiceAt ? `Last ${fmtDate(bus.lastServiceAt)}` : 'No last service saved'}</p>
          </div>
          <div>
            <strong>Assigned driver</strong>
            {driver ? (
              <>
                <p>{driver.name}</p>
                <p>{[driver.phone, driver.licenseNumber].filter(Boolean).join(' · ') || '—'}</p>
                {data.drivers.length > 1 ? <p>+{data.drivers.length - 1} more</p> : null}
              </>
            ) : (
              <p>No driver assigned</p>
            )}
          </div>
        </div>
      </section>

      <nav className="sa-sd-tabs" aria-label="Vehicle sections">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'maintenance' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Maintenance</h3>
            <Link to={`/school-admin/buses?edit=${bus._id}`} className="sa-btn sa-btn-outline">
              Edit dates
            </Link>
          </div>
          <dl className="sa-sd-dl">
            <div><dt>Status</dt><dd>{status.label}</dd></div>
            <div><dt>Last service</dt><dd>{dash(fmtDate(bus.lastServiceAt))}</dd></div>
            <div>
              <dt>Next service</dt>
              <dd>
                {dash(fmtDate(bus.nextServiceAt))}
                {daysNote(svcDays, { expiredLabel: 'Overdue', todayLabel: 'Due today', leftLabel: 'service' })}
              </dd>
            </div>
            <div><dt>Mileage</dt><dd>{bus.mileage != null ? `${Number(bus.mileage).toLocaleString()} km` : '—'}</dd></div>
          </dl>
          <p className="sa-muted">Individual workshop visits are not stored beyond last and next service dates.</p>
        </section>
      )}

      {tab === 'documents' && (
        <section className="sa-card sa-sd-tab">
          <h3>Documents</h3>
          <dl className="sa-sd-dl">
            <div>
              <dt>Photo</dt>
              <dd>
                {bus.photoUrl ? (
                  <a href={bus.photoUrl} target="_blank" rel="noreferrer">Open</a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div><dt>Insurance provider</dt><dd>{dash(bus.insuranceProvider)}</dd></div>
            <div><dt>Policy no.</dt><dd>{dash(bus.insurancePolicyNo)}</dd></div>
          </dl>
          <p className="sa-muted">Scanned logbook and inspection files are not stored.</p>
        </section>
      )}

      {tab === 'trips' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Trips</h3>
            <Link to="/school-admin/trip-instances" className="sa-btn sa-btn-outline">
              All trips
            </Link>
          </div>
          {data.recentTrips?.length ? (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTrips.map((t) => {
                  const meta = tripStatusMeta(t.status);
                  return (
                    <tr key={t.id}>
                      <td>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</td>
                      <td>{t.routeName || '—'}</td>
                      <td>{t.driverName || '—'}</td>
                      <td><em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="sa-muted">No trips recorded for this vehicle.</p>
          )}
        </section>
      )}

      {tab === 'fuel' && (
        <section className="sa-card sa-sd-tab">
          <h3>Fuel & costs</h3>
          <dl className="sa-sd-dl">
            <div><dt>Fuel type</dt><dd>{dash(FUEL_LABELS[bus.fuelType])}</dd></div>
          </dl>
          <p className="sa-muted">Fuel litres and running costs are not tracked in this system.</p>
        </section>
      )}

      {tab === 'insurance' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Insurance</h3>
            <Link to={`/school-admin/buses?edit=${bus._id}`} className="sa-btn sa-btn-outline">
              Edit
            </Link>
          </div>
          <dl className="sa-sd-dl">
            <div><dt>Provider</dt><dd>{dash(bus.insuranceProvider)}</dd></div>
            <div><dt>Policy no.</dt><dd>{dash(bus.insurancePolicyNo)}</dd></div>
            <div>
              <dt>Expiry</dt>
              <dd>
                {dash(fmtDate(bus.insuranceExpiry))}
                {daysNote(insDays, { expiredLabel: 'Expired', todayLabel: 'Expires today', leftLabel: 'days' })}
              </dd>
            </div>
          </dl>
          <p className="sa-muted">Claims history is not stored.</p>
        </section>
      )}

      {tab === 'assignments' && (
        <section className="sa-card sa-sd-tab">
          <div className="sa-rd-card-head">
            <h3>Assignments</h3>
            <Link to="/school-admin/drivers" className="sa-btn sa-btn-outline">
              Drivers
            </Link>
          </div>
          <h4>Drivers</h4>
          {data.drivers?.length ? (
            <ul className="sa-td-list">
              {data.drivers.map((d) => (
                <li key={d.id}>
                  <Link to={`/school-admin/drivers/${d.id}`}>{d.name}</Link>
                  {d.phone ? ` · ${d.phone}` : ''}
                  {d.licenseNumber ? ` · ${d.licenseNumber}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No driver is assigned to this vehicle.</p>
          )}
          <h4>Routes</h4>
          {data.routes?.length ? (
            <ul className="sa-td-list">
              {data.routes.map((r) => (
                <li key={r.id}>
                  {r.name ? <Link to={`/school-admin/routes/${r.id}`}>{r.name}</Link> : r.id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sa-muted">No routes are linked through assigned drivers.</p>
          )}
        </section>
      )}

      {tab === 'notes' && (
        <section className="sa-card sa-sd-tab">
          <h3>Notes</h3>
          {bus.safetyFeatures ? (
            <p className="sa-sd-remarks">{bus.safetyFeatures}</p>
          ) : (
            <p className="sa-muted">No notes stored on this vehicle.</p>
          )}
        </section>
      )}

      {tab === 'activity' && (
        <section className="sa-card sa-sd-tab">
          <h3>Activity log</h3>
          <ul className="sa-activity">
            <li>
              <strong>Vehicle updated</strong>
              <small>{fmtDate(bus.updatedAt) || '—'}</small>
            </li>
            {bus.lastServiceAt ? (
              <li>
                <strong>Last service date</strong>
                <small>{fmtDate(bus.lastServiceAt)}</small>
              </li>
            ) : null}
            {(data.recentTrips || []).slice(0, 12).map((t) => (
              <li key={t.id}>
                <strong>{tripStatusMeta(t.status).label} trip</strong>
                <span>{[t.routeName, t.driverName].filter(Boolean).join(' · ')}</span>
                <small>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'overview' && (
        <>
          <section className="sa-dd-grid">
            <article className="sa-card">
              <h3>Vehicle Information</h3>
              <dl className="sa-sd-dl">
                <div><dt>Year</dt><dd>{dash(bus.year)}</dd></div>
                <div><dt>Chassis no.</dt><dd>{dash(bus.chassisNumber)}</dd></div>
                <div><dt>Engine no.</dt><dd>{dash(bus.engineNumber)}</dd></div>
                <div><dt>Colour</dt><dd>{dash(bus.color)}</dd></div>
                <div><dt>Mileage</dt><dd>{bus.mileage != null ? `${Number(bus.mileage).toLocaleString()} km` : '—'}</dd></div>
                <div><dt>Date added</dt><dd>{dash(fmtDate(bus.createdAt))}</dd></div>
              </dl>
            </article>

            <article className="sa-card">
              <h3>Vehicle Status</h3>
              <dl className="sa-sd-dl">
                <div>
                  <dt>Status</dt>
                  <dd><span className={`sa-stu-status is-${status.key}`}>{status.label}</span></dd>
                </div>
                <div><dt>Availability</dt><dd>{status.label === 'Active' ? 'Available' : 'Not available'}</dd></div>
                <div><dt>Last updated</dt><dd>{dash(fmtDate(bus.updatedAt))}</dd></div>
                <div><dt>Assistant</dt><dd>{dash([bus.assistantName, bus.assistantPhone].filter(Boolean).join(' · '))}</dd></div>
                <div><dt>Remarks</dt><dd>{dash(bus.safetyFeatures)}</dd></div>
              </dl>
            </article>

            <article className="sa-card">
              <h3>Capacity & Features</h3>
              <dl className="sa-sd-dl">
                <div><dt>Seating</dt><dd>{bus.seats ? `${bus.seats} seats` : '—'}</dd></div>
                <div><dt>Type</dt><dd>{dash(TYPE_LABELS[bus.vehicleType])}</dd></div>
                <div><dt>Fuel</dt><dd>{dash(FUEL_LABELS[bus.fuelType])}</dd></div>
              </dl>
              {bus.safetyFeatures ? (
                <p className="sa-sd-remarks">{bus.safetyFeatures}</p>
              ) : (
                <p className="sa-muted">No equipment list is stored for this vehicle.</p>
              )}
            </article>

            <article className="sa-card sa-sd-actions-card">
              <h3>Quick Actions</h3>
              <div className="sa-sd-quick">
                <Link to="/school-admin/drivers">Assign Driver</Link>
                <Link to="/school-admin/routes">Assign Route</Link>
                <Link to="/school-admin/trip-instances">View Trips</Link>
                <button type="button" onClick={() => setTab('maintenance')}>Schedule Service</button>
                <button type="button" onClick={() => setTab('fuel')}>Add Fuel Record</button>
                <button type="button" onClick={() => setTab('documents')}>Upload Document</button>
                <button type="button" onClick={() => setTab('notes')}>Add Note</button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => setStatus(status.label === 'Active' ? 'out_of_service' : 'active')}
                >
                  {status.label === 'Active' ? 'Mark as Inactive' : 'Mark as Active'}
                </button>
              </div>
            </article>
          </section>

          <section className="sa-dd-bottom">
            <article className="sa-card">
              <h3>Recent Trips</h3>
              {data.recentTrips?.length ? (
                <table className="sa-td-mini">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Route</th>
                      <th>Driver</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentTrips.map((t) => {
                      const meta = tripStatusMeta(t.status);
                      return (
                        <tr key={t.id}>
                          <td>{fmtDate(t.serviceDate || t.scheduledFor || t.startedAt) || '—'}</td>
                          <td>{t.routeName || '—'}</td>
                          <td>{t.driverName || '—'}</td>
                          <td><em className={`sa-stu-status is-${meta.key}`}>{meta.label}</em></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="sa-muted">No trips recorded for this vehicle yet.</p>
              )}
              <Link to="/school-admin/trip-instances" className="sa-text-link">
                View all trips
              </Link>
            </article>

            <article className="sa-card">
              <h3>Service History</h3>
              <p className="sa-muted">Service visits are not stored for this vehicle yet.</p>
              <button type="button" className="sa-text-link" onClick={() => setTab('maintenance')}>
                View all services
              </button>
            </article>

            <article className="sa-card">
              <h3>Fuel Summary (This Month)</h3>
              <p className="sa-muted">Fuel use and costs are not tracked in this system yet.</p>
              <button type="button" className="sa-text-link" onClick={() => setTab('fuel')}>
                View fuel records
              </button>
            </article>

            <article className="sa-card">
              <h3>Documents</h3>
              <p className="sa-muted">No vehicle documents are stored yet.</p>
              <button type="button" className="sa-text-link" onClick={() => setTab('documents')}>
                View all documents
              </button>
            </article>
          </section>
        </>
      )}

      <footer className="sa-home-foot">
        <span>© {year} {data.schoolName || 'School'} Transport</span>
        <span>Transport Management System v1.0.0</span>
      </footer>
    </div>
  );
}
