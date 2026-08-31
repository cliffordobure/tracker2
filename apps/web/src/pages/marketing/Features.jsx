function Ico({ children, tone }) {
  return <span className={`mk-ico mk-ico--${tone}`}>{children}</span>;
}

const items = [
  {
    title: 'Live Tracking',
    body: 'Track school buses in real time on a live map and stay updated about every journey.',
    tone: 'purple',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.2a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6Z" /></svg>
    ),
  },
  {
    title: 'Student Safety',
    body: 'Smart check-in alerts and monitoring help schools keep every student safe.',
    tone: 'green',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 5 6v6.2c0 4.4 2.9 8.4 7 9.8 4.1-1.4 7-5.4 7-9.8V6l-7-3Z" /></svg>
    ),
  },
  {
    title: 'Smart Reports',
    body: 'Get real-time insights and reports to improve transport operations and decisions.',
    tone: 'lavender',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 19V9h3v10H5Zm6 0V5h3v14h-3Zm6 0v-7h3v7h-3Z" /></svg>
    ),
  },
  {
    title: 'Instant Notifications',
    body: 'Parents and staff get pickup, delay, and trip updates the moment they happen.',
    tone: 'orange',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5L3 19h18l-2-3Z" /></svg>
    ),
  },
  {
    title: 'Route Management',
    body: 'Plan, assign, and optimize morning and evening routes from one dashboard.',
    tone: 'blue',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm10 15a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.2 8.6 16 16.2" /></svg>
    ),
  },
  {
    title: 'User Management',
    body: 'Manage drivers, students, teachers, and parents with clear roles and access.',
    tone: 'cyan',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 17 10ZM4.5 19c.8-3 2.8-4.4 4.5-4.4s3.7 1.4 4.5 4.4H4.5Z" /></svg>
    ),
  },
];

export default function Features() {
  return (
    <section>
      <h1 className="mk-page-title">Features</h1>
      <p className="mk-page-sub">Everything you need to manage school transport efficiently and keep students safe.</p>
      <div className="mk-grid-3">
        {items.map((item) => (
          <article key={item.title} className="mk-card">
            <Ico tone={item.tone}>{item.icon}</Ico>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
