import { useState } from 'react';
import { Link } from 'react-router-dom';

const plans = [
  {
    name: 'Basic',
    blurb: 'Perfect for small schools',
    monthly: 4999,
    icon: 'people',
    tone: 'blue',
    points: ['Up to 5 buses', 'Live tracking', 'Parent notifications', 'Basic reports', 'Email support'],
  },
  {
    name: 'Standard',
    blurb: 'Ideal for growing schools',
    monthly: 9999,
    popular: true,
    icon: 'bus',
    tone: 'blue',
    points: ['Up to 10 buses', 'Live tracking', 'Route management', 'Parent notifications', 'Priority support', 'Smart reports'],
  },
  {
    name: 'Premium',
    blurb: 'For large schools and networks',
    monthly: 19999,
    icon: 'crown',
    tone: 'orange',
    points: ['Unlimited buses', 'Custom reports', 'API access', 'Multi-campus tools', 'Dedicated onboarding', '24/7 priority support'],
  },
];

const perks = [
  { title: 'No Hidden Fees', body: 'Clear and transparent pricing', tone: 'green', icon: 'shield' },
  { title: 'Easy Setup', body: 'Get started in minutes', tone: 'purple', icon: 'gear' },
  { title: 'Dedicated Support', body: "We're here to help", tone: 'blue', icon: 'headset' },
  { title: 'Making Schools Safer', body: 'Our mission always', tone: 'red', icon: 'heart' },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <section className="pr">
      <div className="pr-hero">
        <div>
          <p className="site-kicker">PRICING PLANS</p>
          <h1>
            Simple Plans for <em>Every School</em>
          </h1>
          <p className="pr-lede">
            Choose a plan that fits your school. Live tracking, parent alerts, and safer journeys —
            without complicated pricing.
          </p>
          <div className="pr-toggle-row">
            <div className="pr-toggle" role="group" aria-label="Billing period">
              <button type="button" className={yearly ? '' : 'is-on'} onClick={() => setYearly(false)}>
                Monthly
              </button>
              <button type="button" className={yearly ? 'is-on' : ''} onClick={() => setYearly(true)}>
                Yearly (Save 20%)
              </button>
            </div>
            <span className="pr-off">20% OFF</span>
          </div>
        </div>
        <div className="pr-art">
          <img src="/landing-hero.png" alt="School bus arriving at campus" />
          <p className="site-script">Safer Students Brighter Tomorrows <span>♥</span></p>
        </div>
      </div>

      <div className="pr-plans">
        {plans.map((plan) => {
          const amount = yearly ? Math.round(plan.monthly * 12 * 0.8) : plan.monthly;
          return (
            <article key={plan.name} className={`pr-card${plan.popular ? ' is-hot' : ''}`}>
              {plan.popular && <span className="pr-popular">Most Popular</span>}
              <span className={`pr-ico pr-ico--${plan.tone}`}>
                <PlanIcon name={plan.icon} />
              </span>
              <h3>{plan.name}</h3>
              <p className="pr-blurb">{plan.blurb}</p>
              <p className="pr-price">
                KES {amount.toLocaleString()}
                <span>/{yearly ? 'year' : 'month'}</span>
              </p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>
                    <CheckIcon />
                    {point}
                  </li>
                ))}
              </ul>
              <Link className={`site-btn ${plan.popular ? 'site-btn--solid' : 'site-btn--ghost'} site-btn--wide`} to="/login">
                Get Started
              </Link>
            </article>
          );
        })}
      </div>

      <div className="pr-perks">
        {perks.map((perk) => (
          <article key={perk.title}>
            <span className={`pr-perk-ico pr-perk-ico--${perk.tone}`}>
              <PerkIcon name={perk.icon} />
            </span>
            <div>
              <strong>{perk.title}</strong>
              <p>{perk.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#DBEAFE" />
      <path d="m8 12.2 2.6 2.6L16.4 9" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlanIcon({ name }) {
  if (name === 'crown') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 16 6 8l4 4 2-6 2 6 4-4 2 8H4Zm0 2h16v2H4v-2Z" />
      </svg>
    );
  }
  if (name === 'bus') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 6h14a2 2 0 0 1 2 2v8H3V8a2 2 0 0 1 2-2Zm1 12h2.2a1.8 1.8 0 1 0 0-1.2H7.2A1.8 1.8 0 1 0 6 18Zm9.6 0h2.2a1.8 1.8 0 1 0 0-1.2h-2.2a1.8 1.8 0 1 0 0 1.2Z" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 17 10ZM4.4 19c.8-3 2.8-4.5 4.6-4.5s3.8 1.5 4.6 4.5H4.4Zm9.2 0c.4-1.7 1.3-3 2.5-3.7.6.4 1.4.7 2.3.7 1.5 0 2.8-.7 3.6-1.8V19h-8.4Z" />
    </svg>
  );
}

function PerkIcon({ name }) {
  const paths = {
    shield: 'M12 3 5 6v6.2c0 4.4 2.9 8.4 7 9.8 4.1-1.4 7-5.4 7-9.8V6l-7-3Zm-1 12.2-3-3 1.4-1.4 1.6 1.6 3.8-3.8L16 10l-5 5.2Z',
    gear: 'M10.2 3h3.6l.5 2.2a7 7 0 0 1 1.8 1l2.1-.7 1.8 3.1-1.6 1.5c.1.4.2.8.2 1.2s-.1.8-.2 1.2l1.6 1.5-1.8 3.1-2.1-.7a7 7 0 0 1-1.8 1L13.8 21h-3.6l-.5-2.2a7 7 0 0 1-1.8-1l-2.1.7-1.8-3.1 1.6-1.5A7 7 0 0 1 5.4 12c0-.4.1-.8.2-1.2L4 9.3l1.8-3.1 2.1.7a7 7 0 0 1 1.8-1L10.2 3ZM12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z',
    headset: 'M5 12a7 7 0 0 1 14 0v5a2 2 0 0 1-2 2h-2v-6h4v-1a5 5 0 0 0-10 0v1h4v6H7a2 2 0 0 1-2-2v-5Z',
    heart: 'M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8.2a3.8 3.8 0 0 1 7 2.6C19 15.6 12 20 12 20Z',
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
