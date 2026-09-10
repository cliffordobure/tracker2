import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePathForRole } from '../lib/roles';
import LoginCard from '../components/LoginCard';

const points = [
  { title: 'Real-time Tracking', body: 'Know where your school bus is.', tone: 'green' },
  { title: 'Safer Students', body: 'Check-in and drop-off alerts.', tone: 'purple' },
  { title: 'Instant Notifications', body: 'Keep parents informed.', tone: 'orange' },
  { title: 'Better School Operations', body: 'Simple and reliable.', tone: 'blue' },
];

export default function Landing() {
  const { user, loading } = useAuth();

  if (!loading && user) return <Navigate to={homePathForRole(user.role)} replace />;

  return (
    <>
      <section className="hm">
        <div className="hm-hero">
          <div>
            <p className="site-kicker">SCHOOL TRANSPORT MANAGEMENT</p>
            <h1>
              Safe Journeys.
              <br />
              <em>Brighter Futures.</em>
            </h1>
            <p className="hm-lede">
              Track Toto helps schools, parents, and drivers work together so every child travels safely
              from home to school and back.
            </p>
            <div className="hm-features">
              {points.map((item) => (
                <article key={item.title}>
                  <span className={`ab-ico ab-ico--${item.tone === 'purple' ? 'blue' : item.tone}`} />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </div>
                </article>
              ))}
            </div>
            <p className="site-script">Every Child Matters <span>♥</span></p>
          </div>

          <LoginCard />
        </div>
      </section>
      <div className="hm-stats">
        <article><div><strong>10,000+</strong><span>Students Transported</span></div></article>
        <article><div><strong>200+</strong><span>Partner Schools</span></div></article>
        <article><div><strong>99.9%</strong><span>Safety Record</span></div></article>
        <article><div><strong>Happier</strong><span>Parents & Schools</span></div></article>
      </div>
      <div className="hm-foot">
        <span>TRACK TOTO SCHOOL | Smarter Transport. Safer Students. Stronger Schools.</span>
        <span>Privacy Policy · Terms of Service · Contact</span>
      </div>
    </>
  );
}
