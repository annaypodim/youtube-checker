'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '../../src/supabase-browser.js';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();

    // Listen for the PASSWORD_RECOVERY event from the magic link token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Also check if user already has an active session (they may have arrived
    // after the event already fired, e.g. from a page refresh)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    if (password.length < 6) {
      setMessageType('error');
      setMessage('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setMessageType('error');
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setMessageType('success');
      setMessage('Password updated! Redirecting to dashboard…');
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Could not update password. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <main className="page-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <p style={{ fontFamily: 'Arial, sans-serif', color: 'var(--muted)', textAlign: 'center' }}>
          Verifying recovery link…
        </p>
      </main>
    );
  }

  return (
    <main className="page-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Back link */}
      <div style={{ marginBottom: '12px' }}>
        <Link href="/login" style={{ fontFamily: 'Arial, sans-serif', fontSize: '0.88rem', color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back to sign in
        </Link>
      </div>

      <div className="form-card" style={{ maxWidth: '460px', width: '100%', margin: '0 auto' }}>
        <div className="form-heading">
          <h2>Set a new password</h2>
          <p>Enter your new password below.</p>
        </div>

        <form className="subscribe-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="reset-password">New password</label>
          <input
            id="reset-password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={6}
          />

          <label htmlFor="reset-confirm">Confirm new password</label>
          <input
            id="reset-confirm"
            type="password"
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          <div className="form-actions">
            <button type="submit" disabled={loading} style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </div>
        </form>

        {message && (
          <div className={`status-panel ${messageType}`} aria-live="polite" style={{ marginTop: '16px' }}>
            <p>{message}</p>
          </div>
        )}
      </div>
    </main>
  );
}
