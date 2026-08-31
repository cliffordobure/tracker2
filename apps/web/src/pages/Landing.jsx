import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Landing() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <section>
      <div className="mk-hero">
        <div>
          <p className="mk-pill">🛡 Smart Transport. Safer Students. Stronger Schools.</p>
          <h1>
            Smarter School
            <br />
            Transport Management
            <em>All in One Platform</em>
          </h1>
          <p className="mk-lede">
            Track Toto gives schools real-time bus tracking, student safety alerts, and a connected
            workspace for admins, teachers, drivers, and parents — from the school gate to home.
          </p>
          <div className="mk-hero-actions">
            <Link className="mk-btn mk-btn--solid" to="/login">Access Dashboard</Link>
            <button className="mk-btn mk-btn--ghost" type="button" onClick={() => setDemoOpen(true)}>
              Watch Demo
            </button>
          </div>
        </div>
        <div className="mk-hero-art">
          <img src="/landing-hero.png" alt="Track Toto School bus arriving at campus" />
        </div>
      </div>

      {demoOpen && (
        <div className="lp-modal" role="dialog" aria-label="Watch demo" onClick={() => setDemoOpen(false)}>
          <div className="lp-modal-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="lp-modal-close" onClick={() => setDemoOpen(false)} aria-label="Close">×</button>
            <p>See live tracking, parent alerts, and the school admin dashboard in one walkthrough.</p>
            <Link className="mk-btn mk-btn--solid" to="/login">Access Dashboard</Link>
          </div>
        </div>
      )}
    </section>
  );
}
