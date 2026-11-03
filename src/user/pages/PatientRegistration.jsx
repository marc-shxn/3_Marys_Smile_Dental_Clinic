import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../shared/services/authApi.js';
import { usePatientProfilePhoto } from '../../shared/hooks/usePatientProfilePhoto.js';
import UserSelect from '../components/UserSelect.jsx';
import { readPatientRegistration, savePatientRegistration } from '../../shared/services/patientLocalData.js';
import './public-site.css';
import './PatientRegistration.css';

function MenuIcon({ name, className = '' }) {
  const paths = {
    profile: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.6-3.2 2.8-5 6.5-5s5.9 1.8 6.5 5"/></>,
    security: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1"/><path d="M12 16v2"/></>,
    appointments: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3m2 0h3"/></>,
    logout: <><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"/><path d="M13 8l4 4-4 4M17 12H9"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const healthConditions = [
  'Heart Trouble', 'Asthma', 'Diabetes', 'Tuberculosis', 'Jaundice', 'Epilepsy',
  'High Blood Pressure', 'Rheumatic Fever', 'Psychiatric Conditions',
  'Congenital Heart Conditions', 'Anemia', 'Chronic Cough', 'Stroke', 'Hepatitis',
  'Arthritis', 'Cancer', 'Sinusitis', 'Heart Murmur', 'Blood Disease',
  'Kidney or Bladder Problems', 'Stomach Ulcer', 'Other'
];
const emptyPatient = { fullName: '', address: '', phone: '', age: '', sex: '', occupation: '', weight: '', height: '', birthday: '', civilStatus: '', referredBy: '', guardianName: '', guardianPhone: '' };
const ageFromBirthday = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const [year, month, day] = value.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age >= 0 && age <= 120 ? String(age) : '';
};

function YesNoQuestion({ number, id, question, answers, onAnswer, followUp, choices = ['Yes', 'No'] }) {
  const hasFollowUp = answers[id] === 'Yes' && followUp;
  return <div className="registration-question-item">
    <div className="registration-question-title" id={`registration-question-${id}`}><span>{number}.</span> {question}</div>
    <fieldset className="registration-answer-box" aria-labelledby={`registration-question-${id}`}>
      <legend className="registration-visually-hidden">{number}. {question}</legend>
      <div className="registration-options">{choices.map(choice => <label className="registration-choice" key={choice}>
        <input type="radio" name={id} value={choice} required checked={answers[id] === choice} onChange={() => onAnswer(id, choice)}/>
        <span>{choice}</span>
      </label>)}</div>
    </fieldset>
    {hasFollowUp && <label className="registration-follow-up">{followUp.label}
      {followUp.multiline ? <textarea rows="3" required={followUp.required !== false} value={answers[followUp.key] || ''} onChange={event => onAnswer(followUp.key, event.target.value)} placeholder={followUp.placeholder || 'Please provide details'}/> : <input type="text" required={followUp.required !== false} value={answers[followUp.key] || ''} onChange={event => onAnswer(followUp.key, event.target.value)} placeholder={followUp.placeholder || 'Please provide details'}/>}
    </label>}
  </div>;
}

