const API_BASE = 'https://www.googleapis.com/youtube/v3';

export function parseChannelUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const [first, second] = segments;
  if (first === 'channel' && second) return { type: 'id', value: second };
  if (first.startsWith('@')) return { type: 'handle', value: first.slice(1) };
  if (first === 'user' && second) return { type: 'username', value: second };
  if (first === 'c' && second) return { type: 'custom', value: second };
  return null;
}

export async function resolveChannelId(rawUrl, apiKey) {
  if (!apiKey) throw new Error('YT_API_KEY is required to resolve channel URLs.');

  const parsed = parseChannelUrl(rawUrl);
  if (!parsed) throw new Error('Unrecognized YouTube channel URL.');
  if (parsed.type === 'id') return parsed.value;

  if (parsed.type === 'handle' || parsed.type === 'username') {
    const url = new URL(`${API_BASE}/channels`);
    url.searchParams.set('part', 'id');
    url.searchParams.set(parsed.type === 'handle' ? 'forHandle' : 'forUsername', parsed.value);
    url.searchParams.set('key', apiKey);
    const data = await fetchJson(url);
    const id = data?.items?.[0]?.id;
    if (id) return id;
  }

  // Fallback: search by name (covers /c/customname and any handle the channels endpoint missed).
  const searchUrl = new URL(`${API_BASE}/search`);
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'channel');
  searchUrl.searchParams.set('q', parsed.value);
  searchUrl.searchParams.set('maxResults', '1');
  searchUrl.searchParams.set('key', apiKey);
  const data = await fetchJson(searchUrl);
  const id = data?.items?.[0]?.snippet?.channelId ?? data?.items?.[0]?.id?.channelId;
  if (!id) throw new Error(`Could not resolve channel id for ${rawUrl}.`);
  return id;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube API ${response.status} ${response.statusText}: ${body}`);
  }
  return response.json();
}
