// Textbee SMS sending adapter, intentionally disabled while verification is email-only.
// Keep this server-side reference for a future SMS rollout; do not expose its API key to Vite.
/*
export async function sendSms({ to, text }) {
  const apiKey = String(process.env.TEXTBEE_API_KEY || '').trim();
  if (!apiKey) throw new Error('SMS delivery is not configured. Set TEXTBEE_API_KEY in the server environment.');

  const response = await fetch('https://api.textbee.dev/api/v1/gateway/send-sms', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipients: [to], message: text }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Textbee rejected the SMS request (HTTP ${response.status}).`);
  }
  return response.json().catch(() => ({}));
}
*/
