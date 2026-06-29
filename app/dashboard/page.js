'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '../../src/supabase-browser.js';

const initialForm = {
  channelUrl: '',
};

export default function DashboardPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [serverMessage, setServerMessage] = useState('');
  const [status, setStatus] = useState('idle');
  const [userEmail, setUserEmail] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Subscription manager state
  const [showManager, setShowManager] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [subsError, setSubsError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/');
          return;
        }
        setUserEmail(session.user.email ?? '');
      } catch {
        router.replace('/');
      } finally {
        setCheckingAuth(false);
      }
    }
    checkSession();
  }, [router]);

  // Fetch subscriptions via the anon client — RLS filters to current user automatically.
  const fetchSubscriptions = useCallback(async () => {
    setLoadingSubs(true);
    setSubsError('');
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from('subscriptions')
        .select('email, channel_url, channel_id, status, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data ?? []);
    } catch (err) {
      setSubsError(err.message ?? 'Could not load subscriptions.');
    } finally {
      setLoadingSubs(false);
    }
  }, []);

  function handleToggleManager() {
    if (!showManager) fetchSubscriptions();
    setShowManager((prev) => !prev);
  }

  async function handleDelete(channelUrl) {
    setDeletingId(channelUrl);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase
        .from('subscriptions')
        .delete()
        .eq('channel_url', channelUrl);

      if (error) throw error;
      setSubscriptions((prev) => prev.filter((s) => s.channel_url !== channelUrl));
    } catch (err) {
      setSubsError(err.message ?? 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSignOut() {
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
      router.replace('/');
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  }

  async function submitTo(endpoint) {
    setStatus('idle');
    setErrors({});
    setServerMessage('');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: userEmail, ...form }),
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
    // Refresh manager if open
    if (showManager) fetchSubscriptions();
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitTo('/api/subscribe');
  }

  function handleUnsubscribe() {
    submitTo('/api/unsubscribe');
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  if (checkingAuth) {
    return (
      <main className="page-shell" style={{ justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p style={{ fontFamily: 'Arial, sans-serif', color: 'var(--muted)', textAlign: 'center' }}>Loading…</p>
      </main>
    );
  }

  return (
    <main className="page-shell">
      {/* ── Hero / header ─────────────────────────────────────────────── */}
      <section className="hero-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1>Channel Digest</h1>
          <p className="hero-copy">
            Subscribe to a YouTube channel and receive AI-generated summaries with clips whenever a new video drops.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
          {userEmail && (
            <span style={{ fontFamily: 'Arial, sans-serif', fontSize: '0.88rem', color: 'var(--muted)' }}>
              {userEmail}
            </span>
          )}
          <button
            type="button"
            onClick={handleToggleManager}
            style={{
              marginTop: 0,
              background: showManager
                ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))'
                : 'transparent',
              color: showManager ? '#fff' : 'var(--accent-dark)',
              border: '1px solid rgba(140,53,29,0.4)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.88rem',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            Manage subscriptions
          </button>
          <button type="button" className="secondary" onClick={handleSignOut} style={{ marginTop: 0, whiteSpace: 'nowrap' }}>
            Sign out
          </button>
        </div>
      </section>

      {/* ── Subscription manager panel ─────────────────────────────────── */}
      {showManager && (
        <section className="form-card" aria-label="Your subscriptions">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <h2 style={{ fontSize: 'clamp(1.4rem, 2.5vw, 2rem)' }}>Your subscriptions</h2>
            <button
              type="button"
              className="secondary"
              onClick={fetchSubscriptions}
              disabled={loadingSubs}
              style={{ marginTop: 0, fontSize: '0.84rem', padding: '8px 16px', opacity: loadingSubs ? 0.6 : 1 }}
            >
              {loadingSubs ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {subsError && (
            <div className="status-panel error" style={{ marginBottom: '16px' }}>
              <p>{subsError}</p>
            </div>
          )}

          {loadingSubs && subscriptions.length === 0 ? (
            <p style={{ fontFamily: 'Arial, sans-serif', color: 'var(--muted)', fontSize: '0.92rem' }}>Loading…</p>
          ) : subscriptions.length === 0 ? (
            <p style={{ fontFamily: 'Arial, sans-serif', color: 'var(--muted)', fontSize: '0.92rem' }}>
              No subscriptions yet. Add one using the form below.
            </p>
          ) : (
            <div style={styles.subsGrid}>
              {subscriptions.map((sub) => (
                <div key={sub.channel_url} style={styles.subCard}>
                  {/* Status badge */}
                  <span style={{
                    ...styles.badge,
                    background: sub.status === 'verified' ? 'rgba(79,127,70,0.12)' : 'rgba(184,76,42,0.12)',
                    color: sub.status === 'verified' ? 'var(--success-text, #2e5a28)' : 'var(--error-text, #8c351d)',
                  }}>
                    {sub.status === 'verified' ? '● Active' : '○ Pending'}
                  </span>

                  {/* Channel URL */}
                  <a
                    href={sub.channel_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.channelLink}
                    title={sub.channel_url}
                  >
                    {sub.channel_url.replace(/^https?:\/\/(www\.)?youtube\.com\//, '')}
                  </a>

                  {/* Date */}
                  <span style={styles.subDate}>
                    Added {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(sub.channel_url)}
                    disabled={deletingId === sub.channel_url}
                    style={styles.deleteBtn}
                    aria-label={`Remove subscription to ${sub.channel_url}`}
                  >
                    {deletingId === sub.channel_url ? (
                      '…'
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Subscribe form + info ──────────────────────────────────────── */}
      <section className="content-grid">
        <div className="form-card">
          <div className="form-heading">
            <h2>Subscribe to a channel</h2>
            <p>Paste a YouTube channel URL below. Summaries will be sent to:</p>
            <div style={styles.emailPill}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--accent)' }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {userEmail}
            </div>
          </div>

          <form className="subscribe-form" onSubmit={handleSubmit} noValidate>
            <label htmlFor="db-channelUrl">YouTube channel link</label>
            <input
              id="db-channelUrl"
              type="url"
              inputMode="url"
              placeholder="https://www.youtube.com/@channelname"
              value={form.channelUrl}
              onChange={(event) => updateField('channelUrl', event.target.value)}
              aria-invalid={Boolean(errors.channelUrl)}
              aria-describedby={errors.channelUrl ? 'db-channel-error' : undefined}
            />
            {errors.channelUrl ? (
              <p className="field-error" id="db-channel-error">
                {errors.channelUrl}
              </p>
            ) : null}

            <div className="form-actions">
              <button type="submit">Start tracking</button>
              <button type="button" className="secondary" onClick={handleUnsubscribe}>
                Unsubscribe
              </button>
            </div>
          </form>

          {(serverMessage || status === 'success') && (
            <div className={`status-panel ${status}`} aria-live="polite">
              {status === 'success' ? <strong>Subscription active</strong> : null}
              {serverMessage ? <p>{serverMessage}</p> : null}
            </div>
          )}
        </div>

        <div className="info-card" aria-label="What you'll receive">
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
              <span>Highlight clips</span>
              <strong>Jump to the best moments</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const styles = {
  emailPill: {
    marginTop: '10px',
    padding: '10px 14px',
    background: 'rgba(63,77,52,0.06)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.92rem',
    fontWeight: '600',
    color: 'var(--text)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  subsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '12px',
  },
  subCard: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '16px',
    background: 'rgba(255,250,242,0.7)',
    border: '1px solid rgba(63,77,52,0.1)',
    borderRadius: '16px',
  },
  badge: {
    alignSelf: 'flex-start',
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.72rem',
    fontWeight: '700',
    letterSpacing: '0.04em',
    padding: '3px 10px',
    borderRadius: '999px',
  },
  channelLink: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.9rem',
    fontWeight: '600',
    color: 'var(--text)',
    textDecoration: 'none',
    wordBreak: 'break-all',
    lineHeight: '1.4',
    marginTop: '2px',
  },
  subDate: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.78rem',
    color: 'var(--muted)',
    marginTop: 'auto',
    paddingTop: '8px',
  },
  deleteBtn: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    marginTop: 0,
    padding: '6px',
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    background: 'transparent',
    color: 'var(--muted)',
    border: '1px solid rgba(63,77,52,0.15)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 160ms ease, color 160ms ease, border-color 160ms ease',
  },
};
