import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import AdminLayout from './admin/layouts/AdminLayout.jsx';
import Overview from './admin/pages/Overview/Overview.jsx';
import Schedule from './admin/pages/Schedule/Schedule.jsx';
import Patients from './admin/pages/Patients/Patients.jsx';
import Messages from './admin/pages/Messages/Messages.jsx';
import More from './admin/pages/More/More.jsx';
import Billing from './admin/pages/Billing/Billing.jsx';
import Reports from './admin/pages/Reports/Reports.jsx';
import Notifications from './admin/pages/Notifications/Notifications.jsx';
import AdminLogin from './admin/pages/AdminLogin.jsx';
import { isAdminAuthenticated, signOutAdmin } from './admin/adminAuth.js';
import PatientAuth from './user/pages/PatientAuth.jsx';
import PatientPortal from './user/pages/PatientPortal.jsx';
import PublicHome from './user/pages/PublicHome.jsx';
import BookAppointment from './user/pages/BookAppointment.jsx';
import PatientRegistration from './user/pages/PatientRegistration.jsx';
import AiDentalAssessment from './user/pages/AiDentalAssessment.jsx';
import AssessmentHistory from './user/pages/AssessmentHistory.jsx';
import PatientChatWidget from './user/components/PatientChatWidget.jsx';
import MyAppointmentsDialog from './user/components/MyAppointmentsDialog.jsx';
import { clinicApi } from './shared/services/clinicApi.js';
import './shared/themes/global.css';
import './shared/styles/App.css';
import './shared/styles/auth.css';

const scrollPageToTop = () => {
  const scrollRoot = document.scrollingElement || document.documentElement;
  scrollRoot.scrollTop = 0;
};

