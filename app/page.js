'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseBrowser } from '../src/supabase-browser.js';

const features = [
  {
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="3" />
        <path d="M16 2v4M8 2v4M2 10h20" />
        <circle cx="12" cy="16" r="1" fill="currentColor" />
        <path d="M8 16h-.01M16 16h-.01" />
      </svg>
    ),
    label: 'Automatic delivery',
    title: 'Summaries land in your inbox',
    body:
      'The moment a channel you follow posts, we fetch the transcript, summarize it with AI, and deliver a crisp digest to your email — no app to check, no feed to scroll.',
  },
  {
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
        <line x1="19" y1="12" x2="23" y2="12" />
        <line x1="2" y1="6" x2="2" y2="18" />
      </svg>
    ),
    label: 'Instant clips',
    title: 'Jump to the best moments',
    body:
      'Every digest includes timestamped clips of the most interesting segments. One click opens the exact moment in the video — no scrubbing required.',
  },
  {
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    label: 'Daily newsletters',
    title: 'Curated reading, every morning',
    body:
      'Sign up for a hand-curated daily newsletter that surfaces the best content from the channels you care about — condensed, linked, and ready to read over coffee.',
  },
];

export default function LandingPage() {
  const router = useRouter();

  // Redirect already-authenticated users to their dashboard.
  useEffect(() => {
    async function check() {
      try {
        const supabase = getSupabaseBrowser();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) router.replace('/dashboard');
      } catch { /* ignore — not being authenticated is fine here */ }
    }
    check();
  }, [router]);

  return (
    <>
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav style={styles.nav}>
        <span style={styles.wordmark}>Channel Digest</span>
        <div style={styles.navLinks}>
          <Link href="/login" style={styles.navLinkGhost}>Sign in</Link>
          <Link href="/login" style={styles.navLinkPrimary}>Get started</Link>
        </div>
      </nav>

      <main style={styles.main}>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="hero-card" style={styles.hero}>
          <p className="eyebrow">YouTube, distilled</p>
          <h1 style={styles.heroHeading}>
            Stop watching.<br />
            Start reading.
          </h1>
          <p className="hero-copy" style={{ maxWidth: '52rem', marginTop: '20px' }}>
            Channel Digest monitors the YouTube channels you care about and delivers
            AI-generated summaries — with clips — straight to your inbox. Never miss a video.
            Never waste time on one either.
          </p>
          <div style={styles.heroCtas}>
            <Link href="/login" style={styles.ctaPrimary}>Get started free</Link>
            <Link href="/login" style={styles.ctaGhost}>Sign in</Link>
          </div>
        </section>

        {/* ── Features ──────────────────────────────────────────────── */}
        <section style={styles.featuresGrid} aria-label="Features">
          {features.map((f) => (
            <div key={f.label} className="form-card" style={styles.featureCard}>
              <div style={styles.featureIcon}>{f.icon}</div>
              <p style={styles.featureLabel}>{f.label}</p>
              <h2 style={styles.featureTitle}>{f.title}</h2>
              <p style={styles.featureBody}>{f.body}</p>
            </div>
          ))}
        </section>

        {/* ── CTA banner ────────────────────────────────────────────── */}
        <section className="hero-card" style={styles.ctaBanner}>
          <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.4rem)', margin: 0 }}>
            Ready to reclaim your attention?
          </h2>
          <p className="hero-copy" style={{ marginTop: '12px' }}>
            Free to start. No credit card required.
          </p>
          <Link href="/login" style={{ ...styles.ctaPrimary, marginTop: '24px', display: 'inline-block' }}>
            Create your account
          </Link>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer style={styles.footer}>
        <span style={{ opacity: 0.55 }}>© {new Date().getFullYear()} Channel Digest</span>
      </footer>
    </>
  );
}

const styles = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 40px',
    maxWidth: '1280px',
    margin: '0 auto',
  },
  wordmark: {
    fontFamily: 'Georgia, serif',
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'var(--text)',
    letterSpacing: '-0.01em',
  },
  navLinks: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
  },
  navLinkGhost: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.92rem',
    fontWeight: '600',
    color: 'var(--muted)',
    textDecoration: 'none',
    padding: '9px 18px',
    borderRadius: '999px',
    border: '1px solid transparent',
    transition: 'border-color 160ms ease, color 160ms ease',
  },
  navLinkPrimary: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.92rem',
    fontWeight: '700',
    color: '#fff',
    textDecoration: 'none',
    padding: '9px 20px',
    borderRadius: '999px',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
    boxShadow: '0 4px 14px rgba(140,53,29,0.22)',
    transition: 'transform 160ms ease, box-shadow 160ms ease',
  },
  main: {
    display: 'grid',
    gap: '1.5rem',
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '0 32px 60px',
  },
  hero: {
    padding: '56px 52px',
  },
  heroHeading: {
    fontSize: 'clamp(2.8rem, 6vw, 5rem)',
    lineHeight: '1',
    marginTop: '8px',
    letterSpacing: '-0.02em',
  },
  heroCtas: {
    display: 'flex',
    gap: '12px',
    marginTop: '32px',
    flexWrap: 'wrap',
  },
  ctaPrimary: {
    display: 'inline-block',
    fontFamily: 'Arial, sans-serif',
    fontWeight: '700',
    fontSize: '1rem',
    color: '#fff',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
    padding: '15px 32px',
    borderRadius: '999px',
    textDecoration: 'none',
    boxShadow: '0 8px 24px rgba(140,53,29,0.26)',
    transition: 'transform 160ms ease, box-shadow 160ms ease',
  },
  ctaGhost: {
    display: 'inline-block',
    fontFamily: 'Arial, sans-serif',
    fontWeight: '600',
    fontSize: '1rem',
    color: 'var(--accent-dark)',
    border: '1px solid rgba(140,53,29,0.38)',
    padding: '15px 28px',
    borderRadius: '999px',
    textDecoration: 'none',
    transition: 'background 160ms ease',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1.5rem',
  },
  featureCard: {
    padding: '36px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  featureIcon: {
    color: 'var(--accent)',
    marginBottom: '8px',
    lineHeight: 0,
  },
  featureLabel: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.76rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--muted)',
    margin: 0,
  },
  featureTitle: {
    fontSize: 'clamp(1.3rem, 2.2vw, 1.75rem)',
    lineHeight: '1.1',
    margin: '4px 0 4px',
  },
  featureBody: {
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.96rem',
    lineHeight: '1.65',
    color: 'var(--muted)',
    margin: 0,
  },
  ctaBanner: {
    padding: '48px 52px',
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    padding: '24px',
    fontFamily: 'Arial, sans-serif',
    fontSize: '0.82rem',
    color: 'var(--muted)',
  },
};
