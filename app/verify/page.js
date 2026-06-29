import { getSupabaseAdmin } from '../../src/supabase.js';

export const metadata = {
  title: 'Verify Subscription — Channel Digest',
};

export default async function VerifyPage({ searchParams }) {
  const { token } = await searchParams;

  if (!token) {
    return <VerifyResult success={false} message="No verification token was provided." />;
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return <VerifyResult success={false} message="Server configuration error. Please try again later." />;
  }

  // Atomically update status to 'verified' only if the token matches and is still pending.
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'verified' })
    .eq('verification_token', token)
    .eq('status', 'pending')
    .select('email, channel_url')
    .maybeSingle();

  if (error) {
    console.error('Verify token update failed:', error);
    return <VerifyResult success={false} message="Something went wrong. Please try again." />;
  }

  if (!data) {
    return (
      <VerifyResult
        success={false}
        message="This verification link is invalid or has already been used."
      />
    );
  }

  return <VerifyResult success={true} email={data.email} channelUrl={data.channel_url} />;
}

function VerifyResult({ success, message, email, channelUrl }) {
  return (
    <main style={styles.shell}>
      <div style={styles.card}>
        <div style={{ ...styles.iconWrap, background: success ? '#dcfce7' : '#fee2e2' }}>
          {success ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>

        <h1 style={styles.heading}>
          {success ? 'Subscription verified!' : 'Verification failed'}
        </h1>

        {success ? (
          <>
            <p style={styles.body}>
              <strong>{email}</strong> is now subscribed to{' '}
              <a href={channelUrl} style={styles.link} target="_blank" rel="noopener noreferrer">
                {channelUrl}
              </a>
              .
            </p>
            <p style={styles.body}>
              You&apos;ll receive an email summary the next time the channel posts a video.
            </p>
          </>
        ) : (
          <p style={styles.body}>{message}</p>
        )}

        <a href="/" style={styles.button}>
          {success ? 'Back to home' : 'Try subscribing again'}
        </a>
      </div>
    </main>
  );
}

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg, #f6f8f6)',
    padding: '24px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '48px 40px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
  },
  iconWrap: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    marginBottom: '24px',
  },
  heading: {
    fontSize: '24px',
    fontWeight: '700',
    margin: '0 0 16px 0',
    color: '#1f2a1f',
  },
  body: {
    fontSize: '15px',
    color: '#4b5563',
    lineHeight: '1.6',
    margin: '0 0 12px 0',
  },
  link: {
    color: '#2563eb',
    wordBreak: 'break-all',
  },
  button: {
    display: 'inline-block',
    marginTop: '24px',
    padding: '12px 28px',
    background: '#2563eb',
    color: '#fff',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: '600',
    fontSize: '15px',
  },
};
