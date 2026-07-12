import { NextResponse } from 'next/server';
import { validateSubscription } from '../../../src/validation.js';
import { getSupabaseAdmin } from '../../../src/supabase.js';
import { resolveChannelId } from '../../../src/youtube.js';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { errors, normalized } = validateSubscription(body);

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { message: 'The subscription request is invalid.', errors },
      { status: 400 }
    );
  }

  let channelId;
  try {
    channelId = await resolveChannelId(normalized.channelUrl, process.env.YT_API_KEY);
  } catch (error) {
    console.error('resolveChannelId failed:', error);
    return NextResponse.json(
      {
        message: 'We could not find that YouTube channel. Double-check the URL.',
        errors: { channelUrl: 'Channel not found on YouTube.' },
      },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error('Supabase client init failed:', error);
    return NextResponse.json(
      { message: 'Server is not configured to accept subscriptions yet.' },
      { status: 500 }
    );
  }

  // User is already authenticated via account — mark as verified immediately.
  const { error } = await supabase.from('subscriptions').insert({
    email: normalized.email,
    channel_url: normalized.channelUrl,
    channel_id: channelId,
    status: 'verified',
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({
        message: `You're already subscribed to ${normalized.channelUrl}.`,
        subscription: { ...normalized, channelId },
      });
    }
    console.error('Supabase insert failed:', error);
    return NextResponse.json(
      { message: 'We could not save your subscription. Please try again.' },
      { status: 500 }
    );
  }

  // Register channel with PubSubHubbub via Edge Function (fire-and-forget)
  try {
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-websub`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ action: 'subscribe', channel_id: channelId }),
      }
    );
  } catch (websubErr) {
    // Don't fail the subscription if WebSub registration fails — it can be retried
    console.error('WebSub registration failed (non-fatal):', websubErr);
  }

  return NextResponse.json({
    message: `Subscribed to ${normalized.channelUrl}. Summaries will arrive when new videos drop.`,
    subscription: { ...normalized, channelId },
  });
}
