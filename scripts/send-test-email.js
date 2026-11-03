import process from 'node:process';
import { Resend } from 'resend';
import '../server/loadLocalEnv.js';

const apiKey = String(process.env.RESEND_API_KEY || '').trim();
const from = String(process.env.RESEND_FROM || 'onboarding@resend.dev').trim();
const to = String(process.env.TEST_EMAIL_TO || '').trim();

if (!apiKey) throw new Error('Set RESEND_API_KEY in the process environment or local .env file.');
if (!to) throw new Error('Set TEST_EMAIL_TO to the mailbox that should receive the test email.');

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({
  from,
  to,
  subject: 'Hello World',
  html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
});

if (error) throw new Error(`Resend could not send the test email: ${error.message}`);
process.stdout.write(`Resend accepted the test email (id: ${data.id}).\n`);
