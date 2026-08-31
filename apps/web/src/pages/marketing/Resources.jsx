import { useMemo, useState } from 'react';

const posts = [
  {
    id: 'safety',
    tab: 'Blog',
    title: '5 Ways Technology Improves School Transport Safety',
    excerpt: 'From live maps to check-in alerts, here is how schools reduce risk on every trip.',
    date: '12 Aug 2026',
    image: '/onboard-safety.png',
    body: 'Live tracking, digital registers, parent alerts, driver incident reports, and route history give school teams a complete picture of each trip. Track Toto puts those tools in one place so staff do not miss a pickup or a late bus.',
  },
  {
    id: 'parents',
    tab: 'Guides',
    title: 'How Real-time Tracking Benefits Parents',
    excerpt: 'Parents stay calm when they can see the bus, the stop, and the estimated arrival.',
    date: '4 Aug 2026',
    image: '/onboard-tracking.png',
    body: 'Parents open the app, see the live bus, and get a notification when their child is checked in or dropped. That cuts the “has the bus left?” calls and helps families meet the child at the right time.',
  },
  {
    id: 'guide',
    tab: 'Guides',
    title: 'A Complete Guide to School Transport Management',
    excerpt: 'A practical walkthrough of buses, routes, drivers, trips, and parent communication.',
    date: '28 Jul 2026',
    image: '/onboard-reports.png',
    body: 'Start with campuses and vehicles, add drivers and stops, build routes, then run morning and evening trips. Teachers mark the register, parents follow the ride, and admins review reports at the end of the week.',
  },
  {
    id: 'faq',
    tab: 'FAQs',
    title: 'Frequently asked questions',
    excerpt: 'Who can log in, how alerts work, and what schools need to get started.',
    date: '20 Jul 2026',
    image: '/landing-hero.png',
    body: 'School admins, teachers, drivers, and parents each get their own login. Alerts go out when a trip starts, a student is checked in, or a delay is reported. To start, a school needs buses, routes, and parent contacts.',
  },
];

const tabs = ['All', 'Blog', 'Guides', 'FAQs'];

export default function Resources() {
  const [tab, setTab] = useState('All');
  const [open, setOpen] = useState(null);
  const list = useMemo(
    () => (tab === 'All' ? posts : posts.filter((item) => item.tab === tab)),
    [tab],
  );
  const article = posts.find((item) => item.id === open);

  return (
    <section>
      <h1 className="mk-page-title">Resources</h1>
      <p className="mk-page-sub">Helpful articles, guides and updates for school transport teams.</p>
      <div className="mk-tabs">
        {tabs.map((item) => (
          <button key={item} type="button" className={tab === item ? 'is-on' : ''} onClick={() => { setTab(item); setOpen(null); }}>
            {item}
          </button>
        ))}
      </div>
      {article ? (
        <article className="mk-card">
          <img src={article.image} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12 }} />
          <time>{article.date} · {article.tab}</time>
          <h3>{article.title}</h3>
          <p style={{ marginTop: 8 }}>{article.body}</p>
          <button type="button" className="mk-btn mk-btn--ghost" style={{ marginTop: 16 }} onClick={() => setOpen(null)}>
            ← Back to resources
          </button>
        </article>
      ) : (
        <div className="mk-grid-3">
          {list.map((item) => (
            <article key={item.id} className="mk-card mk-article">
              <img src={item.image} alt="" />
              <h3>{item.title}</h3>
              <p>{item.excerpt}</p>
              <time>{item.date}</time>
              <button type="button" onClick={() => setOpen(item.id)} style={{ border: 0, background: 'none', color: '#1d4ed8', fontWeight: 800, cursor: 'pointer' }}>
                Read More →
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
