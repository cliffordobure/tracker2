import { useMemo, useState } from 'react';

const posts = [
  {
    id: 'safety',
    tab: 'Blog',
    tag: 'Safety',
    tone: 'green',
    title: '5 Ways Technology Improves School Transport Safety',
    excerpt: 'From live maps to check-in alerts, here is how schools reduce risk on every trip.',
    date: '12 Aug 2026',
    image: '/onboard-safety.png',
    body: 'Live tracking, digital registers, parent alerts, driver incident reports, and route history give school teams a complete picture of each trip. Track Toto puts those tools in one place so staff do not miss a pickup or a late bus.',
  },
  {
    id: 'parents',
    tab: 'Blog',
    tag: 'Parents',
    tone: 'blue',
    title: 'How Real-time Tracking Benefits Parents',
    excerpt: 'Parents stay calm when they can see the bus, the stop, and the estimated arrival.',
    date: '4 Aug 2026',
    image: '/onboard-tracking.png',
    body: 'Parents open the app, see the live bus, and get a notification when their child is checked in or dropped. That cuts the “has the bus left?” calls and helps families meet the child at the right time.',
  },
  {
    id: 'guide',
    tab: 'Guides',
    tag: 'Guide',
    tone: 'purple',
    title: 'A Complete Guide to School Transport Management',
    excerpt: 'A practical walkthrough of buses, routes, drivers, trips, and parent communication.',
    date: '28 Jul 2026',
    image: '/onboard-reports.png',
    body: 'Start with campuses and vehicles, add drivers and stops, build routes, then run morning and evening trips. Teachers mark the register, parents follow the ride, and admins review reports at the end of the week.',
  },
  {
    id: 'faq',
    tab: 'FAQs',
    tag: 'FAQs',
    tone: 'blue',
    title: 'Frequently asked questions',
    excerpt: 'Who can log in, how alerts work, and what schools need to get started.',
    date: '20 Jul 2026',
    image: '/landing-hero.png',
    body: 'School admins, teachers, drivers, and parents each get their own login. Alerts go out when a trip starts, a student is checked in, or a delay is reported. To start, a school needs buses, routes, and parent contacts.',
  },
];

const tabs = [
  { id: 'All', icon: 'grid' },
  { id: 'Blog', icon: 'doc' },
  { id: 'Guides', icon: 'book' },
  { id: 'FAQs', icon: 'help' },
];

export default function Resources() {
  const [tab, setTab] = useState('All');
  const [open, setOpen] = useState(null);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const list = useMemo(
    () => (tab === 'All' ? posts.filter((item) => item.id !== 'faq' || tab === 'FAQs') : posts.filter((item) => item.tab === tab)),
    [tab],
  );
  const cards = tab === 'All' ? posts.filter((item) => item.id !== 'faq') : list;
  const article = posts.find((item) => item.id === open);

  return (
    <section className="rs">
      <div className="rs-hero">
        <div>
          <p className="site-kicker">RESOURCES</p>
          <h1>
            Knowledge for <em>Safer School Journeys</em>
          </h1>
          <p className="rs-lede">
            Helpful articles, guides and updates for school transport teams, parents and schools.
          </p>
          <div className="rs-tabs" role="tablist" aria-label="Resource type">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={tab === item.id ? 'is-on' : ''}
                onClick={() => {
                  setTab(item.id);
                  setOpen(null);
                }}
              >
                <TabIcon name={item.icon} />
                {item.id}
              </button>
            ))}
          </div>
        </div>
        <div className="rs-art">
          <img src="/landing-hero.png" alt="Students and school bus at campus" />
          <p className="site-script rs-script">Smarter Transport Happier Students <span>♥</span></p>
          <div className="rs-badge">
            <PeopleIcon />
            <span>Safe Students Brighter Tomorrows</span>
          </div>
        </div>
      </div>

      {article ? (
        <article className="rs-full">
          <img src={article.image} alt="" />
          <span className={`rs-tag rs-tag--${article.tone}`}>{article.tag}</span>
          <time>{article.date}</time>
          <h2>{article.title}</h2>
          <p>{article.body}</p>
          <button type="button" className="site-btn site-btn--ghost" onClick={() => setOpen(null)}>
            ← Back to resources
          </button>
        </article>
      ) : (
        <div className="rs-grid">
          {cards.map((item) => (
            <article key={item.id} className="rs-card">
              <div className="rs-card-media">
                <img src={item.image} alt="" />
              </div>
              <span className={`rs-tag rs-tag--${item.tone}`}>{item.tag}</span>
              <h3>{item.title}</h3>
              <p>{item.excerpt}</p>
              <div className="rs-card-foot">
                <time>
                  <CalIcon />
                  {item.date}
                </time>
                <button type="button" onClick={() => setOpen(item.id)}>
                  Read More →
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <form
        className="rs-news"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) setSubscribed(true);
        }}
      >
        <span className="rs-news-ico" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="6" width="18" height="12" rx="2" stroke="#fff" strokeWidth="1.8" />
            <path d="m4 8 8 6 8-6" stroke="#fff" strokeWidth="1.8" />
          </svg>
        </span>
        <div className="rs-news-copy">
          <strong>Get the Latest Resources</strong>
          <p>{subscribed ? 'Thanks — we will send new guides to your inbox.' : 'Subscribe to receive new guides, tips and product updates.'}</p>
        </div>
        {!subscribed && (
          <label className="rs-news-field">
            <span className="sr-only">Email address</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="6" width="18" height="12" rx="2" stroke="#94A3B8" strokeWidth="1.8" />
              <path d="m4 8 8 6 8-6" stroke="#94A3B8" strokeWidth="1.8" />
            </svg>
            <input
              type="email"
              required
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {!subscribed && (
          <button className="site-btn site-btn--solid" type="submit">
            Subscribe
          </button>
        )}
        <p className="site-script rs-news-script">Together for Safer Schools <span>♥</span></p>
      </form>
    </section>
  );
}

function TabIcon({ name }) {
  const d = {
    grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
    doc: 'M7 3h8l4 4v14H7V3Zm8 1.2V8h3.6',
    book: 'M5 4h6a4 4 0 0 1 4 4v12H9a4 4 0 0 0-4 4V4Zm8 0h6v16a4 4 0 0 0-4-4h-2V8a4 4 0 0 0-4-4Z',
    help: 'M12 3a9 9 0 1 0 .01 18.01A9 9 0 0 0 12 3Zm0 14.2a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2ZM10.8 8.4c.4-.8 1.2-1.3 2.2-1.3 1.3 0 2.2.8 2.2 2 0 1.4-1.3 1.8-1.9 2.3-.6.4-.8.8-.8 1.6h-1.6c0-1.3.5-1.9 1.3-2.5.6-.4 1.1-.7 1.1-1.3 0-.4-.3-.7-.8-.7-.5 0-.8.3-1 1l-1.7-.6Z',
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d[name]} />
    </svg>
  );
}

function CalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#2563EB" aria-hidden="true">
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 17 10ZM4.4 19c.8-3 2.8-4.5 4.6-4.5s3.8 1.5 4.6 4.5H4.4Z" />
    </svg>
  );
}
