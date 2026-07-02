'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '../../src/supabase-browser.js';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' | 'error'
  const [loading, setLoading] = useState(false);

  // Redirect already-authenticated users straight to the dashboard.
  useEffect(() => {
    async function check() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) router.replace('/dashboard');
      } catch { /* ignore */ }
    }
    check();
  }, [router]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType('');

    try {
      const supabase = getSupabaseBrowser();

      if (tab === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessageType('success');
        setMessage('Account created! Check your email to confirm your address, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!email) {
      setMessageType('error');
      setMessage('Enter your email address above, then click "Forgot password?"');
      return;
    }
    setLoading(true);
    setMessage('');
    setMessageType('');
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setMessageType('success');
      setMessage('Password reset email sent! Check your inbox.');
    } catch (err) {
      setMessageType('error');
      setMessage(err.message ?? 'Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Back link */}
      <div style={{ marginBottom: '12px' }}>
        <Link href="/" style={{ fontFamily: 'Arial, sans-serif', fontSize: '0.88rem', color: 'var(--muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Channel Digest
        </Link>
      </div>

      <div className="form-card" style={{ maxWidth: '460px', width: '100%', margin: '0 auto' }}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '28px', background: 'rgba(63,77,52,0.07)', borderRadius: '999px', padding: '4px' }}>
          {['signin', 'signup'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setMessage(''); }}
              style={{
                flex: 1,
                marginTop: 0,
                borderRadius: '999px',
                padding: '10px',
                fontSize: '0.92rem',
                fontWeight: '600',
                background: tab === t ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'transparent',
                color: tab === t ? '#fff' : 'var(--muted)',
                boxShadow: tab === t ? '0 4px 12px rgba(140,53,29,0.2)' : 'none',
                transition: 'all 200ms ease',
              }}
            >
              {t === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <div className="form-heading">
          <h2>{tab === 'signin' ? 'Welcome back' : 'Get started'}</h2>
          <p>{tab === 'signin' ? 'Sign in to manage your subscriptions.' : 'Create your free Channel Digest account.'}</p>
        </div>

        <form className="subscribe-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete={tab === 'signup' ? 'email' : 'username'}
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            placeholder={tab === 'signup' ? 'Choose a password (min. 6 characters)' : 'Your password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
          />

          {tab === 'signin' && (
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                marginTop: '6px',
                fontFamily: 'Arial, sans-serif',
                fontSize: '0.84rem',
                color: 'var(--accent-dark)',
                cursor: 'pointer',
                textDecoration: 'underline',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Forgot password?
            </button>
          )}

          <div className="form-actions">
            <button type="submit" disabled={loading} style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'wait' : 'pointer' }}>
              {loading ? 'Please wait…' : tab === 'signin' ? 'Sign in' : 'Create account'}
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
