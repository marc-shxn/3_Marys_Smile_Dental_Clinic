import { useEffect, useState } from 'react';
import { appointmentApi } from '../../shared/services/authApi.js';
import { CLINIC_TIME_ZONE } from '../../shared/data/clinicSchedule.js';
import './MyAppointmentsDialog.css';

const formatDateTime = value => {
  if (!value) return 'Date and time not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date and time not available';
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: CLINIC_TIME_ZONE,
  }).format(date);
};
const formatBookedDate = value => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: CLINIC_TIME_ZONE }).format(date);
};

const statusLabel = status => ({ scheduled: 'Scheduled', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' }[String(status || '').toLowerCase()] || 'Scheduled');

export default function MyAppointmentsDialog({ navigate }) {
  const [open, setOpen] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const show = async () => {
      setOpen(true);
      setLoading(true);
      setError('');
      try {
        const result = await appointmentApi.list();
        setAppointments(Array.isArray(result.appointments) ? result.appointments : []);
      } catch (requestError) {
        setAppointments([]);
        setError(requestError.message || 'Appointments could not be loaded. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    window.addEventListener('open-my-appointments', show);
    return () => window.removeEventListener('open-my-appointments', show);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!open) return null;
  return <div className="my-appts-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="my-appts-dialog" role="dialog" aria-modal="true" aria-labelledby="my-appts-title">
      <header className="my-appts-header">
        <div><span className="my-appts-kicker">PATIENT ACCOUNT</span><h2 id="my-appts-title">My appointments</h2><p>Your booked visits and their current status.</p></div>
        <button type="button" className="my-appts-close" onClick={() => setOpen(false)} aria-label="Close appointments">×</button>
      </header>
      <div className="my-appts-content" aria-live="polite">
        {loading ? <div className="my-appts-state">Loading your appointments…</div> : error ? <div className="my-appts-state is-error" role="alert">{error}<button type="button" onClick={() => window.dispatchEvent(new Event('open-my-appointments'))}>Try again</button></div> : appointments.length ? <div className="my-appts-list">
          {appointments.map(appointment => <article className="my-appt-card" key={appointment.id}>
            <div className="my-appt-card-top"><span className="my-appt-calendar" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3m2 0h3"/></svg></span><span className={`my-appt-status status-${String(appointment.status || 'scheduled').toLowerCase()}`}>{statusLabel(appointment.status)}</span></div>
            <h3>{appointment.service || 'Dental appointment'}</h3>
            <p className="my-appt-datetime">{formatDateTime(appointment.startsAt)}</p>
            {appointment.notes && <p className="my-appt-notes"><b>Note:</b> {appointment.notes}</p>}
            <div className="my-appt-meta"><span>Booking ID: {appointment.id}</span>{formatBookedDate(appointment.createdAt) && <span>Booked {formatBookedDate(appointment.createdAt)}</span>}</div>
          </article>)}
        </div> : <div className="my-appts-state my-appts-empty"><span className="my-appts-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3m2 0h3"/></svg></span><h3>No appointments yet</h3><p>Appointments you book with the clinic will appear here.</p><button type="button" className="my-appts-book" onClick={() => { setOpen(false); navigate('/book-appointment'); }}>Book an appointment</button></div>}
      </div>
      {!loading && !error && appointments.length > 0 && <footer className="my-appts-footer"><span>{appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}</span><button type="button" className="my-appts-book" onClick={() => { setOpen(false); navigate('/book-appointment'); }}>Book another appointment</button></footer>}
    </section>
  </div>;
}
