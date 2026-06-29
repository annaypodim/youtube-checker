import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../src/supabase.js';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { newsletterId, email } = body;

  if (!newsletterId || !email) {
    return NextResponse.json(
      { message: 'Newsletter ID and email are required.' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();
    
    // Fetch current subscribers
    const { data: newsletter, error: fetchError } = await supabase
      .from('newsletters')
      .select('subscribers, name')
      .eq('id', newsletterId)
      .single();

    if (fetchError || !newsletter) {
      return NextResponse.json(
        { message: 'Newsletter not found.' },
        { status: 404 }
      );
    }

    const subscribers = newsletter.subscribers || [];
    const newSubscribers = subscribers.filter(sub => sub !== email);

    if (newSubscribers.length === subscribers.length) {
      return NextResponse.json({
        message: `You were not subscribed to ${newsletter.name}.`,
      });
    }

    const { error: updateError } = await supabase
      .from('newsletters')
      .update({ subscribers: newSubscribers })
      .eq('id', newsletterId);

    if (updateError) throw updateError;

    return NextResponse.json({
      message: `Unsubscribed from ${newsletter.name}.`,
    });
  } catch (error) {
    console.error('Newsletter unsubscribe failed:', error);
    return NextResponse.json(
      { message: 'We could not remove your subscription. Please try again.' },
      { status: 500 }
    );
  }
}
