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
    
    if (subscribers.includes(email)) {
      return NextResponse.json({
        message: `You are already subscribed to ${newsletter.name}.`,
      });
    }

    const { error: updateError } = await supabase
      .from('newsletters')
      .update({ subscribers: [...subscribers, email] })
      .eq('id', newsletterId);

    if (updateError) throw updateError;

    return NextResponse.json({
      message: `Subscribed to ${newsletter.name}. Digests will arrive in your inbox.`,
    });
  } catch (error) {
    console.error('Newsletter subscribe failed:', error);
    return NextResponse.json(
      { message: 'We could not save your subscription. Please try again.' },
      { status: 500 }
    );
  }
}
