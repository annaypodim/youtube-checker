/**
 * manage-websub — Supabase Edge Function
 *
 * Manages PubSubHubbub subscription lifecycle:
 *   - subscribe:   Register a channel with YouTube's PubSubHubbub hub
 *   - unsubscribe: Remove a channel from PubSubHubbub
 *   - renew:       Resubscribe all channels whose leases expire within 2 days
 *
 * Deploy with: supabase functions deploy manage-websub --no-verify-jwt
 */

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const HUB_URL = "https://pubsubhubbub.appspot.com/subscribe";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: { action: string; channel_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { action, channel_id } = body;

  // The callback URL is this project's youtube-webhook Edge Function
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const callbackUrl = `${supabaseUrl}/functions/v1/youtube-webhook`;

  const supabase = getSupabaseAdmin();

  // ── Subscribe ────────────────────────────────────────────────────────────
  if (action === "subscribe" && channel_id) {
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channel_id}`;

    const result = await sendHubRequest("subscribe", callbackUrl, topicUrl);

    if (result.ok) {
      // Record in database (status will become 'active' once YouTube verifies)
      await supabase.from("websub_subscriptions").upsert({
        channel_id,
        topic_url: topicUrl,
        subscribed_at: new Date().toISOString(),
        status: "pending",
      });
      console.log(`[WebSub] Subscribe request sent for ${channel_id}`);
    } else {
      console.error(`[WebSub] Subscribe failed for ${channel_id}: ${result.statusText}`);
    }

    return new Response(
      JSON.stringify({ action: "subscribe", channel_id, hub_status: result.status }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Unsubscribe ──────────────────────────────────────────────────────────
  if (action === "unsubscribe" && channel_id) {
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channel_id}`;

    const result = await sendHubRequest("unsubscribe", callbackUrl, topicUrl);

    if (result.ok) {
      await supabase
        .from("websub_subscriptions")
        .update({ status: "expired" })
        .eq("channel_id", channel_id);
      console.log(`[WebSub] Unsubscribe request sent for ${channel_id}`);
    } else {
      console.error(`[WebSub] Unsubscribe failed for ${channel_id}: ${result.statusText}`);
    }

    return new Response(
      JSON.stringify({ action: "unsubscribe", channel_id, hub_status: result.status }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Renew ────────────────────────────────────────────────────────────────
  if (action === "renew") {
    // Find all subscriptions expiring within the next 2 days
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data: expiring, error } = await supabase
      .from("websub_subscriptions")
      .select("channel_id, topic_url")
      .or(`lease_expires_at.lt.${twoDaysFromNow},status.eq.pending`)
      .neq("status", "expired");

    if (error) {
      console.error("[WebSub] Failed to query expiring subscriptions:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let renewed = 0;
    for (const sub of expiring ?? []) {
      const result = await sendHubRequest("subscribe", callbackUrl, sub.topic_url);
      if (result.ok) {
        await supabase.from("websub_subscriptions").upsert({
          channel_id: sub.channel_id,
          topic_url: sub.topic_url,
          subscribed_at: new Date().toISOString(),
          status: "pending",
        });
        renewed++;
        console.log(`[WebSub] Renewed subscription for ${sub.channel_id}`);
      } else {
        console.error(`[WebSub] Renewal failed for ${sub.channel_id}: ${result.statusText}`);
      }
    }

    console.log(`[WebSub] Renewal complete. Renewed ${renewed}/${(expiring ?? []).length} subscriptions.`);

    return new Response(
      JSON.stringify({ action: "renew", renewed, total: (expiring ?? []).length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ error: `Unknown action: ${action}` }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
});


// ── Helper: send a request to the PubSubHubbub hub ──────────────────────────

async function sendHubRequest(
  mode: "subscribe" | "unsubscribe",
  callbackUrl: string,
  topicUrl: string
): Promise<Response> {
  const formData = new URLSearchParams();
  formData.set("hub.mode", mode);
  formData.set("hub.callback", callbackUrl);
  formData.set("hub.topic", topicUrl);
  formData.set("hub.verify", "async");

  return await fetch(HUB_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
}
