'use client';

import { useState } from 'react';

const initialForm = {
  email: '',
  channelUrl: '',
};

export default function HomePage() {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [serverMessage, setServerMessage] = useState('');
  const [status, setStatus] = useState('idle');

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('idle');
    setErrors({});
    setServerMessage('');

    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form),
    });

    const payload = await response.json();

    if (!response.ok) {
      setStatus('error');
      setErrors(payload.errors ?? {});
      setServerMessage(payload.message ?? 'Please check the form and try again.');
      return;
    }

    setStatus('success');
    setServerMessage(payload.message);
    setForm(initialForm);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <h1>Channel Digest</h1>
        <p className="hero-copy">
          Subscribe with your email and the YouTube channel you care about, and we&apos;ll send you a digest of the
          latest videos posted there.
        </p>
      </section>

      <section className="content-grid">
        <div className="form-card">
          <div className="form-heading">
            <h2>Subscribe to a channel</h2>
            <p>Enter the email address that should receive updates and paste a valid YouTube channel URL.</p>
          </div>

          <form className="subscribe-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              inputMode="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(event) => updateField('email', event.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email ? (
              <p className="field-error" id="email-error">
                {errors.email}
              </p>
            ) : null}

            <label htmlFor="channelUrl">YouTube channel link</label>
            <input
              id="channelUrl"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/@channelname"
              value={form.channelUrl}
              onChange={(event) => updateField('channelUrl', event.target.value)}
              aria-invalid={Boolean(errors.channelUrl)}
              aria-describedby={errors.channelUrl ? 'channel-error' : undefined}
            />
            {errors.channelUrl ? (
              <p className="field-error" id="channel-error">
                {errors.channelUrl}
              </p>
            ) : null}

            <button type="submit">Start tracking</button>
          </form>

          {(serverMessage || status === 'success') && (
            <div className={`status-panel ${status}`} aria-live="polite">
              {status === 'success' ? <strong>Subscription captured</strong> : null}
              {serverMessage ? <p>{serverMessage}</p> : null}
            </div>
          )}
        </div>

        <div className="info-card" aria-label="Channel information">
          <h2>What you&apos;ll receive</h2>
          <div className="feature-strip">
            <div>
              <span>Latest uploads</span>
              <strong>Tracked automatically</strong>
            </div>
            <div>
              <span>Email delivery</span>
              <strong>Summaries in your inbox</strong>
            </div>
            <div>
              <span>Simple setup</span>
              <strong>One channel link, one email</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
