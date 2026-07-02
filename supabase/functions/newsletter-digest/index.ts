/**
 * newsletter-digest — Supabase Edge Function
 *
 * Triggered by pg_cron on a configurable interval (default: every 5 minutes).
 * Collects logged video IDs for each newsletter, sends them to Render FastAPI
 * for summarisation, then clears the logs.
 *
 * Deploy with: supabase functions deploy newsletter-digest --no-verify-jwt
 */

import { getSupabaseAdmin } from "../_shared/supabase-admin.ts";

const RENDER_API_URL = Deno.env.get("RENDER_API_URL") ?? "";

Deno.serve(async (req: Request) => {
  // Only accept POST (from pg_cron or manual invocation)
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  console.log("[Newsletter Digest] Running interval check...");

  const supabase = getSupabaseAdmin();

  // Load all newsletters with subscribers
  const { data: newsletters, error } = await supabase
    .from("newsletters")
    .select("id, name, channels, subscribers");

  if (error) {
    console.error("[Newsletter Digest] Failed to load newsletters:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let dispatched = 0;

  for (const row of newsletters ?? []) {
    if (!row.subscribers || row.subscribers.length === 0) continue;
    if (!row.channels) continue;

    const videoIdsForNewsletter: string[] = [];
    const channelsToClear: string[] = [];

    // Collect logs for all channels in this newsletter
    for (const channelId of Object.values(row.channels) as string[]) {
      const { data: state } = await supabase
        .from("channel_state")
        .select("last_video_id, log")
        .eq("channel_id", channelId)
        .maybeSingle();

      if (state?.log && state.log.length > 0) {
        videoIdsForNewsletter.push(...state.log);
        channelsToClear.push(channelId);
      }
    }

    if (videoIdsForNewsletter.length > 0) {
      // Deduplicate
      const uniqueVideoIds = [...new Set(videoIdsForNewsletter)];

      console.log(
        `[Newsletter: ${row.name}] Dispatching digest with ${uniqueVideoIds.length} videos`
      );

      // Call Render FastAPI (fire-and-forget)
      if (RENDER_API_URL) {
        fetch(`${RENDER_API_URL}/process-newsletter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            video_ids: uniqueVideoIds,
            newsletter_name: row.name,
            recipients: row.subscribers,
          }),
        }).catch((err) =>
          console.error(`[Newsletter: ${row.name}] Failed to call Render API:`, err)
        );
      }

      dispatched++;
    }

    // Clear logs for all processed channels
    for (const channelId of channelsToClear) {
      const { data: state } = await supabase
        .from("channel_state")
        .select("last_video_id, log")
        .eq("channel_id", channelId)
        .maybeSingle();

      if (state?.log && state.log.length > 0) {
        await supabase.from("channel_state").upsert({
          channel_id: channelId,
          last_video_id: state.last_video_id,
          last_checked_at: new Date().toISOString(),
          log: [],
        });
      }
    }
  }

  console.log(`[Newsletter Digest] Done. Dispatched ${dispatched} newsletter(s).`);

  return new Response(
    JSON.stringify({ status: "ok", dispatched }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
