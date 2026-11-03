import { useEffect, useMemo, useRef, useState } from 'react';
import AdminSelect from '../../components/AdminSelect.jsx';
import AppointmentBookingModal from './AppointmentBookingModal.jsx';
import './Schedule.css';

const FILTERS_KEY = 'smile-clinic-appointment-filters';
const STATUS_OPTIONS = ['All Appointments', 'Scheduled', 'Confirmed', 'Completed', 'Cancelled'];
const toISODate = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const today = () => toISODate(new Date());
const addDays = (value, amount) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
};
const mondayOfWeek = value => {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return toISODate(date);
};
const readSavedFilters = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || 'null');
    return STATUS_OPTIONS.includes(saved?.status) ? saved.status : 'All Appointments';
  } catch { return 'All Appointments'; }
};
function minutesFromTime(value) {
  const time = String(value || '').trim();
  const twelveHour = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3].toUpperCase() === 'PM') hour += 12;
    return hour * 60 + Number(twelveHour[2] || 0);
  }
  const twentyFourHour = time.match(/^(\d{1,2}):(\d{2})$/);
  return twentyFourHour ? Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]) : null;
}

function AppointmentStatusDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeEscape);
    listRef.current?.querySelector('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const moveFocus = (event, index) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = (index + step + STATUS_OPTIONS.length) % STATUS_OPTIONS.length;
    listRef.current?.querySelectorAll('[role="option"]')[next]?.focus();
  };

  return <div className="appointment-status-select" ref={rootRef}>
    <button ref={triggerRef} className="appointment-status-trigger" type="button" aria-label="Filter by appointment status" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span>{value}</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    {open && <div className="appointment-status-menu" role="listbox" aria-label="Appointment status" ref={listRef}>
      {STATUS_OPTIONS.map((option, index) => {
        const selected = value === option;
        return <button key={option} className={`appointment-status-option${selected ? ' is-selected' : ''}`} type="button" role="option" aria-selected={selected} onClick={() => { onChange(option); setOpen(false); triggerRef.current?.focus(); }} onKeyDown={event => moveFocus(event, index)}>
          {option !== 'All Appointments' && <i className={`appointment-option-dot status-${option.toLowerCase()}`} aria-hidden="true"/>}
          <span>{option}</span><span className="appointment-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
        </button>;
      })}
    </div>}
  </div>;
}

export default function Schedule({ appointments = [], patients = [], onAdd, onUpdateStatus }) {
  const [showForm, setShowForm] = useState(false);
  const [savedFilters] = useState(readSavedFilters);
  const [filter, setFilter] = useState(savedFilters);
  const [date, setDate] = useState(() => new Date(`${today()}T12:00:00`).getDay() === 0 ? addDays(today(), -1) : today());
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(date));

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ status: filter })); }
    catch { /* Keep filter behavior available for this visit when storage is unavailable. */ }
  }, [filter]);

  const filtered = useMemo(() => appointments
    .filter(item => item.date === date
      && (filter === 'All Appointments' || (item.status || 'Scheduled') === filter))
    .sort((a, b) => (minutesFromTime(a.time) ?? 0) - (minutesFromTime(b.time) ?? 0)), [appointments, date, filter]);
  const dayStrip = Array.from({ length: 6 }, (_, index) => addDays(weekStart, index));
  const displayDate = new Date(`${date}T12:00:00`);
  const dayTitle = displayDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const save = async records => { await onAdd(records); setShowForm(false); };
  const clearFilters = () => setFilter('All Appointments');
  const shiftWeek = amount => {
    setWeekStart(value => addDays(value, amount * 7));
    setDate(value => addDays(value, amount * 7));
  };

  return (
    <div className="content-page appointments-page">
      <div className="appointments-heading">
        <div><h1>Appointments</h1><p>Manage the clinic schedule and patient visits.</p></div>
        <button className="primary-button appointment-book" onClick={() => setShowForm(true)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3v3M16 3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M15.5 12.5v5M13 15h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg> Book</button>
      </div>

      <section className="appointment-date-strip" aria-label="Choose appointment date">
        <button className="date-step" aria-label="Previous week" onClick={() => shiftWeek(-1)}>‹</button>
        <div className="date-current"><strong>{dayTitle}</strong><small>{appointments.filter(item => item.date === date && item.status !== 'Cancelled').length} appointments</small></div>
        <button className="date-step" aria-label="Next week" onClick={() => shiftWeek(1)}>›</button>
        <div className="date-strip-divider" />
        <div className="date-days">{dayStrip.map(value => {
          const day = new Date(`${value}T12:00:00`);
          return <button className={`date-day ${value === date ? 'selected' : ''}`} key={value} onClick={() => setDate(value)}><small>{day.toLocaleDateString('en-US', { weekday: 'short' })}</small><strong>{day.getDate()}</strong></button>;
        })}</div>
      </section>

      <div className="appointment-filter-row">
        <AppointmentStatusDropdown value={filter} onChange={setFilter}/>
      </div>

      <section className="appointment-day-section">
        <div className="appointment-day-heading"><h2>{date === today() ? 'Today' : displayDate.toLocaleDateString('en-US', { weekday: 'long' })}</h2><p>{dayTitle} · 9:00 AM–5:00 PM</p></div>
        {filtered.length ? (
          <div className="appointment-results">
            <table className="appointment-table"><thead><tr>{['TIME', 'PATIENT', 'TREATMENT', 'STATUS'].map(label => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>{filtered.map(item => <tr key={item.id}><td><b>{item.time}</b></td><td><span className="appointment-avatar">{item.patient?.trim().charAt(0)?.toUpperCase() || 'P'}</span><b>{item.patient}</b></td><td>{item.service}</td><td><AdminSelect className="appointment-status-select" compact floating value={item.status || 'Scheduled'} options={['Scheduled', 'Confirmed', 'Completed', 'Cancelled']} label={`Appointment status for ${item.patient}`} onChange={value => onUpdateStatus(item.id, value)}/></td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="appointments-empty">
            <div className="empty-calendar-art" aria-hidden="true"><span className="calendar-rings" /><span className="calendar-art-grid"><i /><i /><i /><i /><i /><i /></span><span className="calendar-plus">＋</span><span className="calendar-spark spark-one" /><span className="calendar-spark spark-two" /></div>
            <h3>No Appointments Found</h3>
            <p>No appointments match the selected status or date.</p>
            <div className="empty-actions"><button className="primary-button empty-book" onClick={() => setShowForm(true)}>＋ <b>Create Appointment</b></button><button className="secondary-button empty-clear" onClick={clearFilters}>Clear Filters</button></div>
          </div>
        )}
      </section>
      {showForm && <AppointmentBookingModal patients={patients} appointments={appointments} initialDate={date} onClose={() => setShowForm(false)} onSave={save} />}
    </div>
  );
}