export default function PatientRegistration({ navigate, route = '' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [profilePhoto] = usePatientProfilePhoto(currentUser);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [registrationError, setRegistrationError] = useState('');
  const [savingRegistration, setSavingRegistration] = useState(false);
  const headerRef = useRef(null);
  const [record, setRecord] = useState(null);
  const [mode, setMode] = useState('form');
  const [patient, setPatient] = useState(emptyPatient);
  const [answers, setAnswers] = useState({ conditions: [] });
  const [consent, setConsent] = useState(false);
  useEffect(() => {
    let alive = true;
    authApi.session().then(({ user }) => {
      if (!alive) return;
      setCurrentUser(user);
      const saved = readPatientRegistration(user);
      setRecord(saved);
      setMode(saved ? 'view' : 'form');
      setPatient(saved?.patient || { ...emptyPatient, fullName: user.fullName, phone: user.phone || '' });
      setAnswers(saved?.answers || { conditions: [] });
      setConsent(Boolean(saved?.consent));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnOutside = event => { if (!headerRef.current?.contains(event.target)) setProfileMenuOpen(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') setProfileMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [profileMenuOpen]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutside = event => {
      const panel = document.getElementById('mobile-nav');
      const toggle = headerRef.current?.querySelector('.menu-toggle');
      if (!panel?.contains(event.target) && !toggle?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [menuOpen]);
  const nextQuery = new URLSearchParams(route.split('?')[1] || '');
  const requestedNext = nextQuery.get('next');
  const nextPath = requestedNext?.startsWith('/book-appointment') ? requestedNext : '/book-appointment';
  const bookingFlow = requestedNext?.startsWith('/book-appointment?step=2');
  const updatePatient = event => {
    const { name, value } = event.target;
    setPatient(current => ({ ...current, [name]: value, ...(name === 'birthday' ? { age: ageFromBirthday(value) } : {}) }));
    if (name === 'sex' && value !== 'Female') setAnswers(current => ({ ...current, pregnant: '', pregnancyDetails: '' }));
  };
  const updateAnswer = (key, value) => setAnswers(current => ({ ...current, [key]: value }));
  const updateCondition = (condition, checked) => setAnswers(current => ({ ...current, conditions: checked ? [...(current.conditions || []), condition] : (current.conditions || []).filter(item => item !== condition) }));
  const submit = async event => {
    event.preventDefault();
    if (savingRegistration) return;
    setRegistrationError('');
    setSavingRegistration(true);
    const savedAnswers = patient.sex === 'Female' ? answers : { ...answers, pregnant: '', pregnancyDetails: '' };
    const registration = { patient, answers: savedAnswers, consent: true, submittedAt: new Date().toISOString() };
    try {
      await authApi.saveRegistration(registration);
      savePatientRegistration(currentUser, registration);
      setRecord(registration);
      setMode('view');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setRegistrationError(error.message || 'Your registration could not be saved. Please try again.');
    } finally {
      setSavingRegistration(false);
    }
  };
  const accountNameParts = currentUser?.fullName?.trim().split(/\s+/) || [];
  const accountInitials = accountNameParts.length > 1 ? (accountNameParts[0][0] + accountNameParts[accountNameParts.length - 1][0]).toUpperCase() : accountNameParts[0]?.[0]?.toUpperCase() || 'P';
  const goHomeSection = id => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
    navigate('/');
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const logIn = () => { setMenuOpen(false); navigate(currentUser ? '/patient-portal' : '/patient-login'); };
  const openProfileMenu = () => { setMenuOpen(false); setProfileMenuOpen(open => !open); };
  const logout = async () => {
    setLogoutError('');
    try { await authApi.logout(); setCurrentUser(null); setProfileMenuOpen(false); navigate('/'); }
    catch (error) { setLogoutError(error.message || 'Could not log out. Please try again.'); }
  };
  const book = () => {
    setMenuOpen(false);
    navigate('/book-appointment');
  };

  return <main className="public-site patient-registration-page">
    <header className="public-nav registration-nav" ref={headerRef}>
      <a href="/" className="public-logo" onClick={event => { event.preventDefault(); navigate('/'); }}><img src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo"/><span className="public-brand-name"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></a>
      <nav aria-label="Main navigation"><button type="button" onClick={() => goHomeSection('home')}>Home</button><button type="button" onClick={() => goHomeSection('services')}>Services</button><button type="button" onClick={() => goHomeSection('about')}>About us</button><button type="button" onClick={() => goHomeSection('contact')}>Contact</button></nav>
      <div className="nav-actions">{currentUser ? <><button type="button" className="site-button small" onClick={book}>Book an appointment</button><button type="button" className="profile-nav" onClick={openProfileMenu} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img className="profile-photo-image" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}</button></> : <><button type="button" className="nav-login" onClick={logIn}>Log in</button><button type="button" className="site-button small" onClick={book}>Book an appointment</button></>}</div>
      <button type="button" className={`menu-toggle${menuOpen ? ' is-open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => { setProfileMenuOpen(false); setMenuOpen(open => !open); }}><span/><span/><span/></button>
      {menuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}/>}
      <div className={`mobile-nav-panel${menuOpen ? ' is-open' : ''}`} id="mobile-nav" aria-hidden={!menuOpen} inert={!menuOpen}>
        <button type="button" onClick={() => goHomeSection('home')}>Home</button><button type="button" onClick={() => goHomeSection('services')}>Services</button><button type="button" onClick={() => goHomeSection('about')}>About us</button><button type="button" onClick={() => goHomeSection('contact')}>Contact</button>
        <div className="mobile-nav-actions">{currentUser ? <button type="button" className="profile-nav" onClick={openProfileMenu} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img className="profile-photo-image" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}<span>Account</span></button> : <button type="button" className="nav-login" onClick={logIn}>Log in</button>}</div>
      </div>
      {currentUser && profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Account menu">
        <div className="profile-menu-heading">{profilePhoto ? <img className="profile-menu-photo" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}<div><b>{currentUser.fullName}</b><small>{currentUser.email}</small></div></div>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/patient-portal'); }}><span className="profile-menu-icon"><MenuIcon name="profile"/></span><span><b>Profile</b><small>View and edit your personal information and profile photo</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/forgot-password?email=' + encodeURIComponent(currentUser.email)); }}><span className="profile-menu-icon"><MenuIcon name="security"/></span><span><b>Security &amp; password</b><small>Change your password, update email, and manage account security</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); window.dispatchEvent(new Event('open-my-appointments')); }}><span className="profile-menu-icon"><MenuIcon name="appointments"/></span><span><b>My appointments</b><small>View your booked visits and appointment details</small></span></button>
        {logoutError && <p className="profile-logout-error" role="alert">{logoutError}</p>}
        <button type="button" role="menuitem" className="profile-menu-logout" onClick={logout}><MenuIcon name="logout"/>Log out</button>
      </div>}
    </header>
    {bookingFlow && <div className="booking-flow-progress" aria-label="Booking progress"><span>Step 2 of 3</span><div className="booking-flow-progress-track"><i style={{ width: '66.67%' }}/></div><ol><li>Appointment</li><li className="is-current">Registration</li><li>Review</li></ol></div>}
    <div className="registration-wrap">
      {mode === 'view' && record ? <section className="registration-confirmation registration-record" role="region" aria-labelledby="saved-registration-heading">
        <div className="registration-success-icon" aria-hidden="true">✓</div>
        <span className="eyebrow">REGISTRATION SAVED</span>
        <h1 id="saved-registration-heading">Patient Registration</h1>
        <div className="registration-record-date">Last saved {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.submittedAt))}</div>
        <section className="registration-record-section"><h2>Patient Information</h2><dl className="registration-record-grid">
          {[
            ['Full Name', record.patient.fullName], ['Complete Address', record.patient.address], ['Phone / Mobile Number', record.patient.phone],
            ['Age', record.patient.age], ['Sex', record.patient.sex], ['Occupation', record.patient.occupation], ['Weight (kg)', record.patient.weight],
            ['Height (cm)', record.patient.height], ['Birthday', record.patient.birthday], ['Civil Status', record.patient.civilStatus],
            ['Referred By', record.patient.referredBy], ['Patient / Guardian Name', record.patient.guardianName], ['Guardian Contact Number', record.patient.guardianPhone]
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div>)}
        </dl></section>
        <section className="registration-record-section"><h2>Medical History</h2><dl className="registration-record-grid">
          {[
            ['Hospitalized during the past 2 years', 'hospitalized'], ['Under a physician’s care during the past 2 years', 'physicianCare'],
            ['Taken medications during the past 2 years', 'medications'], ['Known drug or medicine allergies', 'allergies'],
            ['Excessive bleeding requiring treatment', 'bleeding'], ...(record.patient.sex === 'Female' ? [['Currently pregnant', 'pregnant']] : []),
            ['Other serious illnesses', 'seriousIllness'], ['Sores, lumps, or unusual growths in the mouth', 'mouthGrowths']
          ].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{record.answers[key] || 'Not answered'}</dd></div>)}
          <div className="registration-record-grid-wide"><dt>Diagnosed conditions</dt><dd>{record.answers.conditions?.length ? record.answers.conditions.join(', ') : 'None selected'}</dd></div>
          {[
            ['Hospitalization details', 'hospitalizedDetails'], ['Physician care details', 'physicianDetails'], ['Medication details', 'medicationDetails'],
            ['Allergy details', 'allergyDetails'], ['Bleeding details', 'bleedingDetails'], ['Other condition', 'otherCondition'],
            ['Pregnancy details', 'pregnancyDetails'], ['Serious illness details', 'seriousIllnessDetails'], ['Mouth concern details', 'mouthGrowthDetails']
          ].filter(([, key]) => record.answers[key] && (key !== 'pregnancyDetails' || record.patient.sex === 'Female')).map(([label, key]) => <div className="registration-record-grid-wide" key={key}><dt>{label}</dt><dd>{record.answers[key]}</dd></div>)}
        </dl><p className="registration-record-consent">Consent confirmed for confidential handling of information for dental care purposes.</p></section>
        <div className="registration-record-actions">{bookingFlow && <button type="button" className="registration-edit-button" onClick={() => navigate('/book-appointment?step=2')}>Back to booking</button>}<button type="button" className="registration-edit-button" onClick={() => setMode('form')}>Edit Registration</button>{bookingFlow && <button type="button" className="site-button" onClick={() => navigate('/book-appointment?step=3')}>Next</button>}{requestedNext?.startsWith('/book-appointment') && !bookingFlow && <button type="button" className="site-button" onClick={() => navigate(nextPath)}>Continue to appointment</button>}</div>
      </section> : <>
        <div className="registration-heading">
          <span className="eyebrow"><i/> 3 MARY’S SMILE DENTAL CLINIC</span>
          <h1>Patient Registration</h1>
          <p>Please complete this form before scheduling an appointment.</p>
          <div className="registration-required-note"><span aria-hidden="true">*</span> Required fields · Your information is handled confidentially for dental care purposes.</div>
        </div>
        {record && <div className="registration-edit-notice">A registration is already saved in this browser. <button type="button" onClick={() => setMode('view')}>View saved registration</button></div>}
        {registrationError && <p className="registration-submit-error" role="alert">{registrationError}</p>}
        <form className="registration-form" onSubmit={submit}>
          <section className="registration-section-card" aria-labelledby="patient-info-heading">
            <header className="registration-section-heading"><span>SECTION 1</span><h2 id="patient-info-heading">Patient Information</h2></header>
            <div className="registration-fields">
              <label className="registration-field registration-field-wide">Full Name <span>*</span><input name="fullName" autoComplete="name" value={patient.fullName} onChange={updatePatient} required placeholder="Enter your full name"/></label>
              <label className="registration-field registration-field-wide">Complete Address <span>*</span><textarea name="address" autoComplete="street-address" rows="2" value={patient.address} onChange={updatePatient} required placeholder="House number, street, barangay, city, and province"/></label>
              <label className="registration-field">Phone / Mobile Number <span>*</span><input name="phone" type="tel" autoComplete="tel" value={patient.phone} onChange={updatePatient} required placeholder="e.g. 09XX XXX XXXX"/></label>
              <label className="registration-field">Age <span>*</span><input name="age" type="number" min="1" max="120" value={patient.age} onChange={updatePatient} required placeholder="Age"/></label>
              <label className="registration-field">Sex <span>*</span><UserSelect required name="sex" label="Sex" placeholder="Select sex" value={patient.sex} options={['Male', 'Female']} onChange={value => updatePatient({ target: { name: 'sex', value } })}/></label>
              <label className="registration-field">Occupation <span>*</span><input name="occupation" autoComplete="organization-title" value={patient.occupation} onChange={updatePatient} required placeholder="Your occupation"/></label>
              <label className="registration-field">Weight (kg) <small>Optional</small><input name="weight" type="number" min="1" max="500" step="0.1" value={patient.weight} onChange={updatePatient} placeholder="e.g. 60"/></label>
              <label className="registration-field">Height (cm) <small>Optional</small><input name="height" type="number" min="30" max="250" step="0.1" value={patient.height} onChange={updatePatient} placeholder="e.g. 165"/></label>
              <label className="registration-field">Birthday <span>*</span><input name="birthday" type="date" autoComplete="bday" value={patient.birthday} onChange={updatePatient} required/></label>
              <label className="registration-field">Civil Status <span>*</span><UserSelect required name="civilStatus" label="Civil Status" placeholder="Select civil status" value={patient.civilStatus} options={['Single', 'Married', 'Widowed', 'Separated']} onChange={value => updatePatient({ target: { name: 'civilStatus', value } })}/></label>
              <label className="registration-field registration-field-wide">Referred By <small>Optional</small><input name="referredBy" value={patient.referredBy} onChange={updatePatient} placeholder="Person or clinic that referred you"/></label>
            </div>
          </section>

          <section className="registration-section-card" aria-labelledby="medical-history-heading">
            <header className="registration-section-heading"><span>SECTION 2</span><h2 id="medical-history-heading">Medical History</h2><p>Please answer each question so we can provide safe, informed care.</p></header>
            <div className="registration-question-list">
              <YesNoQuestion number="1" id="hospitalized" question="Have you been hospitalized during the past 2 years?" answers={answers} onAnswer={updateAnswer} followUp={{ key: 'hospitalizedDetails', label: 'Please share the reason and approximate date.', multiline: true }}/>
              <YesNoQuestion number="2" id="physicianCare" question="Have you been under a physician’s care during the past 2 years?" answers={answers} onAnswer={updateAnswer} followUp={{ key: 'physicianDetails', label: 'Please tell us the reason for your care and the physician’s name, if known.', multiline: true }}/>
              <YesNoQuestion number="3" id="medications" question="Have you taken any medications during the past 2 years?" answers={answers} onAnswer={updateAnswer} followUp={{ key: 'medicationDetails', label: 'Please list the medications and what they were for.', multiline: true }}/>
              <YesNoQuestion number="4" id="allergies" question="Do you have any known allergies to penicillin, drugs, or medicines?" answers={answers} onAnswer={updateAnswer} followUp={{ key: 'allergyDetails', label: 'Please specify the allergy and any reaction.' }}/>
              <YesNoQuestion number="5" id="bleeding" question="Have you experienced excessive bleeding requiring special treatment?" answers={answers} onAnswer={updateAnswer} followUp={{ key: 'bleedingDetails', label: 'Please describe the bleeding and treatment received.', multiline: true }}/>
              <div className="registration-question-item">
                <div className="registration-question-title" id="registration-question-conditions"><span>6.</span> Have you ever had or been diagnosed with any of the following conditions?</div>
                <fieldset className="registration-answer-box" aria-labelledby="registration-question-conditions">
                  <legend className="registration-visually-hidden">6. Have you ever had or been diagnosed with any of the following conditions?</legend>
                  <div className="registration-condition-grid">{healthConditions.map(condition => <label className="registration-check-choice" key={condition}><input type="checkbox" name="conditions" checked={answers.conditions.includes(condition)} onChange={event => updateCondition(condition, event.target.checked)}/><span>{condition}</span></label>)}</div>
                  {answers.conditions.includes('Other') && <label className="registration-follow-up">Please specify other condition <input type="text" required value={answers.otherCondition || ''} onChange={event => updateAnswer('otherCondition', event.target.value)} placeholder="Describe the condition"/></label>}
                </fieldset>
              </div>
              {patient.sex === 'Female' && <YesNoQuestion number="7" id="pregnant" question="Are you currently pregnant?" answers={answers} onAnswer={updateAnswer} choices={['Yes', 'No']} followUp={{ key: 'pregnancyDetails', label: 'Optional: share any pregnancy-related information for your dentist.', multiline: true, required: false }}/>}
              <YesNoQuestion number={patient.sex === 'Female' ? '8' : '7'} id="seriousIllness" question="Do you have any other serious illnesses?" answers={answers} onAnswer={updateAnswer} followUp={{ key: 'seriousIllnessDetails', label: 'Please describe the illness.', multiline: true }}/>
              <YesNoQuestion number={patient.sex === 'Female' ? '9' : '8'} id="mouthGrowths" question="Do you currently have any sores, lumps, or unusual growths in your mouth?" answers={answers} onAnswer={updateAnswer} followUp={{ key: 'mouthGrowthDetails', label: 'Please describe where it is and how long you have noticed it.', multiline: true}}/>
            </div>
          </section>

          <section className="registration-section-card registration-consent-section" aria-labelledby="consent-heading">
            <header className="registration-section-heading"><span>FINAL SECTION</span><h2 id="consent-heading">Guardian Information &amp; Confirmation</h2><p>Provide a contact person and confirm your information before submitting.</p></header>
            <div className="registration-fields registration-guardian-fields">
              <label className="registration-field">Patient / Guardian Name <span>*</span><input name="guardianName" value={patient.guardianName} onChange={updatePatient} required placeholder="Type the patient or guardian’s full name"/></label>
              <label className="registration-field">Guardian Contact Number <span>*</span><input name="guardianPhone" type="tel" inputMode="numeric" autoComplete="tel" value={patient.guardianPhone || ''} onChange={event => setPatient(current => ({ ...current, guardianPhone: event.target.value.replace(/\D/g, '').slice(0, 15) }))} required minLength="10" maxLength="15" pattern="[0-9]{10,15}" title="Enter 10 to 15 digits" placeholder="e.g. 09XXXXXXXXX"/></label>
            </div>
            <label className="registration-consent-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required/><span>I confirm that the information I provided is accurate to the best of my knowledge. <b>*</b></span></label>
          </section>
          <div className="registration-submit-row"><p>Registration must be completed before appointment scheduling.</p><button type="submit" className="site-button" disabled={savingRegistration}>{savingRegistration ? 'Saving registration…' : 'Submit Registration'}</button></div>
        </form>
      </>}
    </div>
    <footer className="public-footer registration-footer"><span>© {new Date().getFullYear()} 3 Mary’s Smile Dental Clinic</span><span>Patient information is for dental care purposes.</span></footer>
  </main>;
}
