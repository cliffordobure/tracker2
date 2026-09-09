import { Link } from 'react-router-dom';

const stats = [
  { value: '128+', label: 'Schools Onboarded' },
  { value: '1,842+', label: 'Buses Managed' },
  { value: '24,532+', label: 'Students Protected' },
  { value: '99.9%', label: 'Safety Commitment' },
];

export default function About() {
  return (
    <section className="ab">
      <div className="ab-hero">
        <div>
          <p className="site-kicker">ABOUT US</p>
          <h1>
            Building Safer Journeys
            <br />
            <em>For Brighter Tomorrows</em>
          </h1>
          <p className="ab-lede">
            Track Toto School helps Kenyan schools, parents, and drivers work together so every child
            is accounted for from the school gate to home.
          </p>
          <div className="ab-mv">
            <article>
              <span className="ab-ico ab-ico--blue" aria-hidden="true">◎</span>
              <div>
                <h3>Our Mission</h3>
                <p>Create a safer, smarter transport ecosystem with live tracking, check-in alerts, and a workspace staff actually use.</p>
              </div>
            </article>
            <article>
              <span className="ab-ico ab-ico--green" aria-hidden="true">◉</span>
              <div>
                <h3>Our Vision</h3>
                <p>Be the all-in-one platform schools trust for transport, attendance, and parent communication.</p>
              </div>
            </article>
          </div>
        </div>
        <div className="ab-art">
          <img src="/landing-hero.png" alt="Track Toto School bus at campus" />
          <div className="rs-badge" style={{ left: 16, right: 'auto', top: 16, bottom: 'auto' }}>
            Safer Students, Brighter Tomorrows
          </div>
          <p className="site-script rs-script">Every Child Matters <span>♥</span></p>
        </div>
      </div>

      <div className="ab-stats">
        {stats.map((item) => (
          <article key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>

      <div className="ab-why" id="why">
        <div>
          <p className="site-kicker">WHY CHOOSE US</p>
          <h2 style={{ fontSize: 'clamp(28px, 3vw, 36px)', fontWeight: 800, margin: '0 0 0.7rem' }}>
            More Than Transport.
            <br />
            <em style={{ color: '#2563eb', fontStyle: 'normal' }}>A Safer Future.</em>
          </h2>
          <p>We built Track Toto so schools can see every bus, every stop, and every child — without juggling five different apps.</p>
        </div>
        <div className="ab-why-grid">
          <article className="ab-why-card ab-why-card--blue">
            <span className="ab-ico ab-ico--blue">🛡️</span>
            <h3>Child-Centred</h3>
            <p>Every check-in, drop-off, and alert is built around keeping students visible and safe.</p>
          </article>
          <article className="ab-why-card ab-why-card--green">
            <span className="ab-ico ab-ico--green">👥</span>
            <h3>Trusted by Schools</h3>
            <p>Admins, teachers, drivers, and parents share one live picture of the journey.</p>
          </article>
          <article className="ab-why-card ab-why-card--orange">
            <span className="ab-ico ab-ico--orange">📊</span>
            <h3>Continuous Innovation</h3>
            <p>Routes, reports, and alerts keep getting simpler as schools grow.</p>
          </article>
        </div>
      </div>

      <div className="ab-cta">
        <span className="ab-ico ab-ico--blue" aria-hidden="true">🤝</span>
        <div>
          <strong>Let&apos;s Build Safer Schools Together</strong>
          <p>Join hundreds of schools already using Track Toto School.</p>
        </div>
        <Link className="site-btn site-btn--solid" to="/pricing">Get Started Today →</Link>
      </div>
    </section>
  );
}
