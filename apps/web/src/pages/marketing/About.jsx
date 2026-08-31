const stats = [
  { value: '128+', label: 'Schools Onboarded' },
  { value: '1,842+', label: 'Buses Managed' },
  { value: '24,532+', label: 'Students Protected' },
  { value: '99.9%', label: 'Safety Commitment' },
];

export default function About() {
  return (
    <section>
      <h1 className="mk-page-title">About Us</h1>
      <p className="mk-page-sub">We build safer school transport for Kenyan schools, parents, and drivers.</p>
      <div className="mk-about">
        <div>
          <h3>Our Mission</h3>
          <p>
            Create a safer, smarter transport ecosystem so every child is accounted for from the school
            gate to home — with live tracking, check-in alerts, and a workspace staff actually use.
          </p>
          <h3>Our Vision</h3>
          <p>
            Be the all-in-one platform schools trust for transport, attendance, parent communication,
            and classroom updates, without jumping between five different apps.
          </p>
        </div>
        <div className="mk-hero-art">
          <img src="/landing-hero.png" alt="Track Toto School bus at campus" />
        </div>
      </div>
      <div className="mk-stats">
        {stats.map((item) => (
          <article key={item.label}>
            <strong>{item.value}</strong>
            <h3>{item.label}</h3>
          </article>
        ))}
      </div>
    </section>
  );
}
