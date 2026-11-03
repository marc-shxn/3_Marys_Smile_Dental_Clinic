import { useEffect, useMemo, useRef, useState } from 'react';
import emptyInboxIllustration from '../../assets/messages-empty.jpg';
import LinkifiedText from '../../../shared/components/LinkifiedText.jsx';
import './Messages.css';

const initials = name => (name || '').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
const patientCode = (patient, index) => patient?.patientNumber || patient?.patientCode || patient?.code || `PT-${String(Math.max(index + 1, 1)).padStart(4, '0')}`;
const timeLabel = value => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return date.toDateString() === yesterday.toDateString() ? 'Yesterday' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const categoryFor = message => {
  if (message?.messageType) return message.messageType;
  const subject = (message?.subject || '').toLowerCase();
  if (subject.includes('appointment')) return 'Appointment';
  if (subject.includes('treatment')) return 'Treatment';
  if (subject.includes('insurance')) return 'Insurance';
  if (subject.includes('form')) return 'Forms';
  return 'Message';
};
const conversationKey = message => message.patientId || (message.conversationId ? `conversation:${message.conversationId}` : `name:${message.patient || ''}`);

function MessageFilterDropdown({ value, options, label, open, onToggle, onChange }) {
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = `messages-${label.toLowerCase().replace(/\s+/g, '-')}-options`;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) onToggle(false); };
    const closeEscape = event => { if (event.key === 'Escape') { onToggle(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeEscape);
    menuRef.current?.querySelector('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeEscape);
    };
  }, [open, onToggle]);

  return <div className="message-filter-select" ref={rootRef}>
    <button ref={triggerRef} className={`message-filter-trigger${open ? ' is-open' : ''}`} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={menuId} onClick={() => onToggle(!open)}>
      <span>{value}</span><i aria-hidden="true"/>
    </button>
    {open && <div ref={menuRef} className="message-filter-menu" id={menuId} role="listbox" aria-label={label}>
      {options.map(option => <button key={option} type="button" role="option" aria-selected={value === option} className={`message-filter-option${value === option ? ' is-selected' : ''}`} onClick={() => { onChange(option); onToggle(false); triggerRef.current?.focus(); }}>
        <span>{option}</span>{value === option && <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8.2 2.8 2.8 6.2-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>)}
    </div>}
  </div>;
}

const messageTypes = ['Appointment Reminder', 'Appointment Confirmation', 'Appointment Follow-up', 'Billing Reminder', 'Treatment Update', 'General Inquiry', 'Custom Message'];
const sendMethods = ['SMS', 'Email', 'SMS & Email'];
const messageTemplates = {
  'Appointment Reminder': {
    subject: 'Appointment Reminder',
    message: "Hello [Patient Name],\n\nThis is a reminder that you have an upcoming appointment scheduled on [Appointment Date] at [Appointment Time].\n\nPlease arrive at least 10 minutes before your scheduled appointment.\n\nThank you,\n3 Mary's Smile Dental Clinic",
  },
  'Appointment Confirmation': {
    subject: 'Appointment Confirmed',
    message: "Hello [Patient Name],\n\nYour appointment on [Appointment Date] at [Appointment Time] has been successfully confirmed.\n\nWe look forward to seeing you at the clinic.\n\nThank you,\n3 Mary's Smile Dental Clinic",
  },
  'Appointment Follow-up': {
    subject: 'Appointment Follow-up',
    message: "Hello [Patient Name],\n\nWe hope your recent visit went well.\n\nIf you have any concerns, questions, or require additional treatment, please contact the clinic.\n\nThank you,\n3 Mary's Smile Dental Clinic",
  },
  'Billing Reminder': {
    subject: 'Billing Reminder',
    message: "Hello [Patient Name],\n\nThis is a reminder regarding your outstanding balance of [Amount Due].\n\nPlease settle the payment by [Due Date].\n\nIf you have already made a payment, kindly disregard this message.\n\nThank you,\n3 Mary's Smile Dental Clinic",
  },
  'Treatment Update': {
    subject: 'Treatment Update',
    message: "Hello [Patient Name],\n\nWe would like to provide an update regarding your current treatment plan.\n\nTreatment:\n[Treatment Name]\n\nStatus:\n[Treatment Status]\n\nPlease contact the clinic if you have any questions.\n\nThank you,\n3 Mary's Smile Dental Clinic",
  },
  'General Inquiry': {
    subject: 'Clinic Inquiry',
    message: "Hello [Patient Name],\n\nThank you for contacting 3 Mary's Smile Dental Clinic.\n\nWe have received your inquiry and will respond as soon as possible.\n\nThank you for your patience.",
  },
  'Custom Message': { subject: 'Custom Message', message: '' },
};

