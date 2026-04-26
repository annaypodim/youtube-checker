import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { getSupabaseAdmin } from './supabase.js';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60 * 1000);
const YT_API_KEY = process.env.YT_API_KEY;
const RUN_ONCE = process.argv.includes('--once');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!YT_API_KEY) throw new Error('YT_API_KEY environment variable is required.');

function uploadsPlaylistId(channelId) {
  if (channelId.startsWith('UC')) return 'UU' + channelId.slice(2);
  return null;
}

async function resolveUploadsPlaylistId(channelId) {
  const cached = uploadsPlaylistId(channelId);
  if (cached) return cached;

  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('id', channelId);
  url.searchParams.set('key', YT_API_KEY);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube channels.list failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const playlistId = data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!playlistId) throw new Error(`Unable to resolve uploads playlist for channel ${channelId}.`);
  return playlistId;
}

async function fetchLatestVideo(channelId) {
  const playlistId = await resolveUploadsPlaylistId(channelId);
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('key', YT_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`playlistItems.list ${response.status}: ${body}`);
  }

  const data = await response.json();
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  const normalized = items
    .map(normalizeItem)
    .sort((a, b) => getPublishedTimestamp(b.publishedAt) - getPublishedTimestamp(a.publishedAt));

  return normalized[0] ?? null;
}

function normalizeItem(item) {
  const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
  return {
    id: videoId,
    title: item.snippet?.title,
    publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt,
    link: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
    author: item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle,
  };
}

function getPublishedTimestamp(dateString) {
  const t = dateString ? Date.parse(dateString) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

async function loadActiveChannels(supabase) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('channel_id, email')
    .not('channel_id', 'is', null);
  if (error) throw new Error(`Loading subscriptions failed: ${error.message}`);

  const map = new Map();
  for (const row of data ?? []) {
    if (!row.channel_id) continue;
    if (!map.has(row.channel_id)) map.set(row.channel_id, []);
    map.get(row.channel_id).push(row.email);
  }
  return map;
}

async function getChannelState(supabase, channelId) {
  const { data, error } = await supabase
    .from('channel_state')
    .select('last_video_id')
    .eq('channel_id', channelId)
    .maybeSingle();
  if (error) throw new Error(`channel_state read failed: ${error.message}`);
  return data?.last_video_id ?? null;
}

async function saveChannelState(supabase, channelId, lastVideoId) {
  const { error } = await supabase.from('channel_state').upsert({
    channel_id: channelId,
    last_video_id: lastVideoId,
    last_checked_at: new Date().toISOString(),
  });
  if (error) throw new Error(`channel_state write failed: ${error.message}`);
}

function dispatchEmails(video, recipients) {
  if (recipients.length === 0) return;
  const scriptPath = path.resolve(__dirname, '..', 'getTranscript.py');
  const args = [
    scriptPath,
    video.id,
    '--title', video.title ?? '',
    '--channel', video.author ?? '',
    '--published', video.publishedAt ?? '',
    '--to', recipients.join(','),
  ];
  execFile('python', args, (err, stdout, stderr) => {
    if (err) {
      console.error('Transcript script failed:', stderr || err.message);
      return;
    }
    if (stdout) console.log('Transcript script:', stdout.trim());
  });
}

async function pollChannel(supabase, channelId, recipients) {
  const latest = await fetchLatestVideo(channelId);
  if (!latest?.id) {
    console.log(`[${channelId}] no videos found`);
    return;
  }

  const previous = await getChannelState(supabase, channelId);
  await saveChannelState(supabase, channelId, latest.id);

  if (previous === null) {
    // First time we see this channel — record the latest as the baseline; do not email backfill.
    console.log(`[${channelId}] baseline set to ${latest.id} (${latest.title}) — no email sent`);
    return;
  }

  if (previous !== latest.id) {
    console.log(`[${channelId}] new upload ${latest.id} (${latest.title}) -> ${recipients.length} subscriber(s)`);
    dispatchEmails(latest, recipients);
  } else {
    console.log(`[${channelId}] no new uploads`);
  }
}

async function pollOnce() {
  const supabase = getSupabaseAdmin();
  const channels = await loadActiveChannels(supabase);
  if (channels.size === 0) {
    console.log('No active subscriptions yet.');
    return;
  }

  for (const [channelId, recipients] of channels) {
    try {
      await pollChannel(supabase, channelId, recipients);
    } catch (error) {
      console.error(`[${channelId}] poll failed:`, error.message);
    }
  }
}

async function main() {
  console.log(`Starting poller. Interval: ${POLL_INTERVAL_MS / 1000}s`);
  await pollOnce();
  if (RUN_ONCE) return;

  setInterval(() => {
    pollOnce().catch((error) => console.error('Polling failed', error));
  }, POLL_INTERVAL_MS);
}

main().catch((error) => {
  console.error('Fatal error', error);
  process.exit(1);
});
