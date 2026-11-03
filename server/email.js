import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { createInterface } from 'node:readline';
import { Buffer } from 'node:buffer';
import { Resend } from 'resend';

let resendClient;

function getResendClient(apiKey) {
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

function createSession(socket) {
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  async function reply() {
    const first = await iterator.next();
    if (first.done) throw new Error('SMTP server closed the connection.');
    const match = first.value.match(/^(\d{3})([- ])(.*)$/);
    if (!match) throw new Error('SMTP server returned an invalid response.');
    const code = Number(match[1]);
    const responseLines = [match[3]];
    let line = match[0];
    while (line[3] === '-') {
      const next = await iterator.next();
      if (next.done) throw new Error('SMTP server closed the connection.');
      line = next.value;
      if (!line.startsWith(String(code))) throw new Error('SMTP server returned an invalid multiline response.');
      responseLines.push(line.slice(4));
    }
    return { code, lines: responseLines };
  }
  return {
    socket,
    lines,
    reply,
    async command(value) { socket.write(`${value}\r\n`); return reply(); },
    close() { lines.close(); },
  };
}

function waitForSocket(socket, eventName) {
  return new Promise((resolve, reject) => {
    const onError = error => { cleanup(); reject(error); };
    const onReady = () => { cleanup(); resolve(socket); };
    const cleanup = () => { socket.off('error', onError); socket.off(eventName, onReady); };
    socket.once('error', onError);
    socket.once(eventName, onReady);
    socket.setTimeout(15_000, () => socket.destroy(new Error('SMTP connection timed out.')));
  });
}

function expect(response, accepted, operation) {
  if (!accepted.includes(response.code)) throw new Error(`SMTP ${operation} failed with response ${response.code}.`);
  return response;
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

export async function sendEmail({ to, subject, text, html }) {
  const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (resendApiKey) {
    const from = String(process.env.RESEND_FROM || '').trim();
    if (!/^[^\s<>@]+@[^\s<>@]+$/.test(from)) throw new Error('Set RESEND_FROM to an email address authorized by Resend.');
    const { data, error } = await getResendClient(resendApiKey).emails.send({
      from,
      to,
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
    });
    if (error) throw new Error(`Resend email delivery failed: ${error.message}`);
    return data;
  }

  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const from = String(process.env.SMTP_FROM || '').trim();
  const username = String(process.env.SMTP_USER || '');
  const password = String(process.env.SMTP_PASSWORD || '');
  const secure = process.env.SMTP_SECURE === 'true';
  const startTls = process.env.SMTP_STARTTLS === 'true' || (!process.env.SMTP_STARTTLS && port === 587 && !secure);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !/^[^\s<>@]+@[^\s<>@]+$/.test(from)) {
    throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, and SMTP_FROM.');
  }
  if (Boolean(username) !== Boolean(password)) throw new Error('Set both SMTP_USER and SMTP_PASSWORD, or leave both empty.');

  let socket = secure ? connectTls({ host, port, servername: host }) : connectTcp({ host, port });
  try {
    await waitForSocket(socket, secure ? 'secureConnect' : 'connect');
    let session = createSession(socket);
    expect(await session.reply(), [220], 'greeting');
    let capabilities = expect(await session.command('EHLO clinic-staging'), [250], 'EHLO');
    if (startTls) {
      if (!capabilities.lines.some(line => /^STARTTLS\b/i.test(line.trim()))) throw new Error('SMTP server does not offer STARTTLS.');
      expect(await session.command('STARTTLS'), [220], 'STARTTLS');
      session.close();
      socket = connectTls({ socket, host, servername: host });
      await waitForSocket(socket, 'secureConnect');
      session = createSession(socket);
      capabilities = expect(await session.command('EHLO clinic-staging'), [250], 'EHLO after STARTTLS');
    }
    if (username) {
      expect(await session.command('AUTH LOGIN'), [334], 'authentication');
      expect(await session.command(Buffer.from(username).toString('base64')), [334], 'authentication user');
      expect(await session.command(Buffer.from(password).toString('base64')), [235], 'authentication password');
    }
    expect(await session.command(`MAIL FROM:<${from}>`), [250], 'sender');
    expect(await session.command(`RCPT TO:<${to}>`), [250, 251], 'recipient');
    expect(await session.command('DATA'), [354], 'message start');
    const encodedBody = Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
    const message = [
      `From: <${from}>`,
      `To: <${to}>`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodedBody,
      '.',
      '',
    ].join('\r\n');
    socket.write(message);
    expect(await session.reply(), [250], 'message delivery');
    try { await session.command('QUIT'); } catch { /* Delivery was already accepted; ignore a missing QUIT reply. */ }
    session.close();
    socket.end();
    return capabilities;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

export function assertProductionMailConfigured() {
  if (String(process.env.RESEND_API_KEY || '').trim()) {
    if (!/^[^\s<>@]+@[^\s<>@]+$/.test(String(process.env.RESEND_FROM || '').trim())) {
      throw new Error('Production Resend configuration requires a valid RESEND_FROM address.');
    }
    return;
  }
  const missing = ['SMTP_HOST', 'SMTP_FROM'].filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Production email configuration is incomplete: ${missing.join(', ')}.`);
  if (process.env.SMTP_USER && !process.env.SMTP_PASSWORD) throw new Error('SMTP_PASSWORD is required when SMTP_USER is set.');
  const mailHost = String(process.env.SMTP_HOST || '').trim();
  const localMailpit = mailHost === 'mailpit';
  const localRelay = ['127.0.0.1', 'localhost', '[::1]'].includes(mailHost) && !process.env.SMTP_USER;
  if (!localMailpit && !localRelay && process.env.SMTP_SECURE !== 'true' && process.env.SMTP_STARTTLS !== 'true') {
    throw new Error('Production SMTP connections require SMTP_SECURE=true or SMTP_STARTTLS=true.');
  }
  if (process.env.SMTP_USER && process.env.SMTP_SECURE !== 'true' && process.env.SMTP_STARTTLS !== 'true') {
    throw new Error('SMTP credentials require SMTP_SECURE=true or SMTP_STARTTLS=true.');
  }
}