function ComposeMessageModal({ patients, preselectedPatient, initialDraft, onClose, onSaveDraft, onSend }) {
  const initialPatient = patients.find(patient => patient.id === initialDraft?.patientId || patient.name === initialDraft?.patient) || preselectedPatient || null;
  const initialTemplateMessage = messageTemplates[initialDraft?.messageType]?.message.replace('[Patient Name]', initialPatient?.name || '[Patient Name]') || '';
  const patientPickerRef = useRef(null);
  const initialValuesRef = useRef({
    patientId: initialPatient?.id || '',
    patientQuery: initialPatient?.name || initialDraft?.patient || '',
    messageType: initialDraft?.messageType || '',
    subject: initialDraft?.subject || '',
    message: initialDraft?.message || '',
  });
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [patientQuery, setPatientQuery] = useState(initialPatient?.name || initialDraft?.patient || '');
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);
  const [messageTypeOpen, setMessageTypeOpen] = useState(false);
  const [messageType, setMessageType] = useState(initialDraft?.messageType || '');
  const [subject, setSubject] = useState(initialDraft?.subject || '');
  const [message, setMessage] = useState(initialDraft?.message || '');
  const [messageEdited, setMessageEdited] = useState(Boolean(initialDraft?.message && initialDraft.message !== initialTemplateMessage));
  const [sendVia, setSendVia] = useState(initialDraft?.sendVia || '');
  const [error, setError] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const matchingPatients = patients.filter(patient => `${patient.name || ''} ${patientCode(patient, patients.indexOf(patient))}`.toLowerCase().includes(patientQuery.trim().toLowerCase())).slice(0, 8);

  useEffect(() => {
    if (!patientMenuOpen) return undefined;
    const closeOutside = event => { if (!patientPickerRef.current?.contains(event.target)) setPatientMenuOpen(false); };
    const closeEscape = event => { if (event.key === 'Escape') setPatientMenuOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeEscape);
    };
  }, [patientMenuOpen]);

  function payload(isDraft) {
    const patientIndex = selectedPatient ? patients.indexOf(selectedPatient) : -1;
    return {
      ...(initialDraft?.id ? { id: initialDraft.id } : {}),
      patient: selectedPatient?.name || '',
      patientId: selectedPatient?.id || '',
      patientNumber: selectedPatient ? patientCode(selectedPatient, patientIndex) : '',
      messageType,
      subject: subject.trim(),
      message: message.trim(),
      sendVia,
      isDraft,
      direction: 'sent',
      isRead: false,
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedPatient) { setError('Please select a patient.'); return; }
    if (!messageType) { setError('Please select a message type.'); return; }
    if (!subject.trim()) { setError('Please enter a subject.'); return; }
    if (!message.trim()) { setError('Please enter a message.'); return; }
    if (!sendVia) { setError('Please select a notification method.'); return; }
    try { await onSend(payload(false)); }
    catch (sendError) { setError(sendError.message || 'The message could not be sent.'); }
  }

  async function saveDraft() {
    if (!selectedPatient) { setError('Select a patient to save this draft.'); return; }
    try { await onSaveDraft(payload(true)); }
    catch (saveError) { setError(saveError.message || 'The draft could not be saved.'); }
  }

  const initialValues = initialValuesRef.current;
  const hasUnsavedProgress = (selectedPatient?.id || '') !== initialValues.patientId
    || (!selectedPatient && patientQuery.trim() !== initialValues.patientQuery.trim())
    || messageType !== initialValues.messageType
    || subject !== initialValues.subject
    || message !== initialValues.message;

  function requestClose() {
    if (hasUnsavedProgress) setShowDiscardConfirm(true);
    else onClose();
  }

  function choosePatient(patient) {
    setSelectedPatient(patient);
    setPatientQuery(patient.name || '');
    setPatientMenuOpen(false);
    if (messageType && messageType !== 'Custom Message' && !messageEdited) {
      setMessage(messageTemplates[messageType].message.replace('[Patient Name]', patient.name || '[Patient Name]'));
    }
    setError('');
  }

  function chooseMessageType(nextType) {
    const template = messageTemplates[nextType];
    setMessageType(nextType);
    setSubject(template.subject);
    setMessage(template.message.replace('[Patient Name]', selectedPatient?.name || '[Patient Name]'));
    setMessageEdited(false);
    setError('');
  }

  return <>
    <div className="modal-backdrop compose-message-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <section className="form-modal compose-message-modal" role="dialog" aria-modal="true" aria-labelledby="compose-message-title">
      <header className="modal-heading"><div><p className="eyebrow">PATIENT COMMUNICATION</p><h2 id="compose-message-title">Compose a Message</h2><p>Send an appointment, treatment, billing, or general update to a patient.</p></div><button className="close-button" type="button" aria-label="Close compose message" onClick={requestClose}>×</button></header>
      <form onSubmit={submit}>
        <div className="compose-message-fields">
          <div className="field compose-field-wide"><label htmlFor="compose-patient-search">Patient</label><div className="compose-patient-picker" ref={patientPickerRef}>
            <input id="compose-patient-search" type="text" value={selectedPatient && !patientMenuOpen ? selectedPatient.name : patientQuery} placeholder="Search patient by name or Patient ID" autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={patientMenuOpen} aria-controls="compose-patient-options" onFocus={() => setPatientMenuOpen(true)} onChange={event => { setSelectedPatient(null); setPatientQuery(event.target.value); setPatientMenuOpen(true); setError(''); }}/>
            {patientMenuOpen && <div className="compose-patient-menu" id="compose-patient-options" role="listbox" aria-label="Matching patients">{matchingPatients.length ? matchingPatients.map(patient => {
              const index = patients.indexOf(patient);
              return <button type="button" role="option" aria-selected={patient.id === selectedPatient?.id} key={patient.id} onClick={() => choosePatient(patient)}><span>{patient.name}</span><small>{patientCode(patient, index)}</small></button>;
            }) : <p>No matching patients found.</p>}</div>}
          </div>{selectedPatient && <small className="compose-selected-patient">Patient ID: {patientCode(selectedPatient, patients.indexOf(selectedPatient))}</small>}</div>

          <div className="field compose-field-wide"><span className="compose-field-label">Message Type</span><MessageFilterDropdown value={messageType || 'Choose a message type'} options={messageTypes} label="Message type" open={messageTypeOpen} onToggle={setMessageTypeOpen} onChange={chooseMessageType}/></div>
          <label className="field compose-field-wide">Subject<input value={subject} onChange={event => { setSubject(event.target.value); setError(''); }} placeholder={messageType ? messageTemplates[messageType].subject : 'Conversation subject'}/></label>
          <label className="field compose-field-wide">Message<textarea rows="5" value={message} onChange={event => { setMessage(event.target.value); setMessageEdited(true); setError(''); }} placeholder="Write your message..."/></label>
          {messageType && messageType !== 'Custom Message' && <small className="compose-template-hint compose-field-wide">Replace any bracketed details with the patient's information before sending.</small>}
        </div>

        <fieldset className="compose-send-method"><legend>Send Via</legend><div>{sendMethods.map(method => <label key={method} className={sendVia === method ? 'is-selected' : ''}><input type="radio" name="send-via" value={method} checked={sendVia === method} onChange={() => { setSendVia(method); setError(''); }}/><span className="compose-radio-mark" aria-hidden="true">✓</span>{method}</label>)}</div></fieldset>
        <p className="compose-delivery-note">SMS and email delivery are not connected yet. Sending saves this message to the clinic conversation.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="compose-message-actions"><button className="secondary-button" type="button" onClick={saveDraft}>Save Draft</button><button className="primary-button" type="submit">Send Message</button></footer>
      </form>
    </section>
    </div>
    {showDiscardConfirm && <div className="modal-backdrop discard-message-backdrop"><section className="form-modal discard-message-modal" role="alertdialog" aria-modal="true" aria-labelledby="discard-message-title" aria-describedby="discard-message-description"><div className="discard-message-icon" aria-hidden="true">📄</div><h2 id="discard-message-title">Discard Message?</h2><p id="discard-message-description">You have unsaved changes to this message. Are you sure you want to close without saving?</p><footer><button className="secondary-button" type="button" onClick={() => setShowDiscardConfirm(false)}>Continue Editing</button><button className="discard-message-button" type="button" onClick={onClose}>Discard Message</button></footer></section></div>}
  </>;
}

