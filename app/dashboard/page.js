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

  // Newsletter state
  const [viewMode, setViewMode] = useState('individual'); // 'individual' | 'newsletters'
  const [newsletters, setNewsletters] = useState([]);
  const [loadingNewsletters, setLoadingNewsletters] = useState(false);
  const [expandedNewsletterId, setExpandedNewsletterId] = useState(null);
  const [newsletterStatus, setNewsletterStatus] = useState({ id: null, loading: false });

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

  const fetchNewsletters = useCallback(async () => {
    setLoadingNewsletters(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.from('newsletters').select('*').order('name');
      if (error) throw error;
      setNewsletters(data ?? []);
    } catch (err) {
      console.error('Failed to load newsletters', err);
    } finally {
      setLoadingNewsletters(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'newsletters' && newsletters.length === 0) {
      fetchNewsletters();
    }
  }, [viewMode, newsletters.length, fetchNewsletters]);

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

  async function handleNewsletterAction(newsletterId, isSubscribed) {
    setNewsletterStatus({ id: newsletterId, loading: true });
    try {
      const endpoint = isSubscribed ? '/api/newsletter/unsubscribe' : '/api/newsletter/subscribe';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, newsletterId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      
      // Update local state to reflect the change
      setNewsletters(prev => prev.map(nl => {
        if (nl.id !== newsletterId) return nl;
        const subs = nl.subscribers || [];
        return {
          ...nl,
          subscribers: isSubscribed ? subs.filter(e => e !== userEmail) : [...subs, userEmail]
        };
      }));
      
      setServerMessage(data.message);
      setStatus('success');
      setTimeout(() => setServerMessage(''), 4000);
    } catch (err) {
      setServerMessage(err.message);
      setStatus('error');
      setTimeout(() => setServerMessage(''), 4000);
    } finally {
      setNewsletterStatus({ id: null, loading: false });
    }
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

      {/* ── Subscribe form / Newsletters + info ──────────────────────── */}
      <section className="content-grid">
        <div className="form-card">
          <div className="form-heading" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(63,77,52,0.07)', borderRadius: '999px', padding: '4px', marginBottom: '20px' }}>
              <button
                type="button"
                onClick={() => setViewMode('individual')}
                style={{
                  flex: 1, marginTop: 0, borderRadius: '999px', padding: '10px', fontSize: '0.92rem', fontWeight: '600',
                  background: viewMode === 'individual' ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'transparent',
                  color: viewMode === 'individual' ? '#fff' : 'var(--muted)',
                  boxShadow: viewMode === 'individual' ? '0 4px 12px rgba(140,53,29,0.2)' : 'none',
                  transition: 'all 200ms ease',
                }}
              >
                Individual Channels
              </button>
              <button
                type="button"
                onClick={() => setViewMode('newsletters')}
                style={{
                  flex: 1, marginTop: 0, borderRadius: '999px', padding: '10px', fontSize: '0.92rem', fontWeight: '600',
                  background: viewMode === 'newsletters' ? 'linear-gradient(135deg, var(--accent), var(--accent-dark))' : 'transparent',
                  color: viewMode === 'newsletters' ? '#fff' : 'var(--muted)',
                  boxShadow: viewMode === 'newsletters' ? '0 4px 12px rgba(140,53,29,0.2)' : 'none',
                  transition: 'all 200ms ease',
                }}
              >
                Newsletters
              </button>
            </div>
          </div>

          {viewMode === 'individual' ? (
            <>
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

              {(serverMessage || status === 'success') && viewMode === 'individual' && (
                <div className={`status-panel ${status}`} aria-live="polite">
                  {status === 'success' ? <strong>Subscription active</strong> : null}
                  {serverMessage ? <p>{serverMessage}</p> : null}
                </div>
              )}
            </>
          ) : (
            <div>
              <h2 style={{ fontSize: '1.4rem', marginBottom: '16px' }}>Curated Newsletters</h2>
              <p style={{ fontFamily: 'Arial, sans-serif', color: 'var(--muted)', marginBottom: '24px' }}>
                Discover themed collections of YouTube channels. Receive a single, curated digest summarizing all the latest videos.
              </p>

              {serverMessage && viewMode === 'newsletters' && (
                <div className={`status-panel ${status}`} aria-live="polite" style={{ marginBottom: '20px' }}>
                  <p>{serverMessage}</p>
                </div>
              )}

              {loadingNewsletters ? (
                <p style={{ fontFamily: 'Arial, sans-serif', color: 'var(--muted)' }}>Loading newsletters...</p>
              ) : newsletters.length === 0 ? (
                <p style={{ fontFamily: 'Arial, sans-serif', color: 'var(--muted)' }}>No newsletters available at this time.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {newsletters.map((nl) => {
                    const isSubscribed = (nl.subscribers || []).includes(userEmail);
                    const isExpanded = expandedNewsletterId === nl.id;
                    const channelsList = Object.entries(nl.channels || {});
                    const isLoading = newsletterStatus.id === nl.id && newsletterStatus.loading;
                    
                    return (
                      <div key={nl.id} style={{ ...styles.subCard, padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                          <div>
                            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem' }}>{nl.name}</h3>
                            <p style={{ margin: 0, fontFamily: 'Arial, sans-serif', fontSize: '0.9rem', color: 'var(--muted)', lineHeight: '1.4' }}>
                              {nl.description}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleNewsletterAction(nl.id, isSubscribed)}
                            disabled={isLoading}
                            style={{
                              marginTop: 0,
                              padding: '8px 16px',
                              fontSize: '0.84rem',
                              whiteSpace: 'nowrap',
                              background: isSubscribed ? 'transparent' : 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                              color: isSubscribed ? 'var(--accent-dark)' : '#fff',
                              border: isSubscribed ? '1px solid rgba(140,53,29,0.4)' : '1px solid transparent',
                              opacity: isLoading ? 0.7 : 1,
                            }}
                          >
                            {isLoading ? '...' : isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                          </button>
                        </div>
                        
                        {channelsList.length > 0 && (
                          <div style={{ marginTop: '16px' }}>
                            <button
                              type="button"
                              onClick={() => setExpandedNewsletterId(isExpanded ? null : nl.id)}
                              style={{
                                background: 'none', border: 'none', padding: 0, margin: 0, color: 'var(--muted)',
                                fontFamily: 'Arial, sans-serif', fontSize: '0.85rem', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                              </svg>
                              {channelsList.length} channels
                            </button>
                            
                            {isExpanded && (
                              <ul style={{ margin: '8px 0 0 0', padding: '0 0 0 20px', fontFamily: 'Arial, sans-serif', fontSize: '0.85rem', color: 'var(--muted)' }}>
                                {channelsList.map(([cname, cid]) => (
                                  <li key={cid} style={{ marginBottom: '4px' }}>
                                    <a href={`https://www.youtube.com/@${cname}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                                      {cname}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              
              {!loadingNewsletters && newsletters.length > 0 && (
                <p style={{ textAlign: 'center', fontFamily: 'Arial, sans-serif', fontSize: '0.85rem', color: 'var(--muted)', marginTop: '24px' }}>
                  More coming soon!
                </p>
              )}
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
