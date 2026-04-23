const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
]);

export function validateSubscription(input) {
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  const channelUrl = typeof input?.channelUrl === 'string' ? input.channelUrl.trim() : '';
  const errors = {};

  if (!email) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (!channelUrl) {
    errors.channelUrl = 'A YouTube channel URL is required.';
  } else {
    const parsed = parseYouTubeUrl(channelUrl);
    if (!parsed.valid) {
      errors.channelUrl = parsed.message;
    }
  }

  return {
    errors,
    normalized: {
      email: email.toLowerCase(),
      channelUrl,
    },
  };
}

function parseYouTubeUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return { valid: false, message: 'Enter a full YouTube URL.' };
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    return { valid: false, message: 'URL must point to YouTube.' };
  }

  if (url.hostname === 'youtu.be') {
    return { valid: false, message: 'Use a channel URL, not a single video link.' };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const isChannelPath =
    segments[0]?.startsWith('@') ||
    segments[0] === 'channel' ||
    segments[0] === 'c' ||
    segments[0] === 'user';

  if (!isChannelPath || segments.length < 1) {
    return { valid: false, message: 'Use a valid YouTube channel URL.' };
  }

  return { valid: true };
}
