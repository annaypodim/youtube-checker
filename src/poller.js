import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { getSupabaseAdmin } from './supabase.js';

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60 * 1000);
const NEWSLETTER_POLL_INTERVAL_MS = 5 * 60 * 1000;
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
    .not('channel_id', 'is', null)
    .eq('status', 'verified');
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
    .select('last_video_id, log')
    .eq('channel_id', channelId)
    .maybeSingle();
  if (error) throw new Error(`channel_state read failed: ${error.message}`);
  return {
    lastVideoId: data?.last_video_id ?? null,
    log: data?.log ?? []
  };
}

async function saveChannelState(supabase, channelId, lastVideoId, log) {
  const { error } = await supabase.from('channel_state').upsert({
    channel_id: channelId,
    last_video_id: lastVideoId,
    last_checked_at: new Date().toISOString(),
    ...(log !== undefined ? { log } : {})
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
  execFile('python3', args, (err, stdout, stderr) => {
    if (err) {
      console.error('Transcript script failed:', stderr || err.message);
      return;
    }
    if (stdout) console.log('Transcript script:', stdout.trim());
  });
}

function dispatchNewsletterEmails(videoIds, recipients, newsletterName) {
  if (recipients.length === 0 || videoIds.length === 0) return;
  const scriptPath = path.resolve(__dirname, '..', 'getTranscript.py');
  const args = [
    scriptPath,
    '--newsletter',
    '--video-ids', videoIds.join(','),
    '--newsletter-name', newsletterName,
    '--to', recipients.join(','),
  ];
  execFile('python3', args, (err, stdout, stderr) => {
    if (err) {
      console.error('Newsletter script failed:', stderr || err.message);
      return;
    }
    if (stdout) console.log('Newsletter script:', stdout.trim());
  });
}

async function loadNewsletterChannels(supabase) {
  const { data, error } = await supabase
    .from('newsletters')
    .select('id, name, channels, subscribers');
  if (error) throw new Error(`Loading newsletters failed: ${error.message}`);

  const map = new Map(); // channel_id -> Set of newsletter names
  for (const row of data ?? []) {
    if (!row.subscribers || row.subscribers.length === 0) continue;
    if (!row.channels) continue;

    for (const [channelName, channelId] of Object.entries(row.channels)) {
      if (!map.has(channelId)) map.set(channelId, new Set());
      map.get(channelId).add(row.name);
    }
  }
  return map;
}

async function pollChannel(supabase, channelId, individualRecipients, isNewsletterChannel) {
  const latest = await fetchLatestVideo(channelId);
  if (!latest?.id) {
    console.log(`[${channelId}] no videos found`);
    return;
  }

  const state = await getChannelState(supabase, channelId);
  const previousId = state.lastVideoId;
  let log = state.log || [];

  if (previousId === null) {
    // First time we see this channel — record the latest as the baseline
    await saveChannelState(supabase, channelId, latest.id, log);
    console.log(`[${channelId}] baseline set to ${latest.id} (${latest.title}) — no email sent`);
    return;
  }

  if (previousId !== latest.id) {
    console.log(`[${channelId}] new upload ${latest.id} (${latest.title})`);

    // Add to newsletter log if needed
    if (isNewsletterChannel) {
      if (!log.includes(latest.id)) {
        log.push(latest.id);
      }
    }

    await saveChannelState(supabase, channelId, latest.id, log);

    if (individualRecipients && individualRecipients.length > 0) {
      dispatchEmails(latest, individualRecipients);
    }
  } else {
    // Update last_checked_at without changing log
    await saveChannelState(supabase, channelId, previousId, log);
    console.log(`[${channelId}] no new uploads`);
  }
}

async function pollOnce() {
  const supabase = getSupabaseAdmin();
  const individualChannels = await loadActiveChannels(supabase);
  const newsletterChannels = await loadNewsletterChannels(supabase);

  const allChannelIds = new Set([...individualChannels.keys(), ...newsletterChannels.keys()]);

  if (allChannelIds.size === 0) {
    console.log('No active subscriptions or newsletters yet.');
    return;
  }

  for (const channelId of allChannelIds) {
    try {
      const individualRecipients = individualChannels.get(channelId) || [];
      const isNewsletterChannel = newsletterChannels.has(channelId);
      await pollChannel(supabase, channelId, individualRecipients, isNewsletterChannel);
    } catch (error) {
      console.error(`[${channelId}] poll failed:`, error.message);
    }
  }
}

async function pollNewslettersOnce() {
  const supabase = getSupabaseAdmin();
  console.log('Running newsletter interval check...');

  const { data: newsletters, error } = await supabase
    .from('newsletters')
    .select('id, name, channels, subscribers');

  if (error) {
    console.error('Failed to load newsletters for interval:', error.message);
    return;
  }

  for (const row of newsletters ?? []) {
    if (!row.subscribers || row.subscribers.length === 0) continue;
    if (!row.channels) continue;

    let videoIdsForNewsletter = [];
    let channelsToClear = [];

    // Collect logs for all channels in this newsletter
    for (const channelId of Object.values(row.channels)) {
      const state = await getChannelState(supabase, channelId);
      if (state.log && state.log.length > 0) {
        videoIdsForNewsletter.push(...state.log);
        channelsToClear.push(channelId);
      }
    }

    if (videoIdsForNewsletter.length > 0) {
      // Deduplicate video IDs just in case
      videoIdsForNewsletter = [...new Set(videoIdsForNewsletter)];
      console.log(`[Newsletter: ${row.name}] Dispatching digest with ${videoIdsForNewsletter.length} videos`);
      dispatchNewsletterEmails(videoIdsForNewsletter, row.subscribers, row.name);
    }

    // We clear logs at the channel level. 
    // Note: If a channel is in MULTIPLE newsletters, clearing its log here might mean 
    // it misses the next newsletter if they fire at different times. 
    // But since the newsletter interval is global (10 mins), they all fire now, 
    // so we can just clear the logs for all processed channels.
    for (const channelId of channelsToClear) {
      const state = await getChannelState(supabase, channelId);
      if (state.log && state.log.length > 0) {
        // Clear the log
        await saveChannelState(supabase, channelId, state.lastVideoId, []);
      }
    }
  }
}

async function main() {
  console.log(`Starting poller. Interval: ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`Newsletter Interval: ${NEWSLETTER_POLL_INTERVAL_MS / 1000}s`);
  await pollOnce();
  if (RUN_ONCE) return;

  setInterval(() => {
    pollOnce().catch((error) => console.error('Polling failed', error));
  }, POLL_INTERVAL_MS);

  setInterval(() => {
    pollNewslettersOnce().catch((error) => console.error('Newsletter polling failed', error));
  }, NEWSLETTER_POLL_INTERVAL_MS);
}

main().catch((error) => {
  console.error('Fatal error', error);
  process.exit(1);
});
