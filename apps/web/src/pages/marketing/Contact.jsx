import { useState } from 'react';

export default function Contact() {
  const [sent, setSent] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <section>
      <h1 className="mk-page-title">Contact Us</h1>
      <p className="mk-page-sub">We’d love to hear from you.</p>
      <div className="mk-contact">
        <div className="mk-card">
          <div className="mk-info-row">
            <strong>Phone</strong>
            <span>+254 700 000 000</span>
          </div>
          <div className="mk-info-row">
            <strong>Email</strong>
            <span>info@tracktotoschool.com</span>
          </div>
          <div className="mk-info-row">
            <strong>Address</strong>
            <span>Nairobi, Kenya</span>
          </div>
          <div className="mk-info-row">
            <strong>Working hours</strong>
            <span>Mon – Fri, 8:00am – 5:00pm</span>
          </div>
        </div>

        <form className="mk-card mk-form" onSubmit={onSubmit}>
          {sent ? (
            <p className="mk-ok">Message sent. The Track Toto team will get back to you shortly.</p>
          ) : (
            <>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Subject
                <input name="subject" required />
              </label>
              <label>
                Your Message
                <textarea name="message" required />
              </label>
              <button className="mk-btn mk-btn--solid mk-btn--lg" type="submit">
                Send Message
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
