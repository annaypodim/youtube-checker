import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Parser } from 'xml2js';

const DEFAULT_CHANNEL_ID = 'UCPF-oYb2-xN5FbCXy0167Gg'; // Roel Van de Paar
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60 * 1000);
const CHANNEL_ID = process.env.YT_CHANNEL_ID ?? DEFAULT_CHANNEL_ID;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.resolve(
  process.env.STATE_FILE ?? path.join(__dirname, '..', 'state', 'latest-video.json')
);
const parser = new Parser({ explicitArray: false });
const RUN_ONCE = process.argv.includes('--once');

async function fetchLatestVideo() {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
  const response = await fetch(feedUrl);

  if (!response.ok) {
    throw new Error(`YouTube feed request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const parsed = await parser.parseStringPromise(xml);
  const entries = parsed?.feed?.entry;

  if (!entries) {
    throw new Error('YouTube feed returned no entries.');
  }

  const normalizedEntries = (Array.isArray(entries) ? entries : [entries])
    .map((entry) => normalizeEntry(entry))
    // Sort by published date so metadata edits to older videos do not appear as new uploads.
    .sort((a, b) => getPublishedTimestamp(b.publishedAt) - getPublishedTimestamp(a.publishedAt));
  const latestEntry = normalizedEntries[0];

  if (!latestEntry) {
    throw new Error('Unable to find the latest video in feed.');
  }

  return latestEntry;
}

function normalizeEntry(entry) {
  return {
    id: entry['yt:videoId'],
    title: entry.title,
    publishedAt: entry.published,
    updatedAt: entry.updated,
    link: extractLink(entry.link),
    author: entry.author?.name,
    raw: entry,
  };
}

function getPublishedTimestamp(dateString) {
  const timestamp = dateString ? Date.parse(dateString) : NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function extractLink(linkNode) {
  if (!linkNode) {
    return undefined;
  }

  if (typeof linkNode === 'string') {
    return linkNode;
  }

  if (Array.isArray(linkNode)) {
    const alternate = linkNode.find((entry) => entry?.$.rel === 'alternate');
    return alternate?.$.href ?? linkNode[0]?.$.href;
  }

  return linkNode?.$.href;
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