export default function Messages({ messages, patients = [], requestedPatient, onAdd, onUpdate, onMarkRead, onArchive, onTrash, onDelete, onNavigate }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [conversationOpen, setConversationOpen] = useState(true);
  const [mobileConversationVisible, setMobileConversationVisible] = useState(false);
  const [folder, setFolder] = useState('Inbox');
  const [messageFilter, setMessageFilter] = useState('All messages');
  const [showForm, setShowForm] = useState(false);
  const [draftToEdit, setDraftToEdit] = useState(null);
  const [openFilter, setOpenFilter] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const actionsMenuRef = useRef(null);
  const threadMessagesRef = useRef(null);
  const patientTarget = conversation => ({ patientId: conversation.patientId, conversationId: conversation.conversationId, name: conversation.name });

  useEffect(() => {
    if (!requestedPatient?.name) return;
    const patientThread = messages.filter(message => requestedPatient.id ? message.patientId === requestedPatient.id : message.patient === requestedPatient.name);
    setQuery('');
    setFolder(patientThread.length && patientThread.every(message => message.trashed) ? 'Trash' : patientThread.length && patientThread.every(message => message.archived) ? 'Archived' : 'Inbox');
    setMessageFilter('All messages');
    setSelected(requestedPatient.id || `name:${requestedPatient.name}`);
    setConversationOpen(true);
    setMobileConversationVisible(window.matchMedia('(max-width: 860px)').matches);
    setReply('');
  }, [requestedPatient?.id, requestedPatient?.name, requestedPatient?.focusToken]);

  const allConversations = useMemo(() => {
    const keys = [...new Set(messages.filter(message => message.patient).map(conversationKey))];
    const conversations = keys.map(key => {
      const thread = messages.filter(message => conversationKey(message) === key);
      const name = thread[0]?.patient || '';
      const latest = thread.reduce((current, message) => !current || new Date(message.createdAt || 0) > new Date(current.createdAt || 0) ? message : current, null);
      return { key, name, patientId: thread.find(message => message.patientId)?.patientId, conversationId: thread.find(message => message.conversationId)?.conversationId, thread, latest, unread: thread.filter(message => message.direction !== 'sent' && !message.isRead && !message.isDraft).length, archived: thread.every(message => message.archived), trashed: thread.every(message => message.trashed) };
    });
    const requestedKey = requestedPatient?.id || (requestedPatient?.name ? `name:${requestedPatient.name}` : '');
    if (requestedPatient?.name && !conversations.some(conversation => conversation.key === requestedKey || (!requestedPatient.id && conversation.name === requestedPatient.name))) {
      conversations.push({ key: requestedKey, name: requestedPatient.name, patientId: requestedPatient.id, thread: [], latest: null, unread: 0, archived: false, trashed: false, isNew: true });
    }
    return conversations;
  }, [messages, requestedPatient?.id, requestedPatient?.name]);
  const conversations = allConversations.filter(conversation => {
    if (folder === 'Trash') return conversation.trashed;
    if (folder === 'Archived') return conversation.archived && !conversation.trashed;
    if (folder === 'Drafts') return conversation.thread.some(message => message.isDraft) && !conversation.archived && !conversation.trashed;
    return conversation.thread.some(message => !message.isDraft && !message.archived && !message.trashed);
  }).map(conversation => {
    const eligibleMessages = conversation.thread.filter(message => folder === 'Drafts' ? message.isDraft : !message.isDraft);
    const latest = eligibleMessages.reduce((current, message) => !current || new Date(message.createdAt || 0) > new Date(current.createdAt || 0) ? message : current, null);
    return { ...conversation, latest: latest || conversation.latest };
  });
  const visibleConversations = conversations
    .filter(conversation => conversation.name.toLowerCase().includes(query.toLowerCase()))
    .filter(conversation => messageFilter !== 'Unread' || conversation.unread > 0)
    .sort((a, b) => {
      const requestedKey = requestedPatient?.id || (requestedPatient?.name ? `name:${requestedPatient.name}` : '');
      if (requestedKey && a.key === requestedKey) return -1;
      if (requestedKey && b.key === requestedKey) return 1;
      return new Date(b.latest?.createdAt || 0) - new Date(a.latest?.createdAt || 0);
    });
  const activeConversation = conversationOpen ? visibleConversations.find(conversation => conversation.key === selected) || visibleConversations[0] || null : null;
  const unreadCount = messages.filter(message => !message.isDraft && !message.archived && message.direction !== 'sent' && !message.isRead).length;
  const activeThread = activeConversation && folder !== 'Drafts' ? [...activeConversation.thread].filter(message => !message.isDraft && (folder === 'Archived' || !message.archived)).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)) : [];
  const preview = activeConversation?.latest || null;
  const threadMessagesContent = folder === 'Drafts'
    ? <div className="thread-empty-state"><span aria-hidden="true">✎</span><b>Draft saved</b><p>This message has not been sent. Edit the draft to continue.</p></div>
    : activeThread.length
      ? activeThread.map((message, index) => (
        <div key={message.id || `${message.createdAt}-${index}`} className={`thread-message ${message.direction === 'sent' ? 'from-clinic' : 'from-patient'}`}>
          <div className="thread-message-meta"><span>{message.direction === 'sent' ? 'You' : activeConversation.name}</span><time>{timeLabel(message.createdAt)}</time></div>
          <div className="thread-bubble"><LinkifiedText text={message.message}/></div>
        </div>
      ))
      : <div className="thread-empty-state"><span aria-hidden="true">✉</span><b>No messages yet</b><p>Start a conversation with {activeConversation?.name || 'this patient'} by writing a reply below.</p></div>;

  useEffect(() => {
    const thread = threadMessagesRef.current;
    if (thread && activeConversation) thread.scrollTop = thread.scrollHeight;
  }, [activeConversation?.key, activeThread.length, preview?.createdAt, requestedPatient?.focusToken]);

  useEffect(() => { setActionsMenuOpen(false); }, [activeConversation?.key, folder]);
  useEffect(() => {
    if (!actionsMenuOpen) return undefined;
    const closeOutside = event => { if (!actionsMenuRef.current?.contains(event.target)) setActionsMenuOpen(false); };
    const closeEscape = event => { if (event.key === 'Escape') setActionsMenuOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); window.removeEventListener('keydown', closeEscape); };
  }, [actionsMenuOpen]);

  useEffect(() => {
    if (folder !== 'Inbox' || !activeConversation?.unread || busyAction) return;
    Promise.resolve(onMarkRead?.(patientTarget(activeConversation))).catch(error => setActionError(error.message || 'Messages could not be marked as read.'));
  }, [activeConversation?.key, activeConversation?.unread, folder]);

  async function sendReply(event) {
    event.preventDefault();
    if (!reply.trim() || !activeConversation || busyAction) return;
    const patient = activeConversation.name;
    setBusyAction(true);
    setActionError('');
    try {
      await onAdd({ patient, patientId: activeConversation.patientId || requestedPatient?.id, subject: `Re: ${preview?.subject || 'Conversation'}`, messageType: 'General Inquiry', sendVia: 'Clinic Portal', message: reply.trim(), direction: 'sent', isRead: false });
      if (folder === 'Archived') {
        await onArchive(patientTarget(activeConversation), false);
        setSelected(null);
        setConversationOpen(true);
      }
      setReply('');
    } catch (error) {
      setActionError(error.message || 'The reply could not be saved.');
    } finally {
      setBusyAction(false);
    }
  }
  function openComposer(draft = null) {
    setDraftToEdit(draft);
    setShowForm(true);
  }
  async function saveDraft(values) {
    if (values.id && onUpdate) await onUpdate(values.id, values);
    else await onAdd(values);
    setSelected(values.patientId || `name:${values.patient}`);
    setFolder('Drafts');
    setShowForm(false);
    setDraftToEdit(null);
  }
  async function sendMessage(values) {
    if (values.id && onUpdate) await onUpdate(values.id, { ...values, isDraft: false, createdAt: new Date().toISOString() });
    else await onAdd({ ...values, isDraft: false });
    setSelected(values.patientId || `name:${values.patient}`);
    setFolder('Inbox');
    setShowForm(false);
    setDraftToEdit(null);
  }
  async function markAllRead() {
    setActionError('');
    try { await Promise.all(visibleConversations.map(conversation => onMarkRead(patientTarget(conversation)))); }
    catch (error) { setActionError(error.message || 'Messages could not be marked as read.'); }
  }
  async function toggleArchive() {
    if (!activeConversation || busyAction) return;
    setBusyAction(true);
    setActionError('');
    try {
      if (folder === 'Trash') await onTrash(patientTarget(activeConversation), false);
      else await onArchive(patientTarget(activeConversation), !activeConversation.archived);
      setSelected(null);
    } catch (error) { setActionError(error.message || 'The conversation could not be updated.'); }
    finally { setBusyAction(false); }
  }
  async function moveToTrash() {
    if (!activeConversation || busyAction) return;
    setBusyAction(true);
    setActionError('');
    try {
      await onTrash(patientTarget(activeConversation), true);
      setShowDeleteConfirm(false);
      setSelected(null);
      setConversationOpen(false);
    } catch (error) { setActionError(error.message || 'The conversation could not be moved to Trash.'); }
    finally { setBusyAction(false); }
  }
  async function permanentlyDeleteConversation() {
    if (!activeConversation || busyAction) return;
    setBusyAction(true);
    setActionError('');
    try {
      await onDelete(patientTarget(activeConversation));
      setShowPermanentDeleteConfirm(false);
      setSelected(null);
      setConversationOpen(false);
    } catch (error) { setActionError(error.message || 'The conversation could not be deleted.'); }
    finally { setBusyAction(false); }
  }
  const selectFolder = value => { setFolder(value); setSelected(null); setConversationOpen(true); setMobileConversationVisible(false); setOpenFilter(null); };
  const openConversation = key => {
    if (window.matchMedia('(max-width: 860px)').matches) {
      setSelected(key);
      setConversationOpen(true);
      setMobileConversationVisible(true);
      return;
    }
    if (conversationOpen && (selected || visibleConversations[0]?.key) === key) {
      setConversationOpen(false);
      return;
    }
    setSelected(key);
    setConversationOpen(true);
  };

  return <div className={`content-page messages-page${mobileConversationVisible ? ' is-mobile-conversation' : ''}`}>
    {actionError && <p className="form-error" role="alert">{actionError}</p>}
    <div className="messages-heading"><div><h1>Messages</h1><p>Keep patient conversations organized and secure.</p></div><button className="primary-button compose-button" onClick={() => openComposer()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m18.4 2.6 3 3L12 15l-4 1 1-4 10.4-9.4Z"/></svg>Compose</button></div>

    <div className="messages-workspace">
      <section className="messages-inbox-column" aria-label="Patient inbox">
        <label className="message-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search conversations" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search conversations"/></label>
        <div className="message-filters"><MessageFilterDropdown value={folder === 'Archived' ? 'Choose folder' : folder} options={['Inbox', 'Drafts', 'Trash']} label="Choose inbox folder" open={openFilter === 'folder'} onToggle={open => setOpenFilter(open ? 'folder' : null)} onChange={selectFolder}/><MessageFilterDropdown value={messageFilter} options={['All messages', 'Unread']} label="Filter messages" open={openFilter === 'status'} onToggle={open => setOpenFilter(open ? 'status' : null)} onChange={value => { setMessageFilter(value); setOpenFilter(null); }}/><button className="message-filter-icon" aria-label={folder === 'Inbox' ? 'Show archived conversations' : 'Show inbox conversations'} title={folder === 'Inbox' ? 'Archived conversations' : 'Inbox'} aria-pressed={folder === 'Archived'} onClick={() => { setFolder(folder === 'Inbox' ? 'Archived' : 'Inbox'); setMessageFilter('All messages'); setSelected(null); setConversationOpen(true); setMobileConversationVisible(false); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4zM5 8v12h14V8M9 12h6"/></svg></button></div>
        <div className="inbox-section-heading"><div><h2>{folder}</h2><p>{folder === 'Trash' ? 'Deleted after 30 days' : folder === 'Drafts' ? `${conversations.length} saved drafts` : `${unreadCount} unread · ${allConversations.length} total conversations`}</p></div>{folder === 'Inbox' && <button onClick={markAllRead} disabled={!unreadCount}>Mark all read</button>}</div>
        <div className="messages-contact-list">
          {visibleConversations.length ? visibleConversations.map(conversation => <button key={conversation.key} className={`message-contact ${activeConversation?.key === conversation.key ? 'selected' : ''} ${conversation.unread ? 'unread' : ''}`} onClick={() => openConversation(conversation.key)}>
            <span className="contact-avatar-wrap"><span className="initial">{initials(conversation.name)}</span>{conversation.unread > 0&&<i/>}</span>
            <span className="contact-copy"><b>{conversation.name}</b><small>{conversation.latest?.message || conversation.latest?.subject || 'Start a conversation'}</small><em>{folder === 'Drafts' ? 'Draft' : conversation.latest ? categoryFor(conversation.latest) : 'New conversation'}</em></span>
            <time>{timeLabel(conversation.latest?.createdAt)}</time>
          </button>) : <div className="inbox-list-empty"><b>{folder === 'Archived' ? 'No archived conversations' : query || messageFilter === 'Unread' ? 'No matching conversations' : 'Your inbox is empty'}</b><p>{folder === 'Archived' ? 'Archived messages will appear here.' : 'New conversations will appear here.'}</p></div>}
        </div>
      </section>

      <section className="messages-detail-panel" aria-label="Selected message">
        {activeConversation ? <div className="active-conversation">
          <header className="received-header"><button type="button" className="messages-mobile-back" onClick={() => { setMobileConversationVisible(false); setConversationOpen(true); }} aria-label="Back to inbox"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h14"/></svg><span>Inbox</span></button><div className="received-person"><span className="contact-avatar-wrap"><span className="initial">{initials(activeConversation.name)}</span>{activeConversation.unread>0&&<i/>}</span><div><b>{activeConversation.name}</b><em>● {preview ? categoryFor(preview) : 'New conversation'}</em></div></div><div className="conversation-header-actions">{activeConversation.unread>0&&<span className="unread-indicator">● Unread</span>}<div className="conversation-menu-anchor" ref={actionsMenuRef}><button className="conversation-menu-trigger" type="button" aria-label="Conversation actions" aria-haspopup="menu" aria-expanded={actionsMenuOpen} onClick={() => setActionsMenuOpen(open => !open)}><span aria-hidden="true">⋮</span></button>{actionsMenuOpen&&<div className="conversation-actions-menu" role="menu" aria-label="Conversation actions"><button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); folder === 'Drafts' ? openComposer(activeConversation.latest) : openComposer(); }}>{folder === 'Drafts' ? 'Edit Draft' : 'Compose'}</button><button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); toggleArchive(); }} disabled={!activeThread.length || busyAction}>{folder === 'Trash' || activeConversation.archived ? 'Restore' : 'Archive'}</button><button type="button" role="menuitem" onClick={async () => { setActionsMenuOpen(false); setActionError(''); try { await onMarkRead(patientTarget(activeConversation)); } catch (error) { setActionError(error.message || 'Messages could not be marked as read.'); } }} disabled={!activeConversation.unread || busyAction}>Mark as Read</button>{folder !== 'Trash'&&<button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); setActionError(''); setShowDeleteConfirm(true); }}>Delete</button>}{folder === 'Trash'&&<button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); setShowPermanentDeleteConfirm(true); }}>Delete permanently</button>}</div>}</div></div></header>
          <div className="thread-messages" ref={threadMessagesRef}>
            <small className="thread-label">{folder === 'Drafts' ? 'SAVED DRAFT' : 'CONVERSATION'}</small>
            {threadMessagesContent}
          </div>
          {folder !== 'Drafts' && activeConversation.patientId && <form className="received-reply" onSubmit={sendReply}><div className="received-reply-box"><textarea id="reply-message" aria-label={`Reply to ${activeConversation.name}`} value={reply} onChange={event => setReply(event.target.value)} placeholder="Write a reply..."/><div className="received-reply-toolbar"><div className="reply-utilities"><button type="button" aria-label="Attach file" title="Attach file" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7"/></svg></button><button type="button" aria-label="Add emoji" title="Add emoji" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg></button></div><button className="send-reply" type="submit" aria-label="Send reply" title={busyAction ? 'Sending reply…' : 'Send reply'} disabled={!reply.trim() || busyAction}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg></button></div></div></form>}
          {folder !== 'Drafts' && !activeConversation.patientId && <p className="message-deleted-patient-note">This patient profile has been removed. The conversation remains available for reference.</p>}
        </div> : conversationOpen === false && visibleConversations.length ? <div className="conversation-closed"><div className="closed-chat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4.5h14A3.5 3.5 0 0 1 22.5 8v6A3.5 3.5 0 0 1 19 17.5h-8l-6 3v-3A3.5 3.5 0 0 1 1.5 14V8A3.5 3.5 0 0 1 5 4.5Z"/><path d="M7 9h10M7 13h6"/></svg></div><h2>Conversation closed</h2><p>Select a conversation from the inbox to open its messages.</p></div> : <div className="messages-empty-detail">
          <img src={emptyInboxIllustration} alt="Illustration of a clinic conversation inbox"/>
          <h2>{allConversations.length ? 'No Conversations Found' : 'No Conversations Found'}</h2>
          <p>{allConversations.length ? 'There are no conversations in this folder. Switch folders or start a new conversation.' : 'There are currently no patient conversations available. Start a new conversation to communicate securely with patients.'}</p>
          <div className="messages-empty-actions"><button className="primary-button" onClick={() => setShowForm(true)}>↗ <b>Compose Message</b></button><button className="secondary-button" onClick={() => onNavigate?.('Patients')}>View Contacts</button></div>
        </div>}
      </section>
    </div>
    {showForm && <ComposeMessageModal patients={patients} preselectedPatient={requestedPatient} initialDraft={draftToEdit} onClose={() => { setShowForm(false); setDraftToEdit(null); }} onSaveDraft={saveDraft} onSend={sendMessage}/>}
    {showDeleteConfirm && activeConversation && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowDeleteConfirm(false); }}><section className="form-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title"><header className="modal-heading"><div><p className="eyebrow">DELETE CONVERSATION</p><h2 id="delete-confirm-title">Move conversation to Trash?</h2><p>The conversation with {activeConversation.name} will stay in Trash and be deleted after 30 days.</p></div><button className="close-button" type="button" aria-label="Close" onClick={() => setShowDeleteConfirm(false)}>×</button></header><footer className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowDeleteConfirm(false)}>Cancel</button><button className="primary-button confirm-delete-button" type="button" onClick={moveToTrash}>Move to Trash</button></footer></section></div>}
    {showPermanentDeleteConfirm && activeConversation && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setShowPermanentDeleteConfirm(false); }}><section className="form-modal delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="permanent-delete-title"><header className="modal-heading"><div><p className="eyebrow">TRASH</p><h2 id="permanent-delete-title">Delete permanently?</h2><p>This will permanently delete the conversation with {activeConversation.name} and all its messages. This action cannot be undone.</p></div><button className="close-button" type="button" aria-label="Close" onClick={() => setShowPermanentDeleteConfirm(false)}>×</button></header><footer className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowPermanentDeleteConfirm(false)}>Cancel</button><button className="primary-button confirm-delete-button" type="button" onClick={permanentlyDeleteConversation}>Delete permanently</button></footer></section></div>}
  </div>;
}
