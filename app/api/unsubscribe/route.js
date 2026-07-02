import { NextResponse } from 'next/server';
import { validateSubscription } from '../../../src/validation.js';
import { getSupabaseAdmin } from '../../../src/supabase.js';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { errors, normalized } = validateSubscription(body);

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      { message: 'The unsubscribe request is invalid.', errors },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error('Supabase client init failed:', error);
    return NextResponse.json(
      { message: 'Server is not configured to process unsubscribes yet.' },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .delete()
    .eq('email', normalized.email)
    .eq('channel_url', normalized.channelUrl)
    .select('channel_id');

  if (error) {
    console.error('Supabase delete failed:', error);
    return NextResponse.json(
      { message: 'We could not process your unsubscribe. Please try again.' },
      { status: 500 }
    );
  }

  if (!data || data.length === 0) {
    return NextResponse.json(
      { message: `No subscription found for ${normalized.email} on ${normalized.channelUrl}.` },
      { status: 404 }
    );
  }

  // Check if any other subscribers remain for this channel
  const channelId = data[0]?.channel_id;
  if (channelId) {
    const { data: remaining } = await supabase
      .from('subscriptions')
      .select('email')
      .eq('channel_id', channelId)
      .limit(1);

    // Also check if the channel is used in any newsletter
    const { data: newsletters } = await supabase
      .from('newsletters')
      .select('channels');

    const inNewsletter = (newsletters ?? []).some((nl) => {
      if (!nl.channels) return false;
      return Object.values(nl.channels).includes(channelId);
    });

    // If no individual subscribers AND not in any newsletter, unsubscribe from PubSubHubbub
    if ((!remaining || remaining.length === 0) && !inNewsletter) {
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-websub`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ action: 'unsubscribe', channel_id: channelId }),
          }
        );
      } catch (websubErr) {
        console.error('WebSub unsubscribe failed (non-fatal):', websubErr);
      }
    }
  }

  return NextResponse.json({
    message: `Unsubscribed ${normalized.email} from ${normalized.channelUrl}.`,
  });
}
