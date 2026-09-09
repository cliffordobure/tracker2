import { Link } from 'react-router-dom';

const items = [
  { title: 'Live Tracking', body: 'Track school buses in real time on a live map and stay updated about every journey.', tone: 'blue', more: '/resources' },
  { title: 'Student Safety', body: 'Smart check-in alerts and continuous monitoring help schools keep every student safe.', tone: 'green', more: '/resources' },
  { title: 'Smart Reports', body: 'Get real-time insights and reports to improve transport operations and decisions.', tone: 'purple', more: '/resources' },
  { title: 'Instant Notifications', body: 'Parents and staff get pickup, delay, and trip updates the moment they happen.', tone: 'orange', more: '/resources' },
  { title: 'Route Management', body: 'Plan, assign, and optimize morning and evening routes from one dashboard.', tone: 'slate', more: '/resources' },
  { title: 'User Management', body: 'Manage drivers, students, teachers, and parents with clear roles and access.', tone: 'pink', more: '/resources' },
];

export default function Features() {
  return (
    <section className="ft">
      <div className="ft-hero">
        <div>
          <p className="site-kicker">OUR FEATURES</p>
          <h1>
            Everything You Need for <em>Smarter School Transport</em>
          </h1>
          <p className="ft-lede">
            Powerful features designed to keep students safe, simplify operations and give parents peace of mind.
          </p>
        </div>
        <div className="ft-art">
          <img src="/features-hero.jpg" alt="School bus at campus" onError={(e) => { e.currentTarget.src = '/landing-hero.png'; }} />
          <div className="rs-badge">Safe Students Brighter Tomorrows</div>
        </div>
      </div>

      <div className="ft-grid">
        {items.map((item) => (
          <article key={item.title} className={`ft-card ft-card--${item.tone}`}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
            <Link to={item.more}>Learn more →</Link>
          </article>
        ))}
      </div>

      <div className="ft-cta">
        <span className="ab-ico ab-ico--blue" aria-hidden="true">✓</span>
        <div>
          <strong>Join schools that trust Track Toto School</strong>
          <p>Smarter Transport. Safer Students. Stronger Schools.</p>
        </div>
        <Link className="site-btn site-btn--solid" to="/pricing">Get Started Today →</Link>
        <p className="site-script" style={{ marginLeft: 8 }}>Every Child Matters <span>♥</span></p>
      </div>
    </section>
  );
}
