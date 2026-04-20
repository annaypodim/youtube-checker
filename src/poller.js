import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';

const DEFAULT_CHANNEL_ID = 'UC_x5XG1OV2P6uZZ5FSM9Ttw' // Roel Van de Paar
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60 * 1000);
const CHANNEL_ID = process.env.YT_CHANNEL_ID ?? DEFAULT_CHANNEL_ID;
const YT_API_KEY = process.env.YT_API_KEY;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(
  process.env.STATE_FILE ?? path.join(__dirname, '..', 'state', 'latest-video.json')
);
const RUN_ONCE = process.argv.includes('--once');

if (!YT_API_KEY) {
  throw new Error('YT_API_KEY environment variable is required.');
}

// For standard channel IDs (UC...), the uploads playlist id is the same with UC -> UU.
function uploadsPlaylistId(channelId) {
  if (channelId.startsWith('UC')) {
    return 'UU' + channelId.slice(2);
  }
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
  if (!playlistId) {
    throw new Error(`Unable to resolve uploads playlist for channel ${channelId}.`);
  }
  return playlistId;
}

async function fetchLatestVideo() {
  const playlistId = await resolveUploadsPlaylistId(CHANNEL_ID);
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('key', YT_API_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube playlistItems.list failed: ${response.status} ${response.statusText} - ${body}`);
  }

  const data = await response.json();
  const items = data?.items;
  if (!items || items.length === 0) {
    throw new Error('YouTube API returned no playlist items.');
  }

  const normalized = items
    .map(normalizeItem)
    // Sort by published date so metadata edits to older videos do not appear as new uploads.
    .sort((a, b) => getPublishedTimestamp(b.publishedAt) - getPublishedTimestamp(a.publishedAt));

  const latest = normalized[0];
  if (!latest) {
    throw new Error('Unable to find the latest video.');
  }
  return latest;
}

function normalizeItem(item) {
  const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
  return {
    id: videoId,
    title: item.snippet?.title,
    publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt,
    link: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
    author: item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle,
    raw: item,
  };
}

function getPublishedTimestamp(dateString) {
  const timestamp = dateString ? Date.parse(dateString) : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

async function readState() {
  try {
    const contents = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(contents);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function pollOnce() {
  const latestVideo = await fetchLatestVideo();
  const previousState = await readState();
  const nextState = {
    channelId: CHANNEL_ID,
    lastVideoId: latestVideo.id,
    lastVideo: latestVideo,
    lastCheckedAt: new Date().toISOString(),
  };

  const isNewVideo = previousState?.lastVideoId !== latestVideo.id;
  await writeState(nextState);

  if (isNewVideo) {
    logLatestVideo('New upload detected', latestVideo);
    const scriptPath = path.resolve(__dirname, '..', 'getTranscript.py');
    const args = [
      scriptPath,
      latestVideo.id,
      '--title', latestVideo.title ?? '',
      '--channel', latestVideo.author ?? '',
      '--published', latestVideo.publishedAt ?? '',
    ];
    execFile('python', args, (err, stdout, stderr) => {
      if (err) {
        console.error('Transcript script failed:', stderr || err.message);
        return;
      }
      console.log('Transcript result:', stdout);
    });
  } else {
    logLatestVideo('No new uploads yet', latestVideo);
  }
}

function logLatestVideo(message, video) {
  const output = {
    status: message,
    channelId: CHANNEL_ID,
    videoId: video.id,
    title: video.title,
    publishedAt: video.publishedAt,
    url: video.link,
  };

  console.log(`\n${new Date().toISOString()} - ${message}`);
  console.log(JSON.stringify(output, null, 2));
}

async function main() {
  console.log(`Starting poller for channel ${CHANNEL_ID}. Interval: ${POLL_INTERVAL_MS / 1000}s`);
  await pollOnce();
  if (RUN_ONCE) {
    console.log('Run-once mode enabled. Exiting after initial poll.');
    return;
  }

  setInterval(() => {
    pollOnce().catch((error) => {
      console.error('Polling failed', error);
    });
  }, POLL_INTERVAL_MS);
}

main().catch((error) => {
  console.error('Fatal error', error);
  process.exit(1);
});
