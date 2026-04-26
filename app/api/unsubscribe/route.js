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
    .select('email');

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

  return NextResponse.json({
    message: `Unsubscribed ${normalized.email} from ${normalized.channelUrl}.`,
  });
}
