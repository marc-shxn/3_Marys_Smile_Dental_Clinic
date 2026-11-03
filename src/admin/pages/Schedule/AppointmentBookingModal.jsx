import { useEffect, useMemo, useRef, useState } from 'react';
import { clinicTreatmentOptions } from '../../../shared/data/dentalServices.js';
import AdminSelect from '../../components/AdminSelect.jsx';

const frequencies = ['Weekly', 'Bi-Weekly', 'Monthly'];
const reminderMethods = ['SMS', 'Email', 'SMS & Email'];
const toDate = value => value ? new Date(`${value}T12:00:00`) : null;
const toISODate = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const addDays = (value, days) => { const date = toDate(value); date.setDate(date.getDate() + days); return toISODate(date); };
const addMonths = (value, months) => {
  const start = toDate(value);
  const year = start.getFullYear();
  const month = start.getMonth() + months;
  const day = start.getDate();
  const result = new Date(year, month, 1, 12);
  result.setDate(Math.min(day, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return toISODate(result);
};
const formatDate = value => toDate(value)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) || '—';
const minutesFromTime = value => {
  const time = String(value || '').trim();
  const twelveHour = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (twelveHour) { let hour = Number(twelveHour[1]) % 12; if (twelveHour[3].toUpperCase() === 'PM') hour += 12; return hour * 60 + Number(twelveHour[2] || 0); }
  const twentyFourHour = time.match(/^(\d{1,2}):(\d{2})/);
  return twentyFourHour ? Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]) : null;
};
const formatTime = value => {
  const minutes = minutesFromTime(value);
  if (minutes == null) return value || '—';
  return new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const appointmentTimeSlots = Array.from({ length: 17 }, (_, index) => {
  const minutes = 540 + index * 30;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour24 % 12 || 12;
  return { value: `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, label: `${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour24 < 12 ? 'AM' : 'PM'}` };
});
const patientCode = (patient, index) => patient.patientNumber || patient.patientCode || patient.code || `PT-${String(index + 1).padStart(4, '0')}`;
const makeScheduleId = () => `recurring-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function getSessionDates({ date, recurring, frequency, endMode, repeatUntil, sessionCount }) {
  if (!date) return { dates: [], exceededLimit: false };
  if (!recurring) return { dates: [date], exceededLimit: false };
  if (endMode === 'sessions') {
    const count = Number(sessionCount);
    if (!Number.isInteger(count) || count < 2) return { dates: [date], exceededLimit: false };
    if (count > 52) return { dates: [], exceededLimit: true };
    return { dates: Array.from({ length: count }, (_, index) => index === 0 ? date : frequency === 'Monthly' ? addMonths(date, index) : addDays(date, index * (frequency === 'Bi-Weekly' ? 14 : 7))), exceededLimit: false };
  }
  if (!repeatUntil || repeatUntil <= date) return { dates: [date], exceededLimit: false };
  const dates = [date];
  for (let index = 1; index <= 52; index += 1) {
    const next = frequency === 'Monthly' ? addMonths(date, index) : addDays(date, index * (frequency === 'Bi-Weekly' ? 14 : 7));
    if (next > repeatUntil) return { dates, exceededLimit: false };
    dates.push(next);
  }
  return { dates, exceededLimit: true };
}

function AppointmentDropdown({ value, options, onChange, placeholder, open, onToggle, setOpen, pickerRef, label }) {
  const selectedOption = options.find(option => option.value === value);
  return <div className="appointment-time-picker" ref={pickerRef}>
    <button className="appointment-time-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={onToggle}>
      <span className={selectedOption ? '' : 'is-placeholder'}>{selectedOption?.label || placeholder}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </button>
    {open && <div className="appointment-time-menu" role="listbox" aria-label={label}>
      {options.length ? options.map(option => <button key={option.value} type="button" role="option" aria-selected={value === option.value} className={`appointment-time-option${value === option.value ? ' is-selected' : ''}`} onClick={() => { onChange(option.value); setOpen(false); }}>
        <span>{option.label}</span>{value === option.value && <span className="appointment-dropdown-check" aria-hidden="true">✓</span>}
      </button>) : <p className="appointment-time-empty">No available times for this date.</p>}
    </div>}
  </div>;
}

export default function AppointmentBookingModal({ patients, appointments, initialDate, onClose, onSave }) {
  const [patientId, setPatientId] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [patientMenuOpen, setPatientMenuOpen] = useState(false);
  const [service, setService] = useState('');
  const [date, setDate] = useState(initialDate || '');
  const [time, setTime] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState('Weekly');
  const [endMode, setEndMode] = useState('sessions');
  const [repeatUntil, setRepeatUntil] = useState('');
  const [sessionCount, setSessionCount] = useState('3');
  const [reminderMethod, setReminderMethod] = useState('SMS');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
  const patientPickerRef = useRef(null);
  const timePickerRef = useRef(null);
  const treatmentPickerRef = useRef(null);
  const reminderPickerRef = useRef(null);
  const selectedPatientIndex = patients.findIndex(patient => patient.id === patientId);
  const selectedPatient = patients[selectedPatientIndex];
  const hasUnsavedChanges = Boolean(selectedPatient || patientQuery.trim() || service || time || date !== (initialDate || '') || recurring || notes.trim() || reminderMethod !== 'SMS' || (recurring && (frequency !== 'Weekly' || endMode !== 'sessions' || sessionCount !== '3' || repeatUntil)));
  const normalizedPatientQuery = patientQuery.trim().toLocaleLowerCase();
  const matchingPatients = useMemo(() => patients.filter((patient, index) => {
    if (!normalizedPatientQuery) return true;
    return `${patient.name || ''} ${patientCode(patient, index)}`.toLocaleLowerCase().includes(normalizedPatientQuery);
  }).slice(0, 8), [patients, normalizedPatientQuery]);
  const availableTimeSlots = useMemo(() => appointmentTimeSlots.filter(slot => !appointments.some(appointment => {
    if (appointment.date !== date || String(appointment.status || '').toLocaleLowerCase() === 'cancelled') return false;
    return minutesFromTime(appointment.time) === minutesFromTime(slot.value);
  })), [appointments, date]);
  const sessionResult = useMemo(() => getSessionDates({ date, recurring, frequency, endMode, repeatUntil, sessionCount }), [date, recurring, frequency, endMode, repeatUntil, sessionCount]);
  const selectedTreatment = service;
  const sessionPreview = sessionResult.dates.slice(0, 3);
  const requestClose = () => {
    if (hasUnsavedChanges) setShowDiscardConfirmation(true);
    else onClose();
  };
  const closeOnBackdrop = event => { if (event.target === event.currentTarget) requestClose(); };

  useEffect(() => {
    const handlePointerDown = event => {
      if (patientPickerRef.current && !patientPickerRef.current.contains(event.target)) setPatientMenuOpen(false);
      if ([timePickerRef, treatmentPickerRef, reminderPickerRef].every(ref => !ref.current || !ref.current.contains(event.target))) setOpenDropdown(null);
    };
    const handleKeyDown = event => {
      if (event.key === 'Escape') { setPatientMenuOpen(false); setOpenDropdown(null); }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (time && !availableTimeSlots.some(slot => slot.value === time)) setTime('');
  }, [availableTimeSlots, time]);

  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    setError('');
    const selectedTime = minutesFromTime(time);
    if (!selectedPatient) { setError('Please select a patient.'); return; }
    if (!service) { setError('Please select a treatment or service.'); return; }
    if (!date) { setError('Please select an appointment date.'); return; }
    if (selectedTime == null || !availableTimeSlots.some(slot => slot.value === time)) { setError('Please select an available appointment time.'); return; }
    if (selectedTime < 540 || selectedTime > 1020) { setError('Appointments must be scheduled between 9:00 AM and 5:00 PM.'); return; }
    if (recurring) {
      if (endMode === 'until' && (!repeatUntil || repeatUntil <= date)) { setError('Choose a repeat-until date after the first appointment.'); return; }
      if (endMode === 'sessions' && (!Number.isInteger(Number(sessionCount)) || Number(sessionCount) < 2 || Number(sessionCount) > 52)) { setError('Choose between 2 and 52 appointment sessions.'); return; }
      if (sessionResult.exceededLimit) { setError('This recurring schedule exceeds the 52-session limit. Choose an earlier end date.'); return; }
    }
    if (!reminderMethod) { setError('Please select a reminder method.'); return; }
    const conflictsFound = sessionResult.dates.flatMap(sessionDate => appointments
      .filter(appointment => appointment.date === sessionDate && String(appointment.status || '').toLocaleLowerCase() !== 'cancelled' && minutesFromTime(appointment.time) === selectedTime)
      .map(appointment => ({ date: sessionDate, time, details: `${appointment.patient || 'Another patient'}${appointment.service ? ` · ${appointment.service}` : ''}` })));
    if (conflictsFound.length) { setConflicts(conflictsFound); return; }

    const scheduleId = recurring ? makeScheduleId() : null;
    const records = sessionResult.dates.map((sessionDate, index) => ({
      patient: selectedPatient.name,
      patientId: selectedPatient.id,
      patientNumber: patientCode(selectedPatient, selectedPatientIndex),
      service: selectedTreatment,
      date: sessionDate,
      time,
      status: 'Scheduled',
      reminderMethod,
      notes,
      ...(recurring ? { recurringScheduleId: scheduleId, recurrenceFrequency: frequency, recurrenceIndex: index + 1, recurrenceTotal: sessionResult.dates.length } : {}),
    }));
    setSaving(true);
    try { await onSave(records); }
    catch (saveError) { setError(saveError.message || 'The appointment could not be saved.'); }
    finally { setSaving(false); }
  };

  return <div className="modal-backdrop appointment-booking-backdrop" onMouseDown={closeOnBackdrop}>
    <section className="appointment-booking-modal" role="dialog" aria-modal="true" aria-labelledby="appointment-booking-title">
      {conflicts ? <>
      <header className="appointment-booking-heading"><div><p className="eyebrow">SCHEDULE</p><h2 id="appointment-booking-title">Scheduling Conflict Detected</h2><p>{recurring ? 'One or more recurring appointment dates conflict with an existing appointment. Please review the schedule before saving.' : 'This appointment time conflicts with an existing appointment. Please review the schedule before saving.'}</p></div><button className="close-button" type="button" aria-label="Close appointment form" onClick={requestClose}>×</button></header>
        <div className="appointment-conflicts-list" role="list" aria-label="Scheduling conflicts">{conflicts.map((conflict, index) => <article key={`${conflict.date}-${index}`} role="listitem"><b>{formatDate(conflict.date)}</b><span>{formatTime(conflict.time)}</span><small>{conflict.details}</small></article>)}</div>
        <footer className="appointment-booking-actions"><button className="secondary-button" type="button" onClick={requestClose}>Cancel</button><button className="primary-button" type="button" onClick={() => setConflicts(null)}>Edit Schedule</button></footer>
      </> : <>
        <header className="appointment-booking-heading"><div><p className="eyebrow">CLINIC WORKSPACE</p><h2 id="appointment-booking-title">Book an Appointment</h2><p>Schedule a patient visit and set a reminder.</p></div><button className="close-button" type="button" aria-label="Close appointment form" onClick={requestClose}>×</button></header>
        <form className="appointment-booking-form" onSubmit={submit}>
          <div className="appointment-booking-grid">
            <div className="field appointment-form-wide"><span>Patient</span><div className="appointment-patient-picker" ref={patientPickerRef}>
              <input id="appointment-patient-search" type="text" value={selectedPatient && !patientMenuOpen ? selectedPatient.name : patientQuery} placeholder="Search patient by name or Patient ID" autoComplete="off" role="combobox" aria-autocomplete="list" aria-required="true" aria-expanded={patientMenuOpen} aria-controls="appointment-patient-options" onFocus={() => { setPatientQuery(selectedPatient?.name || patientQuery); setPatientMenuOpen(true); }} onChange={event => { setPatientId(''); setPatientQuery(event.target.value); setPatientMenuOpen(true); setError(''); }} aria-label="Search patient by name or Patient ID"/>
              {patientMenuOpen && <div className="appointment-patient-menu" id="appointment-patient-options" role="listbox" aria-label="Matching patients">{matchingPatients.length ? matchingPatients.map(patient => {
                const index = patients.indexOf(patient);
                return <button type="button" role="option" aria-selected={patient.id === patientId} key={patient.id} className={`appointment-patient-option${patient.id === patientId ? ' is-selected' : ''}`} onClick={() => { setPatientId(patient.id); setPatientQuery(patient.name || ''); setPatientMenuOpen(false); setError(''); }}>
                  <span>{patient.name}</span><small>{patientCode(patient, index)}</small>{patient.id === patientId && <span className="appointment-dropdown-check" aria-hidden="true">✓</span>}
                </button>;
              }) : <p className="appointment-patient-empty">No matching patients found.</p>}</div>}
            </div>
              {selectedPatient && !patientMenuOpen && <span className="appointment-selected-patient"><small>Patient ID: {patientCode(selectedPatient, selectedPatientIndex)}</small></span>}
              {!patients.length && <small className="appointment-form-hint">Add a patient record before booking an appointment.</small>}
            </div>
            <div className="field appointment-form-wide"><span>Treatment / Service</span><AppointmentDropdown value={service} options={clinicTreatmentOptions.map(value => ({ value, label: value }))} placeholder="Select treatment or service" open={openDropdown === 'treatment'} onToggle={() => setOpenDropdown(openDropdown === 'treatment' ? null : 'treatment')} setOpen={open => setOpenDropdown(open ? 'treatment' : null)} pickerRef={treatmentPickerRef} label="Treatment options" onChange={value => { setService(value); setError(''); }}/></div>
            <label className="field">Appointment Date<input type="date" value={date} onChange={event => setDate(event.target.value)} required/></label>
            <div className="field"><span>Appointment Time</span><AppointmentDropdown value={time} options={availableTimeSlots} placeholder="Select Time" open={openDropdown === 'time'} onToggle={() => setOpenDropdown(openDropdown === 'time' ? null : 'time')} setOpen={open => setOpenDropdown(open ? 'time' : null)} pickerRef={timePickerRef} label="Available appointment times" onChange={value => setTime(value)}/><small className="appointment-form-hint">Available hours: 9:00 AM–5:00 PM · Booked times are hidden</small></div>
          </div>

          <section className="appointment-recurring-section">
            <label className="appointment-recurring-toggle"><input type="checkbox" checked={recurring} onChange={event => { setRecurring(event.target.checked); setError(''); }}/><span className="appointment-recurring-switch" aria-hidden="true"/><span><b>Recurring Appointment</b><small>Schedule a series of visits</small></span></label>
            {recurring && <div className="appointment-recurring-fields">
              <label className="field">Repeat Frequency<AdminSelect label="Repeat frequency" value={frequency} options={frequencies} onChange={setFrequency}/></label>
              <fieldset className="appointment-repeat-end"><legend>Repeat until or number of sessions</legend>
                <label className="appointment-end-choice"><input type="radio" name="repeat-end-mode" checked={endMode === 'until'} onChange={() => setEndMode('until')}/><span>Repeat Until</span><input type="date" value={repeatUntil} min={date || undefined} disabled={endMode !== 'until'} onChange={event => setRepeatUntil(event.target.value)} aria-label="Repeat until date"/></label>
                <label className="appointment-end-choice"><input type="radio" name="repeat-end-mode" checked={endMode === 'sessions'} onChange={() => setEndMode('sessions')}/><span>Number of Sessions</span><input type="number" min="2" max="52" step="1" value={sessionCount} disabled={endMode !== 'sessions'} onChange={event => setSessionCount(event.target.value)} aria-label="Number of appointment sessions"/></label>
              </fieldset>
              <div className="appointment-session-preview"><div><b>Appointment Preview</b><small>{sessionResult.dates.length}{sessionResult.exceededLimit ? '+' : ''} sessions · {frequency}</small></div>{sessionPreview.length ? <ol>{sessionPreview.map((sessionDate, index) => <li key={`${sessionDate}-${index}`}><span>Session {index + 1}</span><b>{formatDate(sessionDate)} · {time ? formatTime(time) : 'Select a time'}</b></li>)}</ol> : <p>Choose an end date or session count to preview visits.</p>}{sessionResult.dates.length > 3 && <small className="appointment-preview-more">and {sessionResult.dates.length - 3} more sessions</small>}</div>
            </div>}
          </section>

          <div className="appointment-booking-grid appointment-booking-extra">
            <div className="field appointment-form-wide"><span>Reminder Method</span><AppointmentDropdown value={reminderMethod} options={reminderMethods.map(value => ({ value, label: value }))} placeholder="Select reminder method" open={openDropdown === 'reminder'} onToggle={() => setOpenDropdown(openDropdown === 'reminder' ? null : 'reminder')} setOpen={open => setOpenDropdown(open ? 'reminder' : null)} pickerRef={reminderPickerRef} label="Reminder methods" onChange={value => setReminderMethod(value)}/></div>
            <label className="field appointment-form-wide">Notes <span className="appointment-optional">(Optional)</span><textarea rows="3" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add optional appointment notes..."/></label>
          </div>
          {error && <p className="appointment-booking-error" role="alert">{error}</p>}
          <footer className="appointment-booking-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Appointment'}</button></footer>
        </form>
      </>}
    </section>
    {showDiscardConfirmation && <div className="appointment-discard-backdrop"><section className="appointment-discard-modal" role="alertdialog" aria-modal="true" aria-labelledby="appointment-discard-title" aria-describedby="appointment-discard-message">
      <div className="appointment-discard-icon" aria-hidden="true">!</div>
      <h2 id="appointment-discard-title">Discard Changes?</h2>
      <p id="appointment-discard-message">You have unsaved appointment details. Discard them and close this window?</p>
      <footer><button className="secondary-button" type="button" onClick={() => setShowDiscardConfirmation(false)}>Keep Editing</button><button className="appointment-discard-button" type="button" onClick={onClose}>Discard Changes</button></footer>
    </section></div>}
  </div>;
}
