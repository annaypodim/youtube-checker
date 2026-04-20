import { NextResponse } from 'next/server';
import { validateSubscription } from '../../../src/validation.js';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { errors, normalized } = validateSubscription(body);

  if (Object.keys(errors).length > 0) {
    return NextResponse.json(
      {
        message: 'The subscription request is invalid.',
        errors,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: `You will receive updates for ${normalized.channelUrl} at ${normalized.email}.`,
    subscription: normalized,
  });
}
