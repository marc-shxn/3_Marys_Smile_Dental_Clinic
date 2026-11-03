import { useCallback, useEffect, useRef, useState } from 'react';
import { authApi } from '../../shared/services/authApi.js';
import { patientPortalApi } from '../../shared/services/clinicApi.js';
import LinkifiedText from '../../shared/components/LinkifiedText.jsx';
import './PatientChatWidget.css';

const faqChoices = [
  ['Services', 'What are your dental services?'],
  ['Clinic location', 'Where is your clinic?'],
  ['Clinic hours', 'What are your clinic hours?'],
  ['Contact', 'How can I contact the clinic?'],
];

const formatTime = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
};

function ChatIcon({ name = 'message' }) {
  const shape = name === 'send' ? <><path d="m21 3-7.5 18-3.8-7.7L2 9.5 21 3Z"/><path d="M21 3 9.7 13.3"/></> : <><path d="M5 4.5h14A3.5 3.5 0 0 1 22.5 8v6A3.5 3.5 0 0 1 19 17.5h-8l-6 3v-3A3.5 3.5 0 0 1 1.5 14V8A3.5 3.5 0 0 1 5 4.5Z"/><path d="M7 9h10M7 13h6"/></>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>;
}

export default function PatientChatWidget() {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [failedText, setFailedText] = useState('');
  const listRef = useRef(null);
  const openRef = useRef(false);
  const userIdRef = useRef('');

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => {
    document.documentElement.classList.toggle('patient-is-authenticated', Boolean(user));
    return () => document.documentElement.classList.remove('patient-is-authenticated');
  }, [user]);
  useEffect(() => {
    let active = true;
    let sessionCheck = 0;
    const syncSession = async () => {
      const check = ++sessionCheck;
      try {
        const { user: signedIn } = await authApi.session();
        if (!active || check !== sessionCheck) return;
        if (userIdRef.current && userIdRef.current !== signedIn?.id) {
          setMessages([]);
          setUnread(0);
          setOpen(false);
          setDraft('');
        }
        userIdRef.current = signedIn?.id || '';
        setUser(signedIn || null);
      } catch {
        if (!active || check !== sessionCheck) return;
        userIdRef.current = '';
        setMessages([]);
        setUnread(0);
        setOpen(false);
        setDraft('');
        setError('');
        setUser(null);
      }
    };
    const handleAuthChange = () => {
      userIdRef.current = '';
      setMessages([]);
      setUnread(0);
      setOpen(false);
      setDraft('');
      setError('');
      setUser(null);
      syncSession();
    };
    window.addEventListener('patient-auth-changed', handleAuthChange);
    syncSession();
    return () => { active = false; window.removeEventListener('patient-auth-changed', handleAuthChange); };
  }, []);

  const loadMessages = useCallback(async ({ markRead = false } = {}) => {
    try {
      const data = await patientPortalApi.getMessages();
      const rows = Array.isArray(data.messages) ? data.messages : [];
      if (!user) return;
      setMessages(rows);
      const count = Number(data.unreadCount || 0);
      setUnread(count);
      setError('');
      if (markRead && count) {
        await patientPortalApi.markMessagesRead();
        setUnread(0);
        setMessages(current => current.map(message => message.direction === 'sent' ? { ...message, isRead: true } : message));
      }
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        setMessages([]);
        setUnread(0);
        setOpen(false);
        setDraft('');
        setUser(null);
        setError('');
      } else if (user) setError(err.message || 'Messages could not be loaded.');
    } finally { setLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!user) { setLoading(false); return undefined; }
    loadMessages({ markRead: openRef.current });
    const events = new EventSource('/api/events');
    const handleClinicUpdate = event => {
      try { if (JSON.parse(event.data).resource === 'messages') loadMessages({ markRead: openRef.current }); }
      catch { /* A malformed update is ignored; the regular refresh below will recover. */ }
    };
    events.addEventListener('clinic-data', handleClinicUpdate);
    const poll = window.setInterval(() => loadMessages({ markRead: openRef.current }), 8000);
    const refreshOnReturn = () => { if (document.visibilityState === 'visible') loadMessages({ markRead: openRef.current }); };
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      events.removeEventListener('clinic-data', handleClinicUpdate);
      events.close();
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [user, loadMessages]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  const openChat = () => {
    setOpen(true);
    setError('');
    loadMessages({ markRead: true });
  };
  const sendMessage = async text => {
    const message = String(text || '').trim();
    if (!message || sending) return;
    setSending(true);
    setError('');
    setFailedText('');
    try {
      await patientPortalApi.sendMessage(message);
      setDraft('');
      setFailedText('');
      await loadMessages({ markRead: true });
    } catch (err) {
      setError(err.message || 'Your message could not be sent. Please retry.');
      setFailedText(message);
    } finally { setSending(false); }
  };
  const submit = event => { event.preventDefault(); sendMessage(draft); };
  const handleKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(draft); }
  };

  if (!user) return null;
  const sortedMessages = [...messages].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  return <div className="patient-chat-widget">
    {open && <section className="patient-chat-panel" role="dialog" aria-label="Chat with 3 Mary’s Smile Dental Clinic" aria-modal="false">
      <header className="patient-chat-header"><img src="/marys-smile-gold.png" alt=""/><div><b>3 Mary’s Smile</b><small>Dental Clinic · Messages</small></div><span className="patient-chat-online" aria-label="Clinic messages"/><button type="button" aria-label="Close chat" onClick={() => setOpen(false)}>×</button></header>
      <div className="patient-chat-thread" ref={listRef} aria-live="polite" aria-busy={loading}>
        {loading ? <div className="patient-chat-loading"><i/>Loading conversation…</div> : sortedMessages.length ? sortedMessages.map(message => {
          const fromPatient = message.direction === 'received';
          return <article className={`patient-chat-message ${fromPatient ? 'from-patient' : 'from-clinic'}`} key={message.id}>
            <div className="patient-chat-bubble"><LinkifiedText text={message.message}/></div>
            <div className="patient-chat-meta"><time>{formatTime(message.createdAt)}</time>{fromPatient && <span>{message.isRead ? 'Read' : 'Sent'}</span>}</div>
          </article>;
        }) : <div className="patient-chat-welcome"><span className="patient-chat-welcome-icon"><ChatIcon/></span><b>Hello! Welcome to 3 Mary’s Smile Dental Clinic.</b><p>Choose a question below for an automatic answer, or send the clinic a message.</p><small>Messages stay in your patient account.</small></div>}
        {error && <div className="patient-chat-error" role="alert"><span>{error}</span>{failedText && <button type="button" onClick={() => sendMessage(failedText)} disabled={sending}>Retry</button>}{!failedText && <button type="button" onClick={() => loadMessages({ markRead: true })}>Retry</button>}</div>}
      </div>
      <div className="patient-chat-faqs" role="group" aria-label="Frequently asked questions">{faqChoices.map(([label, question]) => <button type="button" key={label} onClick={() => sendMessage(question)} disabled={sending || loading}>{label}</button>)}</div>
      <form className="patient-chat-composer" onSubmit={submit}><label className="patient-chat-sr-only" htmlFor="patient-chat-message">Write a message</label><textarea id="patient-chat-message" rows="2" maxLength="2000" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder="Write a message…" disabled={sending}/><button type="submit" aria-label="Send message" disabled={!draft.trim() || sending}><ChatIcon name="send"/></button></form>
    </section>}
    <button type="button" className={`patient-chat-launcher${open ? ' is-open' : ''}`} onClick={open ? () => setOpen(false) : openChat} aria-label={open ? 'Close chat' : unread ? `Chat with us, ${unread} unread messages` : 'Chat with us'} aria-expanded={open} title="Chat with Us"><ChatIcon/>{unread > 0 && !open && <span className="patient-chat-badge">{unread > 9 ? '9+' : unread}</span>}<span className="patient-chat-launcher-label">Chat with Us</span></button>
  </div>;
}
