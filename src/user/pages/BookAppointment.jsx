import { useEffect, useMemo, useRef, useState } from 'react';
import { authApi, appointmentApi } from '../../shared/services/authApi.js';
import { usePatientProfilePhoto } from '../../shared/hooks/usePatientProfilePhoto.js';
import UserSelect from '../components/UserSelect.jsx';
import { readPatientRegistration } from '../../shared/services/patientLocalData.js';
import { CLINIC_TIME_ZONE } from '../../shared/data/clinicSchedule.js';
import { clinicTreatmentOptions, dentalServiceCategories } from '../../shared/data/dentalServices.js';
import './public-site.css';
import './BookAppointment.css';

const pad = value => String(value).padStart(2, '0');
const todayInClinic = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const monthKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const monthLabel = month => new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: CLINIC_TIME_ZONE }).format(new Date(`${month}-01T12:00:00+08:00`));
const prettyDate = date => date ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: CLINIC_TIME_ZONE }).format(new Date(`${date}T12:00:00+08:00`)) : 'Choose a date';
const readBookingDraft = () => { try { return JSON.parse(sessionStorage.getItem('smile-clinic-booking-draft') || 'null') || { service: '', date: '', startsAt: '', notes: '' }; } catch { return { service: '', date: '', startsAt: '', notes: '' }; } };

function BookingProgress({ step }) {
  const labels = ['Appointment', 'Registration', 'Review'];
  return <div className="booking-flow-progress" aria-label={`Step ${step} of 3`}><span>Step {step} of 3</span><div className="booking-flow-progress-track"><i style={{ width: `${step * 100 / 3}%` }}/></div><ol>{labels.map((label, index) => <li className={index + 1 === step ? 'is-current' : index + 1 < step ? 'is-complete' : ''} key={label}>{label}</li>)}</ol></div>;
}

function PatientRegistrationSummary({ registration }) {
  if (!registration) return null;
  const patient = registration.patient || {};
  const answers = registration.answers || {};
  const patientFields = [
    ['Full name', patient.fullName], ['Complete address', patient.address], ['Phone / mobile number', patient.phone], ['Age', patient.age],
    ['Sex', patient.sex], ['Occupation', patient.occupation], ['Weight (kg)', patient.weight], ['Height (cm)', patient.height],
    ['Birthday', patient.birthday], ['Civil status', patient.civilStatus], ['Referred by', patient.referredBy],
    ['Patient / guardian name', patient.guardianName], ['Guardian contact number', patient.guardianPhone],
  ];
  const historyFields = [
    ['Hospitalized during the past 2 years', 'hospitalized'], ['Under a physician’s care during the past 2 years', 'physicianCare'],
    ['Taken medications during the past 2 years', 'medications'], ['Known drug or medicine allergies', 'allergies'],
    ['Excessive bleeding requiring treatment', 'bleeding'], ...(patient.sex === 'Female' ? [['Currently pregnant', 'pregnant']] : []),
    ['Other serious illnesses', 'seriousIllness'], ['Sores, lumps, or unusual mouth growths', 'mouthGrowths'],
  ];
  const followUps = [
    ['Hospitalization details', 'hospitalizedDetails'], ['Physician care details', 'physicianDetails'], ['Medication details', 'medicationDetails'],
    ['Allergy details', 'allergyDetails'], ['Bleeding details', 'bleedingDetails'], ['Other condition', 'otherCondition'],
    ['Pregnancy details', 'pregnancyDetails'], ['Serious illness details', 'seriousIllnessDetails'], ['Mouth concern details', 'mouthGrowthDetails'],
  ].filter(([, key]) => answers[key] && (key !== 'pregnancyDetails' || patient.sex === 'Female'));
  return <div className="booking-patient-summary">
    <h3>Patient information</h3><dl className="booking-registration-grid">{patientFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}</dl>
    <h3>Medical history</h3><dl className="booking-registration-grid">{historyFields.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{answers[key] || 'Not answered'}</dd></div>)}<div><dt>Conditions selected</dt><dd>{answers.conditions?.length ? answers.conditions.join(', ') : 'None selected'}</dd></div>{followUps.map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{answers[key]}</dd></div>)}<div><dt>Patient consent</dt><dd>{registration.consent ? 'Confirmed' : 'Not confirmed'}</dd></div></dl>
  </div>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
}

