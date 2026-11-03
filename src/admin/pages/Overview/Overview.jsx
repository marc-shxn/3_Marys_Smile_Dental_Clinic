import { Stat } from '../../components/UI.jsx';
import './Overview.css';

const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

function recentPatientMessages(messages) {
  const latestByConversation = new Map();
  messages.forEach(message => {
    if (message.direction === 'sent' || message.isDraft || message.archived || message.trashed) return;
    const patientName = String(message.patient || '').trim();
    const key = message.conversationId || message.patientId || (patientName ? `name:${patientName.toLocaleLowerCase()}` : '');
    if (!key) return;
    const current = latestByConversation.get(key);
    if (!current || new Date(message.createdAt || 0) >= new Date(current.createdAt || 0)) latestByConversation.set(key, message);
  });
  return [...latestByConversation.values()]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function OverviewIcon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const drawings = {
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 14l2.2 2.2 5-5"/></>,
    patient: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M19 8v6M16 11h6"/></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18M7 14.5h5"/></>,
    tasks: <><path d="m4 6 1.5 1.5L8 5M11 6.5h9M4 12l1.5 1.5L8 11M11 12.5h9M4 18l1.5 1.5L8 17M11 18.5h9"/></>,
    reports: <><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5"/><rect x="14" y="14" width="6.5" height="6.5" rx="1.5"/></>,
    messages: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>
  };
  return <svg {...common}>{drawings[name]}</svg>;
}

export default function Overview({ onNavigate, onOpenConversation, appointments = [], visits = [], patients = [], messages = [] }) {
  const todayAppointments = appointments.filter(appointment => appointment.date === today());
  const todayWalkInVisits = visits.filter(visit => visit.date === today());
  const todayVisitCount = todayAppointments.length + todayWalkInVisits.length;
  const latestPatientMessages = recentPatientMessages(messages);
  const upcoming = [...todayAppointments].sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 4);
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return <div className="overview content-page">
    <div className="welcome"><div><h1>{greeting}, Doc Rebecca</h1><p>Here's what's happening at 3 Mary's Smile today.</p></div><div className="date-card"><div className="date-card-copy"><span>{date}</span><small>Open 8:00 AM–5:00 PM</small></div><div className="date-weather-summary"><OverviewIcon name="sun"/><strong>68°</strong></div></div></div>
    <div className="stats-grid"><Stat label="Today's visits" value={todayVisitCount} note={todayVisitCount ? `${todayAppointments.length} appointments · ${todayWalkInVisits.length} walk-ins` : 'No visits today'} icon={<OverviewIcon name="calendar" />} /><Stat label="New patients" value={patients.length} note={patients.length ? 'Patient records added' : 'No new patients yet'} icon={<OverviewIcon name="patient" />} tone="blue" /><Stat label="Collected today" value="₱0" note="No revenue recorded yet" icon={<OverviewIcon name="payment" />} tone="purple" /><Stat label="Open tasks" value="0" note="No tasks assigned" icon={<OverviewIcon name="tasks" />} tone="orange" /></div>
    <div className="overview-grid"><section className="panel"><div className="panel-title"><div><h2>Today's schedule</h2><p>{todayAppointments.length ? `${todayAppointments.length} appointments scheduled` : 'No appointments scheduled for today.'}</p></div><button className="primary-button overview-schedule-action" onClick={() => onNavigate('Schedule')}>{todayAppointments.length ? 'View Schedule' : 'Create Appointment'}</button></div>{upcoming.length ? upcoming.map(appointment => <div className="schedule-row" key={appointment.id}><strong>{appointment.time}<small>{appointment.service || 'Appointment'}</small></strong><div><b>{appointment.patient}</b><small>{appointment.provider || 'Provider not assigned'}</small></div><span className="badge">{appointment.status || 'Scheduled'}</span></div>) : <div className="empty-state"><span className="empty-icon"><OverviewIcon name="calendar" /></span><h3>No appointments scheduled for today.</h3><p>Add your first appointment to start filling the day.</p></div>}</section></div>
    <div className="bottom-grid"><section className="panel overview-recent-messages"><div className="panel-title"><div><h2>Recent messages</h2><p>{latestPatientMessages.length ? `${latestPatientMessages.length} conversations` : 'No conversations yet'}</p></div></div>{latestPatientMessages.length ? latestPatientMessages.slice(0, 3).map(message => <button type="button" className="conversation-card overview-message-card" key={message.conversationId || message.patientId || message.id} onClick={() => onOpenConversation ? onOpenConversation({ id: message.patientId, name: message.patient }) : onNavigate('Messages')} aria-label={`Open conversation with ${message.patient || 'patient'}`}><span className="initial">{(message.patient || '').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()}</span><span className="overview-message-copy"><b>{message.patient}</b><small>{message.message}</small></span></button>) : <div className="empty-state compact overview-messages-empty"><span className="empty-icon"><OverviewIcon name="messages" /></span><h3>No messages yet. Patient conversations will appear here.</h3><p>Once your patient messages arrive, they’ll show up in this list.</p></div>}<div className="overview-messages-footer"><span>{latestPatientMessages.length ? `${Math.min(latestPatientMessages.length, 3)} conversations shown` : 'No conversations shown'}</span><button className="overview-messages-view-all" onClick={() => onNavigate('Messages')}>View all</button></div></section>
      <section className="panel"><div className="panel-title"><div><h2>Needs attention</h2><p>Clinic tasks and operational alerts</p></div><span className="badge">0 alerts</span></div><div className="empty-state compact"><span className="empty-icon"><OverviewIcon name="reports" /></span><h3>You're all caught up</h3><p>Notifications and items needing attention will appear here.</p></div></section></div>
  </div>;
}
