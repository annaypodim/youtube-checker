/**
 * youtube-webhook — Supabase Edge Function
 *
 * Receives push notifications from YouTube's PubSubHubbub hub.
 * - GET  → verification challenge (echoes hub.challenge)
 * - POST → new video notification (Atom XML payload)
 *
 * Deploy with: supabase functions deploy youtube-webhook --no-verify-jwt
 */

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const RENDER_API_URL = Deno.env.get("RENDER_API_URL") ?? "";

Deno.serve(async (req: Request) => {
  // ── GET: PubSubHubbub verification ──────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const challenge = url.searchParams.get("hub.challenge");
    const mode = url.searchParams.get("hub.mode");
    const topic = url.searchParams.get("hub.topic");
    const leaseSeconds = url.searchParams.get("hub.lease_seconds");

    if (!challenge) {
      return new Response("Missing hub.challenge", { status: 400 });
    }

    console.log(`[WebSub] Verification: mode=${mode}, topic=${topic}, lease=${leaseSeconds}s`);

    // If subscribing, update the lease expiration in the database
    if (mode === "subscribe" && topic && leaseSeconds) {
      try {
        const channelIdMatch = topic.match(/channel_id=([^&]+)/);
        if (channelIdMatch) {
          const channelId = channelIdMatch[1];
          const leaseMs = parseInt(leaseSeconds, 10) * 1000;
          const expiresAt = new Date(Date.now() + leaseMs).toISOString();

          const supabase = getSupabaseAdmin();
          await supabase.from("websub_subscriptions").upsert({
            channel_id: channelId,
            topic_url: topic,
            lease_expires_at: expiresAt,
            subscribed_at: new Date().toISOString(),
            status: "active",
          });
          console.log(`[WebSub] Subscription confirmed for ${channelId}, expires ${expiresAt}`);
        }
      } catch (err) {
        console.error("[WebSub] Failed to update lease:", err);
        // Still return the challenge — don't fail verification because of a DB error
      }
    }

    // If unsubscribing, mark as expired
    if (mode === "unsubscribe" && topic) {
      try {
        const channelIdMatch = topic.match(/channel_id=([^&]+)/);
        if (channelIdMatch) {
          const supabase = getSupabaseAdmin();
          await supabase
            .from("websub_subscriptions")
            .update({ status: "expired" })
            .eq("channel_id", channelIdMatch[1]);
        }
      } catch (err) {
        console.error("[WebSub] Failed to mark unsubscribe:", err);
      }
    }

    // Echo the challenge back to confirm the subscription
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // ── POST: New video notification ───────────────────────────────────────
  if (req.method === "POST") {
    const xml = await req.text();
    console.log("[WebSub] Received notification payload");

    // Parse the Atom XML for video info
    const videoId = extractTag(xml, "yt:videoId");
    const channelId = extractTag(xml, "yt:channelId");
    const title = extractTag(xml, "title");
    const published = extractTag(xml, "published");
    const authorName = extractTagNested(xml, "author", "name");

    if (!videoId || !channelId) {
      console.error("[WebSub] Could not parse videoId or channelId from XML");
      return new Response("OK", { status: 200 }); // Still return 200 to YouTube
    }

    console.log(`[WebSub] New video: ${videoId} on channel ${channelId} — "${title}"`);

    const supabase = getSupabaseAdmin();

    // Check if we already processed this video (dedup)
    const { data: state } = await supabase
      .from("channel_state")
      .select("last_video_id, log")
      .eq("channel_id", channelId)
      .maybeSingle();

    if (state?.last_video_id === videoId) {
      console.log(`[WebSub] Already processed ${videoId}, skipping.`);
      return new Response("OK", { status: 200 });
    }

    // Look up individual subscribers
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("email")
      .eq("channel_id", channelId)
      .eq("status", "verified");

    const individualRecipients = (subs ?? []).map((s: { email: string }) => s.email);

    // Check if this channel belongs to any newsletter
    const { data: newsletters } = await supabase
      .from("newsletters")
      .select("id, name, channels, subscribers");

    let isNewsletterChannel = false;
    const currentLog: string[] = state?.log ?? [];

    for (const nl of newsletters ?? []) {
      if (!nl.channels || !nl.subscribers || nl.subscribers.length === 0) continue;
      const channelIds = Object.values(nl.channels) as string[];
      if (channelIds.includes(channelId)) {
        isNewsletterChannel = true;
        break;
      }
    }

    // Update log for newsletter channels
    const newLog = isNewsletterChannel && !currentLog.includes(videoId)
      ? [...currentLog, videoId]
      : currentLog;

    // Save channel state
    await supabase.from("channel_state").upsert({
      channel_id: channelId,
      last_video_id: videoId,
      last_checked_at: new Date().toISOString(),
      log: newLog,
    });

    // Fire-and-forget: call Render API for individual subscribers
    if (individualRecipients.length > 0 && RENDER_API_URL) {
      // Don't await — respond to YouTube immediately
      fetch(`${RENDER_API_URL}/process-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          title: title ?? "",
          channel: authorName ?? "",
          published: published ?? "",
          recipients: individualRecipients,
        }),
      }).catch((err) => console.error("[WebSub] Failed to call Render API:", err));
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("Method Not Allowed", { status: 405 });
});


// ── XML parsing helpers (lightweight, no external deps) ─────────────────────

function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractTagNested(xml: string, parentTag: string, childTag: string): string | null {
  const parentRegex = new RegExp(`<${parentTag}>[\\s\\S]*?</${parentTag}>`);
  const parentMatch = xml.match(parentRegex);
  if (!parentMatch) return null;
  return extractTag(parentMatch[0], childTag);
}