function AccountMenuIcon({ name }) {
  const paths = {
    profile: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.6-3.2 2.8-5 6.5-5s5.9 1.8 6.5 5"/></>,
    security: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/></>,
    appointments: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3m2 0h3"/></>,
    logout: <><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"/><path d="M13 8l4 4-4 4M17 12H9"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function BookAppointment({ navigate, route = '' }) {
  const query = new URLSearchParams(route.split('?')[1] || '');
  const step = Math.max(1, Math.min(3, Number(query.get('step')) || 1));
  const [user, setUser] = useState(null);
  const [profilePhoto] = usePatientProfilePhoto(user);
  const [checking, setChecking] = useState(true);
  const [form, setForm] = useState(readBookingDraft);
  const [registration, setRegistration] = useState(null);
  const [visibleMonth, setVisibleMonth] = useState(() => readBookingDraft().date?.slice(0, 7) || monthKey(new Date(`${todayInClinic()}T12:00:00+08:00`)));
  const [availability, setAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const headerRef = useRef(null);
  const today = todayInClinic();

  useEffect(() => {
    let alive = true;
    authApi.session().then(({ user: signedInUser }) => {
      if (!alive) return;
      setUser(signedInUser);
      setRegistration(readPatientRegistration(signedInUser));
    })
      .catch(() => { if (alive) setUser(null); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [navigate]);

  useEffect(() => { sessionStorage.setItem('smile-clinic-booking-draft', JSON.stringify(form)); }, [form]);

  useEffect(() => {
    if (!profileMenuOpen && !menuOpen) return undefined;
    const closeOnOutside = event => {
      const panel = document.getElementById('mobile-nav');
      const toggle = headerRef.current?.querySelector('.menu-toggle');
      if (profileMenuOpen && !headerRef.current?.contains(event.target)) setProfileMenuOpen(false);
      if (menuOpen && !panel?.contains(event.target) && !toggle?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') { setMenuOpen(false); setProfileMenuOpen(false); } };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [menuOpen, profileMenuOpen]);

  useEffect(() => {
    let alive = true;
    setLoadingAvailability(true);
    setAvailabilityError('');
    appointmentApi.availability(visibleMonth)
      .then(data => { if (alive) setAvailability(data); })
      .catch(err => { if (alive) setAvailabilityError(err.message || 'Appointment availability could not be loaded.'); })
      .finally(() => { if (alive) setLoadingAvailability(false); });
    return () => { alive = false; };
  }, [visibleMonth]);

  const monthDate = new Date(`${visibleMonth}-01T00:00:00Z`);
  const daysInMonth = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1)).getUTCDay();
  const calendarCells = useMemo(() => [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${visibleMonth}-${pad(index + 1)}`),
  ], [daysInMonth, firstWeekday, visibleMonth]);
  const dayAvailability = availability?.days?.find(day => day.date === form.date);
  const availableSlots = dayAvailability?.slots || [];
  const slotGroups = [
    { name: 'Morning', slots: availableSlots.filter(slot => Number(slot.time.slice(0, 2)) < 12) },
    { name: 'Afternoon', slots: availableSlots.filter(slot => Number(slot.time.slice(0, 2)) >= 12) },
  ].filter(group => group.slots.length);
  const chosenSlot = availableSlots.find(slot => slot.startsAt === form.startsAt);

  function selectDate(date) {
    setForm(current => ({ ...current, date: current.date === date ? '' : date, startsAt: '' }));
    setError('');
  }

  function shiftMonth(delta) {
    const next = new Date(`${visibleMonth}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setVisibleMonth(next.toISOString().slice(0, 7));
    setForm(current => ({ ...current, date: '', startsAt: '' }));
  }

  function resetSelection() {
    setForm({ service: '', date: '', startsAt: '', notes: '' });
    setError('');
  }

  function goStep(nextStep) {
    setError('');
    setMenuOpen(false);
    setProfileMenuOpen(false);
    navigate(nextStep === 1 ? '/book-appointment' : `/book-appointment?step=${nextStep}`);
    if (nextStep >= 2) setRegistration(readPatientRegistration(user));
  }

  function continueFromAppointment() {
    if (!form.service || !form.date || !chosenSlot?.available) {
      setError('Choose a procedure, date, and available time before continuing.');
      return;
    }
    sessionStorage.setItem('smile-clinic-booking-draft', JSON.stringify(form));
    if (!user) {
      navigate('/patient-login?next=' + encodeURIComponent('/book-appointment'));
      return;
    }
    const savedRegistration = readPatientRegistration(user);
    setRegistration(savedRegistration);
    if (savedRegistration) goStep(2);
    else navigate('/patient-registration?next=' + encodeURIComponent('/book-appointment?step=2'));
  }

  async function logout() {
    setLogoutError('');
    try { await authApi.logout(); setUser(null); setProfileMenuOpen(false); navigate('/'); }
    catch (err) { setLogoutError(err.message || 'Could not log out. Please try again.'); }
  }

  const accountNameParts = user?.fullName?.trim().split(/\s+/) || [];
  const accountInitials = accountNameParts.length > 1 ? (accountNameParts[0][0] + accountNameParts.at(-1)[0]).toUpperCase() : accountNameParts[0]?.[0]?.toUpperCase() || 'P';
  const goHomeSection = id => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
    navigate('/');
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const openProfileMenu = () => { setMenuOpen(false); setProfileMenuOpen(open => !open); };

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!form.service || !form.date || !chosenSlot?.available) {
      setError('Choose a procedure, date, and available time before confirming.');
      return;
    }
    setBusy(true);
    try {
      await appointmentApi.create({ service: form.service, startsAt: form.startsAt, notes: form.notes });
      sessionStorage.removeItem('smile-clinic-booking-draft');
      setRegistration(readPatientRegistration(user));
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Your appointment could not be booked. Please try another time.');
      if (err.message?.toLowerCase().includes('booked')) {
        appointmentApi.availability(visibleMonth).then(setAvailability).catch(() => {});
        setForm(current => ({ ...current, startsAt: '' }));
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="public-site booking-page booking-redesign">
    <header className="public-nav" ref={headerRef}>
      <a href="/" className="public-logo" onClick={event => { event.preventDefault(); navigate('/'); }}><img src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo"/><span className="public-brand-name"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></a>
      <nav aria-label="Main navigation"><button type="button" onClick={() => goHomeSection('home')}>Home</button><button type="button" onClick={() => goHomeSection('services')}>Services</button><button type="button" onClick={() => goHomeSection('about')}>About us</button><button type="button" onClick={() => goHomeSection('contact')}>Contact</button></nav>
      <div className="nav-actions"><button type="button" className="site-button small" onClick={() => goStep(1)}>Book an appointment</button>{user ? <button type="button" className="profile-nav" onClick={openProfileMenu} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img className="profile-photo-image" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}</button> : <button type="button" className="nav-login" onClick={() => navigate('/patient-login?next=%2Fbook-appointment')}>Log in</button>}</div>
      <button type="button" className={`menu-toggle${menuOpen ? ' is-open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => { setProfileMenuOpen(false); setMenuOpen(open => !open); }}><span/><span/><span/></button>
      {menuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}/>}
      <div className={`mobile-nav-panel${menuOpen ? ' is-open' : ''}`} id="mobile-nav" aria-hidden={!menuOpen} inert={!menuOpen}>
        <button type="button" onClick={() => goHomeSection('home')}>Home</button><button type="button" onClick={() => goHomeSection('services')}>Services</button><button type="button" onClick={() => goHomeSection('about')}>About us</button><button type="button" onClick={() => goHomeSection('contact')}>Contact</button>
        {!user && <div className="mobile-nav-actions"><button type="button" className="nav-login" onClick={() => navigate('/patient-login?next=%2Fbook-appointment')}>Log in</button></div>}
      </div>
      {user && profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Account menu">
        <div className="profile-menu-heading">{profilePhoto ? <img className="profile-menu-photo" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}<div><b>{user.fullName}</b><small>{user.email}</small></div></div>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/patient-portal'); }}><span className="profile-menu-icon"><AccountMenuIcon name="profile"/></span><span><b>Profile</b><small>View and edit your personal information and profile photo</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/forgot-password?email=' + encodeURIComponent(user.email)); }}><span className="profile-menu-icon"><AccountMenuIcon name="security"/></span><span><b>Security &amp; password</b><small>Change your password, update email, and manage account security</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); window.dispatchEvent(new Event('open-my-appointments')); }}><span className="profile-menu-icon"><AccountMenuIcon name="appointments"/></span><span><b>My appointments</b><small>View your booked visits and appointment details</small></span></button>
        {logoutError && <p className="profile-logout-error" role="alert">{logoutError}</p>}
        <button type="button" role="menuitem" className="profile-menu-logout" onClick={logout}><AccountMenuIcon name="logout"/>Log out</button>
      </div>}
    </header>

    {checking ? <div className="booking-card booking-loading">Checking your account…</div> : <section className="booking-shell">
      {success ? <div className="booking-confirmation"><div className="booking-success-mark">✓</div><span className="eyebrow">REQUEST RECEIVED</span><h1>Your visit request is in.</h1><p>Thanks, {user?.fullName?.split(' ')[0] || 'there'}. The clinic will confirm your appointment shortly.</p><div className="booking-success-summary"><b>{form.service}</b><span>{prettyDate(form.date)} · {chosenSlot?.label}</span></div><button className="site-button" type="button" onClick={() => navigate('/')}>Return to the website</button></div> : <>
        <BookingProgress step={step}/>
        <div className="booking-heading"><div><span className="eyebrow">BOOK A VISIT</span><h1>{step === 1 ? 'Book an appointment' : step === 2 ? 'Patient registration' : 'Review your appointment'}</h1><p>{step === 1 ? 'Choose a service, then select a date and time that works for you.' : step === 2 ? 'Review your saved patient details before continuing.' : 'Check that your appointment and patient details are correct.'}</p></div></div>

        {step === 1 && <form className="booking-wizard-form" onSubmit={event => { event.preventDefault(); continueFromAppointment(); }}>
          <div className="booking-main-column">
            <section className="booking-panel booking-procedure-panel"><div className="booking-section-heading"><span className="booking-step-number">1</span><div><h2>Choose a procedure</h2><p>Select a dental service or book a general consultation.</p></div></div><label className="booking-field">Appointment type<UserSelect required name="service" label="Appointment type" placeholder="Choose a procedure or consultation" value={form.service} options={[{ label: 'Appointment', options: ['Consultation'] }, ...dentalServiceCategories.map(category => ({ label: category.title, options: category.procedures }))]} onChange={service => setForm(current => ({ ...current, service }))}/></label></section>

            <section className="booking-panel booking-calendar-panel"><div className="booking-section-heading"><span className="booking-step-number">2</span><div><h2>Choose a date</h2><p>Appointments are available Monday through Saturday.</p></div></div><div className="booking-calendar-heading"><button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} disabled={visibleMonth <= today.slice(0, 7)}>‹</button><h3>{monthLabel(visibleMonth)}</h3><button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button></div>{availabilityError && <p className="booking-inline-error" role="alert">{availabilityError}</p>}<div className={`booking-calendar${loadingAvailability ? ' is-loading' : ''}`} aria-busy={loadingAvailability}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span className="booking-weekday" key={day}>{day}</span>)}{calendarCells.map((date, index) => { if (!date) return <span className="booking-calendar-blank" key={`blank-${index}`} aria-hidden="true"/>; const dayData = availability?.days?.find(day => day.date === date); const past = date < today; const unavailable = !dayData?.open || dayData.availableCount === 0; const disabled = past || !availability || loadingAvailability || unavailable; const selected = form.date === date; const isToday = date === today; return <button className={`booking-date${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${unavailable ? ' is-unavailable' : ''}`} type="button" key={date} disabled={disabled} aria-pressed={selected} aria-label={`${prettyDate(date)}${unavailable ? ', unavailable' : ''}`} onClick={() => selectDate(date)}>{Number(date.slice(-2))}</button>; })}</div><div className="booking-calendar-legend"><span><i className="is-legend-available"/> Available</span><span><i className="is-legend-selected"/> Selected</span><span><i className="is-legend-unavailable"/> Unavailable / closed</span></div></section>

            <section className="booking-panel booking-time-panel"><div className="booking-section-heading"><span className="booking-step-number">3</span><div><h2>Choose a time</h2><p>{form.date ? `Available times for ${prettyDate(form.date)}.` : 'Select a date to see available times.'}</p></div></div>{!form.date ? <div className="booking-time-empty"><CalendarIcon/><span>Choose an available date first.</span></div> : loadingAvailability ? <div className="booking-time-empty">Checking available times…</div> : slotGroups.length ? <div className="booking-slot-groups">{slotGroups.map(group => <div className="booking-slot-group" key={group.name}><h3>{group.name}</h3><div className="booking-slots">{group.slots.map(slot => <button type="button" key={slot.startsAt} className={`booking-time-slot${form.startsAt === slot.startsAt ? ' is-selected' : ''}`} disabled={!slot.available} aria-pressed={form.startsAt === slot.startsAt} onClick={() => { setForm(current => ({ ...current, startsAt: current.startsAt === slot.startsAt ? '' : slot.startsAt })); setError(''); }}>{slot.label}</button>)}</div></div>)}</div> : <div className="booking-time-empty">No time slots are available on this date. Please choose another date.</div>}<p className="booking-hours-note">Clinic hours: 9:00 AM–5:00 PM, Monday–Saturday. Last appointment starts at 4:00 PM.</p></section>

            <section className="booking-panel booking-notes-panel"><label className="booking-field">Anything you’d like us to know? <span>(optional)</span><textarea rows="3" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Share a concern or note for the clinic"/></label></section>
          </div>

          <section className="booking-summary-card booking-summary-inline"><div className="booking-summary-icon"><CalendarIcon/></div><div className="booking-summary-copy"><h2>Appointment summary</h2><p>Procedure: <b>{form.service || 'Not selected'}</b></p><p>Date: <b>{form.date ? prettyDate(form.date) : 'Not selected'}</b></p><p>Time: <b>{chosenSlot?.label || 'Not selected'}</b></p></div>{error && <p className="booking-error" role="alert">{error}</p>}<div className="booking-summary-actions"><button className="booking-reset" type="button" onClick={resetSelection}>Reset</button><button className="site-button booking-submit" type="submit">Next</button></div></section>
        </form>}

        {step === 2 && <section className="booking-panel booking-registration-review"><div className="booking-section-heading"><span className="booking-step-number">2</span><div><h2>Your registration details</h2><p>These details will be included with your appointment request.</p></div></div>{registration ? <><PatientRegistrationSummary registration={registration}/><div className="booking-wizard-actions booking-registration-actions"><button className="booking-reset" type="button" onClick={() => goStep(1)}>Back</button><button className="booking-reset" type="button" onClick={() => navigate('/patient-registration?next=' + encodeURIComponent('/book-appointment?step=2'))}>Edit registration</button><button className="site-button" type="button" onClick={() => goStep(3)}>Next</button></div></> : <div className="booking-registration-missing"><p>Patient registration is required before you can review and confirm this appointment.</p><button type="button" className="site-button" onClick={() => navigate('/patient-registration?next=' + encodeURIComponent('/book-appointment?step=2'))}>Complete registration</button><button type="button" className="booking-reset" onClick={() => goStep(1)}>Back to appointment</button></div>}</section>}

        {step === 3 && <form className="booking-review-form" onSubmit={submit}><section className="booking-panel booking-final-review"><div className="booking-section-heading"><span className="booking-step-number">3</span><div><h2>Appointment details</h2><p>Please make sure your date, procedure, and time are correct.</p></div></div><dl className="booking-final-grid"><div><dt>Procedure</dt><dd>{form.service || 'Not selected'}</dd></div><div><dt>Date</dt><dd>{form.date ? prettyDate(form.date) : 'Not selected'}</dd></div><div><dt>Time</dt><dd>{chosenSlot?.label || 'Not selected'}</dd></div><div><dt>Notes</dt><dd>{form.notes || 'None'}</dd></div></dl>{form.startsAt && chosenSlot && !chosenSlot.available && <p className="booking-inline-error" role="alert">This time is no longer available. Go back and choose another time.</p>}</section><section className="booking-panel booking-final-review"><div className="booking-section-heading"><span className="booking-step-number">✓</span><div><h2>Patient registration</h2><p>Information from your saved patient form.</p></div></div>{registration ? <PatientRegistrationSummary registration={registration}/> : <p className="booking-inline-error">Please complete patient registration before confirming.</p>}</section>{error && <p className="booking-error" role="alert">{error}</p>}<div className="booking-wizard-actions"><button className="booking-reset" type="button" onClick={() => goStep(2)}>Back</button><button className="site-button booking-submit" type="submit" disabled={busy || !form.service || !form.date || !chosenSlot?.available || !registration}>{busy ? 'Sending request…' : 'Confirm appointment'}</button></div></form>}
      </>}
    </section>}

    <footer className="public-footer"><span>© {new Date().getFullYear()} 3 Mary’s Smile Dental Clinic</span><button type="button" onClick={() => navigate('/')}>Browse the clinic website</button></footer>
  </main>;
}
