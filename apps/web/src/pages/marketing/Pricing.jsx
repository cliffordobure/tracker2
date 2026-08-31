import { useState } from 'react';
import { Link } from 'react-router-dom';

const plans = [
  {
    name: 'Basic',
    monthly: 4999,
    points: ['Up to 5 buses', 'Live tracking', 'Parent notifications', 'Basic reports', 'Email support'],
  },
  {
    name: 'Standard',
    monthly: 9999,
    popular: true,
    points: ['Up to 10 buses', 'Live tracking', 'Route management', 'Priority support', 'Smart reports'],
  },
  {
    name: 'Premium',
    monthly: 19999,
    points: ['Unlimited buses', 'Custom reports', 'API access', 'Multi-campus tools', 'Dedicated onboarding'],
  },
];

export default function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <section>
      <h1 className="mk-page-title">Pricing</h1>
      <p className="mk-page-sub">Simple and flexible plans for schools of all sizes.</p>
      <div className="mk-toggle" role="group" aria-label="Billing period">
        <button type="button" className={yearly ? '' : 'is-on'} onClick={() => setYearly(false)}>
          Monthly
        </button>
        <button type="button" className={yearly ? 'is-on' : ''} onClick={() => setYearly(true)}>
          Yearly (Save 20%)
        </button>
      </div>
      <div className="mk-plans">
        {plans.map((plan) => {
          const amount = yearly ? Math.round(plan.monthly * 12 * 0.8) : plan.monthly;
          return (
            <article key={plan.name} className={`mk-plan${plan.popular ? ' is-hot' : ''}`}>
              {plan.popular && <span className="mk-plan-badge">Most Popular</span>}
              <h3>{plan.name}</h3>
              <p className="mk-price">
                KES {amount.toLocaleString()}
                <span>/{yearly ? 'year' : 'month'}</span>
              </p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
              <Link className={`mk-btn ${plan.popular ? 'mk-btn--solid' : 'mk-btn--ghost'}`} to="/login">
                Get Started
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