export default function App() {
  const [page, setPage] = useState('Overview');
  const [billingSubpage, setBillingSubpage] = useState('');
  const [messageTarget, setMessageTarget] = useState(null);
  const [route, setRoute] = useState(() => window.location.pathname + window.location.search);
  const routePath = route.split('?')[0];
  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const syncRoute = () => {
      scrollPageToTop();
      setRoute(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', syncRoute);
    scrollPageToTop();
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);
  useEffect(() => {
    const handleExpiredAdminSession = () => {
      void signOutAdmin();
      if (window.location.pathname.startsWith('/admin')) {
        window.history.replaceState({}, '', '/admin/login');
        setRoute('/admin/login');
      }
    };
    window.addEventListener('admin-auth-expired', handleExpiredAdminSession);
    return () => window.removeEventListener('admin-auth-expired', handleExpiredAdminSession);
  }, []);
  useEffect(() => {
    if (routePath === '/admin' && !isAdminAuthenticated()) {
      window.history.replaceState({}, '', '/admin/login');
      setRoute('/admin/login');
    } else if (routePath === '/admin/login' && isAdminAuthenticated()) {
      window.history.replaceState({}, '', '/admin');
      setRoute('/admin');
    }
  }, [routePath]);
  useEffect(() => {
    const scheduledForms = new WeakSet();
    let activeField = null;
    let activeNote = null;
    const clearNote = () => {
      if (!activeField) return;
      activeNote?.remove();
      const ids = (activeField.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).filter(id => id !== activeNote?.id);
      if (ids.length) activeField.setAttribute('aria-describedby', ids.join(' '));
      else activeField.removeAttribute('aria-describedby');
      const previousInvalid = activeField.dataset.validationTipAriaInvalid;
      if (previousInvalid === '__missing__') activeField.removeAttribute('aria-invalid');
      else if (previousInvalid !== undefined) activeField.setAttribute('aria-invalid', previousInvalid);
      delete activeField.dataset.validationTipAriaInvalid;
      activeField = null;
      activeNote = null;
    };
    const showNote = field => {
      clearNote();
      const note = document.createElement('div');
      note.className = 'field-validation-tip';
      note.id = `field-validation-${Math.random().toString(36).slice(2, 10)}`;
      note.setAttribute('role', 'alert');
      note.setAttribute('aria-live', 'assertive');
      const icon = document.createElement('span');
      icon.className = 'field-validation-tip-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '!';
      const message = document.createElement('span');
      const validity = field.validity;
      message.textContent = validity.valueMissing ? 'Please fill out this field.'
        : validity.typeMismatch ? 'Enter a valid value.'
          : validity.patternMismatch ? 'Check the required format.'
            : validity.tooShort ? 'Enter a longer value.'
              : validity.rangeUnderflow || validity.rangeOverflow ? 'Choose a value within the allowed range.'
                : 'Please check this field.';
      note.append(icon, message);
      const rect = field.getBoundingClientRect();
      note.style.left = `${Math.max(12, Math.min(rect.left + window.scrollX, window.scrollX + window.innerWidth - 332))}px`;
      note.style.top = `${rect.bottom + window.scrollY + 7}px`;
      const previousDescribedBy = field.getAttribute('aria-describedby') || '';
      field.dataset.validationTipAriaInvalid = field.hasAttribute('aria-invalid') ? field.getAttribute('aria-invalid') : '__missing__';
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', [...previousDescribedBy.split(/\s+/).filter(Boolean), note.id].join(' '));
      document.body.append(note);
      activeField = field;
      activeNote = note;
    };
    const handleInvalid = event => {
      event.preventDefault();
      const form = event.target.form;
      if (!form || scheduledForms.has(form)) return;
      scheduledForms.add(form);
      requestAnimationFrame(() => {
        const firstInvalid = form.querySelector(':invalid');
        if (firstInvalid) {
          firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstInvalid.focus({ preventScroll: true });
          showNote(firstInvalid);
        }
        scheduledForms.delete(form);
      });
    };
    const handleInput = event => {
      if (event.target === activeField && activeField.validity.valid) clearNote();
    };
    const handleFocus = event => {
      if (activeField && event.target !== activeField) clearNote();
    };
    document.addEventListener('invalid', handleInvalid, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleInput, true);
    document.addEventListener('focusin', handleFocus, true);
    return () => {
      document.removeEventListener('invalid', handleInvalid, true);
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('change', handleInput, true);
      document.removeEventListener('focusin', handleFocus, true);
      clearNote();
    };
  }, []);
  useLayoutEffect(() => { scrollPageToTop(); }, [route, page]);
  const navigateRoute = path => { window.history.pushState({}, '', path); scrollPageToTop(); setRoute(path); };
  const logOutAdminToHome = async () => {
    await signOutAdmin();
    window.history.replaceState({}, '', '/');
    scrollPageToTop();
    setRoute('/');
  };
  const navigateAdmin = nextPage => { setPage(nextPage); setBillingSubpage(''); if (nextPage !== 'Messages') setMessageTarget(null); };
  const openPatientConversation = patient => {
    setMessageTarget(patient);
    setPage('Messages');
    setBillingSubpage('');
    const patientId = patient?.patientId || patient?.id || '';
    const patientName = String(patient?.name || patient?.patient || '').trim().toLocaleLowerCase();
    const unreadMessageNotifications = (clinicData.notifications || []).filter(notification => {
      const notificationKind = `${notification.type || ''} ${notification.title || ''}`.toLocaleLowerCase();
      const samePatient = patientId && notification.patientId
        ? notification.patientId === patientId
        : patientName && String(notification.patient || '').trim().toLocaleLowerCase() === patientName;
      return !notification.read && !notification.archived && samePatient && /message|chat|conversation/.test(notificationKind);
    });
    if (unreadMessageNotifications.length) {
      Promise.all(unreadMessageNotifications.map(notification => clinicApi.update('notifications', notification.id, { ...notification, read: true })))
        .then(refreshClinicData)
        .catch(() => { /* Keep the conversation usable if notification updates are temporarily unavailable. */ });
    }
  };
  const [clinicData, setClinicData] = useState({ patients: [], appointments: [], visits: [], messages: [], invoices: [], notifications: [], receipts: [], goals: [], reports: [] });
  const refreshClinicData = useCallback(async () => {
    try { setClinicData(await clinicApi.adminData()); }
    catch { /* Keep the current view clean if a background refresh is temporarily unavailable. */ }
  }, []);
  useEffect(() => {
    if (routePath !== '/admin' || !isAdminAuthenticated()) return undefined;
    let active = true;
    const migrateLegacyBrowserData = async () => {
      const key = 'smile-clinic-server-migration-v2';
      const legacyKey = 'smile-clinic-sqlite-migration-v1';
      try { if (localStorage.getItem(key) || localStorage.getItem(legacyKey)) return; } catch { /* Browser storage may be unavailable. */ }
      const read = name => { try { return JSON.parse(localStorage.getItem(name) || 'null'); } catch { return null; } };
      const patients = read('smile-clinic-patients');
      const keptPatients = Array.isArray(patients) ? patients.filter((patient, index) => {
        const code = patient?.patientNumber || patient?.patientCode || patient?.code || `PT-${String(index + 1).padStart(4, '0')}`;
        const name = String(patient?.name || '').trim().toLocaleLowerCase();
        return !((code === 'PT-0001' && name === 'test') || (code === 'PT-0002' && name === 'az'));
      }) : [];
      const data = {
        patients: keptPatients,
        appointments: read('smile-clinic-appointments') || [],
        messages: read('smile-clinic-messages') || [],
        invoices: read('smile-clinic-invoices') || [],
        notifications: read('smile-clinic-notifications') || [],
        collectionGoal: read('smile-clinic-collection-goal'),
        archivedGoals: read('smile-clinic-archived-goals') || [],
      };
      await clinicApi.importLegacy({ importKey: 'smile-clinic-local-records-v1', data });
      try {
        ['smile-clinic-patients', 'smile-clinic-appointments', 'smile-clinic-messages', 'smile-clinic-invoices', 'smile-clinic-notifications', 'smile-clinic-collection-goal', 'smile-clinic-archived-goals', 'smile-clinic-monthly-goal'].forEach(name => localStorage.removeItem(name));
        localStorage.setItem(key, 'done');
        localStorage.setItem(legacyKey, 'done');
      } catch { /* The server-side import key keeps retries idempotent. */ }
    };
    const load = async () => {
      try {
        if (window.location.pathname === '/admin') await migrateLegacyBrowserData();
        if (active) await refreshClinicData();
      } catch { /* The page remains usable while the server is unavailable. */ }
    };
    load();
    const events = new EventSource('/api/events');
    events.addEventListener('clinic-data', refreshClinicData);
    return () => { active = false; events.close(); };
  }, [refreshClinicData, route, routePath]);
  const { patients = [], appointments = [], visits = [], messages = [], invoices = [], notifications = [], goals = [] } = clinicData;
  const openMessageNotification = notification => {
    const relatedMessages = messages.filter(message => {
      if (notification.patientId) return message.patientId === notification.patientId;
      if (notification.patient) return message.patient?.toLocaleLowerCase() === notification.patient.toLocaleLowerCase();
      return Boolean(message.patient && !message.isDraft && !message.archived && !message.trashed);
    }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const latestMessage = relatedMessages[0];
    const patient = {
      id: notification.patientId || latestMessage?.patientId || '',
      name: notification.patient || latestMessage?.patient || '',
      focusToken: `${notification.id}:${Date.now()}`
    };
    if (patient.name) openPatientConversation(patient);
    else {
      setMessageTarget(null);
      setPage('Messages');
      setBillingSubpage('');
    }
  };
  const addPatient = async record => { const patient = await clinicApi.create('patients', record); await refreshClinicData(); return patient; };
  const updatePatient = async (id, updates) => { const patient = await clinicApi.update('patients', id, updates); await refreshClinicData(); return patient; };
  const addAppointment = async records => { const result = await clinicApi.create('appointments', Array.isArray(records) ? records : [records]); await refreshClinicData(); return result; };
  const addVisit = async record => { const result = await clinicApi.create('visits', record); await refreshClinicData(); return result; };
  const updateAppointment = async (id, status) => { await clinicApi.update('appointments', id, { status }); await refreshClinicData(); };
  const addMessage = async record => { const result = await clinicApi.create('messages', record); await refreshClinicData(); return result; };
  const updateMessage = async (id, updates) => { const result = await clinicApi.update('messages', id, updates); await refreshClinicData(); return result; };
  const messageTargetPayload = target => target && typeof target === 'object'
    ? { patientId: target.patientId || target.id || '', conversationId: target.conversationId || '', patient: target.name || target.patient || '' }
    : { patient: target };
  const markMessagesRead = async target => { await clinicApi.action('messages', 'read', messageTargetPayload(target)); await refreshClinicData(); };
  const archiveConversation = async (target, archived = true) => { await clinicApi.action('messages', 'archive', { ...messageTargetPayload(target), value: archived }); await refreshClinicData(); };
  const trashConversation = async (target, trashed = true) => { await clinicApi.action('messages', 'trash', { ...messageTargetPayload(target), value: trashed }); await refreshClinicData(); };
  const permanentlyDeleteConversation = async target => { await clinicApi.action('messages', 'delete', messageTargetPayload(target)); await refreshClinicData(); };
  const addNotification = async record => {
    if (notifications.some(item => item.id === record.id)) return null;
    const result = await clinicApi.create('notifications', record);
    await refreshClinicData();
    return result;
  };
  const markNotificationsRead = async () => { await clinicApi.action('notifications', 'mark-read'); await refreshClinicData(); };
  const markNotificationRead = async id => {
    const notification = notifications.find(item => item.id === id);
    if (!notification || notification.read) return;
    await clinicApi.update('notifications', id, { ...notification, read: true });
    await refreshClinicData();
  };
  const clearReadNotifications = async () => { await clinicApi.action('notifications', 'archive-read'); await refreshClinicData(); };
  const archiveNotification = async id => { const item = notifications.find(row => row.id === id); if (item) await clinicApi.update('notifications', id, { ...item, archived: true, archivedAt: new Date().toISOString(), archivedRead: item.read }); await refreshClinicData(); };
  const restoreNotification = async id => { const item = notifications.find(row => row.id === id); if (item) await clinicApi.update('notifications', id, { ...item, archived: false, read: item.archivedRead ?? item.read, archivedAt: '', archivedRead: null }); await refreshClinicData(); };
  const deleteNotification = async id => { await clinicApi.remove('notifications', id); await refreshClinicData(); };
  const addInvoice = async record => { const result = await clinicApi.create('invoices', record); await refreshClinicData(); return result; };
  const recordInvoicePayment = async (id, payment) => {
    const current = invoices.find(row => row.id === id);
    if (!current) return { ok: false };
    if (String(current.status || '').toLowerCase() === 'paid') return { ok: false, alreadyPaid: true };
    try {
      const result = await clinicApi.recordPayment(id, payment);
      await refreshClinicData();
      return { ok: true, status: result.invoice.status, statusUpdated: String(current.status || '').toLowerCase() !== String(result.invoice.status || '').toLowerCase() };
    } catch (error) { return { ok: false, error: error.message }; }
  };
  const saveGoal = async goal => { const result = await clinicApi.update('goals', goal.id, goal).catch(async error => { if (error.message.includes('not found')) return clinicApi.create('goals', goal); throw error; }); await refreshClinicData(); return result; };
  const deleteGoal = async id => { await clinicApi.remove('goals', id); await refreshClinicData(); };
  const saveReport = async report => { await clinicApi.create('reports', report); await refreshClinicData(); };
  const common = { onNavigate: navigateAdmin };
  const withPatientChat = element => <>{element}<MyAppointmentsDialog navigate={navigateRoute}/><PatientChatWidget /></>;
  if (routePath === '/admin/login' || (routePath === '/admin' && !isAdminAuthenticated())) return <AdminLogin navigate={navigateRoute} />;
  if (routePath === '/') return withPatientChat(<PublicHome navigate={navigateRoute} />);
  if (routePath === '/ai-dental-assessment') return withPatientChat(<AiDentalAssessment navigate={navigateRoute} />);
  if (routePath === '/assessment-history') return withPatientChat(<AssessmentHistory navigate={navigateRoute} />);
  if (routePath === '/patient-registration') return withPatientChat(<PatientRegistration route={route} navigate={navigateRoute} />);
  if (routePath === '/book-appointment') return withPatientChat(<BookAppointment route={route} navigate={navigateRoute} />);
  if (['/patient-login', '/login', '/create-account', '/forgot-password', '/reset-link-sent', '/reset-password', '/verify-email', '/verify-phone', '/email-verified'].includes(routePath)) return <PatientAuth route={route} navigate={navigateRoute} />;
  if (routePath === '/patient-portal') return withPatientChat(<PatientPortal navigate={navigateRoute} />);
  const pages = {
    Overview: <Overview {...common} appointments={appointments} visits={visits} patients={patients} messages={messages} onOpenConversation={openPatientConversation} />,
    Schedule: <Schedule {...common} appointments={appointments} patients={patients} onAdd={addAppointment} onUpdateStatus={updateAppointment} />,
    Patients: <Patients {...common} patients={patients} appointments={appointments} visits={visits} invoices={invoices} onAdd={addPatient} onUpdate={updatePatient} onAddVisit={addVisit} onOpenConversation={openPatientConversation} />,
    Messages: <Messages {...common} messages={messages} patients={patients} requestedPatient={messageTarget} onAdd={addMessage} onUpdate={updateMessage} onMarkRead={markMessagesRead} onArchive={archiveConversation} onTrash={trashConversation} onDelete={permanentlyDeleteConversation} />,
    More: <More {...common} />,
    Billing: <Billing {...common} invoices={invoices} appointments={appointments} patients={patients} goals={goals} onAdd={addInvoice} onRecordPayment={recordInvoicePayment} onSaveGoal={saveGoal} onDeleteGoal={deleteGoal} onBreadcrumbChange={setBillingSubpage} onGoalCompleted={addNotification} />,
    Reports: <Reports appointments={appointments} visits={visits} patients={patients} invoices={invoices} onSaveReport={saveReport} />,
    Notifications: <Notifications notifications={notifications} onMarkNotificationsRead={markNotificationsRead} onClearReadNotifications={clearReadNotifications} onArchiveNotification={archiveNotification} onRestoreNotification={restoreNotification} onDeleteNotification={deleteNotification} />
  };
  if (routePath !== '/admin') {
    window.history.replaceState({}, '', '/');
    return <PublicHome navigate={navigateRoute} />;
  }
  const unreadMessages = messages.filter(message => !message.isDraft && !message.archived && !message.trashed && message.direction !== 'sent' && !message.isRead).length;
  return <AdminLayout activePage={page} breadcrumbSubpage={page === 'Billing' ? billingSubpage : ''} onNavigate={navigateAdmin} onLogout={logOutAdminToHome} notifications={notifications} unreadMessages={unreadMessages} onMarkNotificationsRead={markNotificationsRead} onMarkNotificationRead={markNotificationRead} onOpenMessageNotification={openMessageNotification} onClearReadNotifications={clearReadNotifications}>{pages[page] || pages.Overview}</AdminLayout>;
}
