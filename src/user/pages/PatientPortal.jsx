import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../shared/services/authApi.js';
import { announcePatientProfilePhotoChange, patientProfilePhotoKey, usePatientProfilePhoto } from '../../shared/hooks/usePatientProfilePhoto.js';
import UserSelect from '../components/UserSelect.jsx';
import { readPatientRegistration, savePatientRegistration } from '../../shared/services/patientLocalData.js';
import './public-site.css';
import './PatientPortal.css';

const healthConditions = [
  'Heart Trouble', 'Asthma', 'Diabetes', 'Tuberculosis', 'Jaundice', 'Epilepsy', 'High Blood Pressure',
  'Rheumatic Fever', 'Psychiatric Conditions', 'Congenital Heart Conditions', 'Anemia', 'Chronic Cough',
  'Stroke', 'Hepatitis', 'Arthritis', 'Cancer', 'Sinusitis', 'Heart Murmur', 'Blood Disease',
  'Kidney or Bladder Problems', 'Stomach Ulcer', 'Other',
];
const yesNoQuestions = [
  ['hospitalized', 'Have you been hospitalized during the past 2 years?'],
  ['physicianCare', 'Have you been under a physician’s care during the past 2 years?'],
  ['medications', 'Have you taken any medications during the past 2 years?'],
  ['allergies', 'Do you have known allergies to penicillin, drugs, or medicines?'],
  ['bleeding', 'Have you experienced excessive bleeding requiring special treatment?'],
  ['pregnant', 'Are you currently pregnant?'],
  ['seriousIllness', 'Do you have any other serious illnesses?'],
  ['mouthGrowths', 'Do you have sores, lumps, or unusual growths in your mouth?'],
];
const questionDetails = [
  ['hospitalizedDetails', 'Hospitalization details'], ['physicianDetails', 'Physician care details'],
  ['medicationDetails', 'Medication details'], ['allergyDetails', 'Allergy details'], ['bleedingDetails', 'Bleeding details'],
  ['otherCondition', 'Other condition'], ['pregnancyDetails', 'Pregnancy details'],
  ['seriousIllnessDetails', 'Serious illness details'], ['mouthGrowthDetails', 'Mouth concern details'],
];
const blankRegistration = () => ({
  patient: { fullName: '', address: '', phone: '', age: '', sex: '', occupation: '', weight: '', height: '', birthday: '', civilStatus: '', referredBy: '', guardianName: '', guardianPhone: '' },
  answers: { conditions: [] }, consent: false,
});
const display = value => value !== undefined && value !== null && value !== '' ? value : 'Not provided';
const initials = name => name?.trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase() || 'P';
const ageFromBirthday = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '';
  const [year, month, day] = value.split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age >= 0 && age <= 120 ? String(age) : '';
};

function ProfileIcon({ photo, name, onClick, inputRef, onPhotoChange }) {
  return <div className="portal-avatar-wrap">
    <button className="portal-avatar" type="button" onClick={onClick} aria-label="Upload or change profile photo" title="Upload or change profile photo">
      {photo ? <img src={photo} alt="Profile"/> : <span>{initials(name)}</span>}
    </button>
    <input ref={inputRef} className="portal-photo-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a profile photo" onChange={event => { onPhotoChange(event.target.files?.[0]); event.target.value = ''; }}/>
  </div>;
}

function ProfilePhotoCrop({ source, onCancel, onConfirm }) {
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const dragRef = useRef(null);
  const cancelRef = useRef(null);
  const [imageSize, setImageSize] = useState(null);
  const [viewportSize, setViewportSize] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const onCancelRef = useRef(onCancel);

  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const updateSize = () => setViewportSize(viewport.clientWidth);
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();
    const onKeyDown = event => { if (event.key === 'Escape') onCancelRef.current(); };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const fittedScale = imageSize && viewportSize
    ? Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height) * zoom
    : 0;
  const imageWidth = imageSize ? imageSize.width * fittedScale : 0;
  const imageHeight = imageSize ? imageSize.height * fittedScale : 0;
  const clampOffset = (next, width = imageWidth, height = imageHeight) => ({
    x: Math.min(Math.max(next.x, -(width - viewportSize) / 2), (width - viewportSize) / 2),
    y: Math.min(Math.max(next.y, -(height - viewportSize) / 2), (height - viewportSize) / 2),
  });

  const handleImageLoad = event => {
    const image = event.currentTarget;
    setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
    setViewportSize(viewportRef.current?.clientWidth || 280);
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  };

  const updateZoom = value => {
    const nextZoom = Number(value);
    const nextScale = imageSize && viewportSize
      ? Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height) * nextZoom
      : 0;
    setZoom(nextZoom);
    setOffset(current => clampOffset(current,
      imageSize ? imageSize.width * nextScale : 0,
      imageSize ? imageSize.height * nextScale : 0));
  };

  const handlePointerDown = event => {
    if (!imageSize) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
  };
  const handlePointerMove = event => {
    if (!dragRef.current) return;
    setOffset(clampOffset({
      x: dragRef.current.offsetX + event.clientX - dragRef.current.x,
      y: dragRef.current.offsetY + event.clientY - dragRef.current.y,
    }));
  };
  const stopDragging = () => { dragRef.current = null; };

  const confirmCrop = () => {
    const image = imageRef.current;
    if (!image || !imageSize || !viewportSize) return;
    try {
      const scale = Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height) * zoom;
      const cropLength = viewportSize / scale;
      const cropX = Math.min(Math.max((viewportSize / 2 - offset.x) / scale - cropLength / 2, 0), imageSize.width - cropLength);
      const cropY = Math.min(Math.max((viewportSize / 2 - offset.y) / scale - cropLength / 2, 0), imageSize.height - cropLength);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image editing is unavailable in this browser.');
      context.drawImage(image, cropX, cropY, cropLength, cropLength, 0, 0, canvas.width, canvas.height);
      if (onConfirm(canvas.toDataURL('image/jpeg', 0.9))) onCancelRef.current();
    } catch (cropError) {
      setError(cropError.message || 'The photo could not be cropped. Please try another image.');
    }
  };

  return <div className="portal-photo-crop-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="portal-photo-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="portal-photo-crop-title">
      <header className="portal-photo-crop-heading"><div><h2 id="portal-photo-crop-title">Adjust profile photo</h2><p>Drag to position the photo, then zoom in or out.</p></div><button ref={cancelRef} type="button" className="portal-photo-crop-close" onClick={onCancel} aria-label="Cancel photo crop">×</button></header>
      <div className="portal-photo-crop-content">
        <div
          className="portal-photo-crop-viewport"
          ref={viewportRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          role="img"
          aria-label="Profile photo crop preview; drag to reposition"
        >
          <img
            ref={imageRef}
            src={source}
            alt=""
            draggable="false"
            onLoad={handleImageLoad}
            onError={() => setError('This photo could not be opened. Please choose a different image.')}
            style={{ width: imageWidth || 'auto', height: imageHeight || 'auto', left: `calc(50% + ${offset.x}px)`, top: `calc(50% + ${offset.y}px)` }}
          />
          {!imageSize && !error && <span className="portal-photo-crop-loading">Preparing photo…</span>}
        </div>
        <label className="portal-photo-zoom">Zoom <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => updateZoom(event.target.value)} aria-label="Zoom profile photo" disabled={!imageSize}/><span>{Math.round(zoom * 100)}%</span></label>
        <p className="portal-photo-crop-tip">The circle shows how your photo will appear across your account.</p>
        {error && <p className="portal-photo-crop-error" role="alert">{error}</p>}
      </div>
      <footer className="portal-photo-crop-actions"><button type="button" className="portal-cancel-button" onClick={onCancel}>Cancel</button><button type="button" className="site-button" onClick={confirmCrop} disabled={!imageSize || Boolean(error)}>Confirm photo</button></footer>
    </section>
  </div>;
}

function ProfileActionIcon({ name }) {
  const icon = name === 'upload' ? <><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></>
    : name === 'file' ? <><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h5M9 13h6M9 17h6"/></>
    : name === 'person' ? <><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-3.2 3-5 7-5s6.3 1.8 7 5"/></>
    : <><path d="m14 5 5 5M4 20l4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/></>;
  return <svg className="portal-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>;
}

function RegistrationReadOnly({ registration, user, section = 'all' }) {
  const patient = registration.patient || {};
  const answers = registration.answers || {};
  const fields = [
    ['Full name', user?.fullName || patient.fullName], ['Email address', user?.email], ['Phone / mobile number', user?.phone || patient.phone], ['Complete address', patient.address],
    ['Age', patient.age], ['Sex', patient.sex], ['Occupation', patient.occupation], ['Weight (kg)', patient.weight],
    ['Height (cm)', patient.height], ['Birthday', patient.birthday], ['Civil status', patient.civilStatus],
    ['Referred by', patient.referredBy], ['Patient / guardian name', patient.guardianName], ['Guardian contact number', patient.guardianPhone],
  ];
  return <>
    {section !== 'medical' && <>
    <dl className="portal-registration-grid portal-personal-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{display(value)}</dd></div>)}</dl>
    </>}
    {section !== 'personal' && <>
    <dl className="portal-registration-grid portal-medical-grid">
      {yesNoQuestions.filter(([key]) => key !== 'pregnant' || patient.sex === 'Female').map(([key, question]) => <div key={key}><dt>{question}</dt><dd>{display(answers[key])}</dd></div>)}
      <div className="portal-registration-wide"><dt>Diagnosed conditions</dt><dd>{answers.conditions?.length ? answers.conditions.join(', ') : 'None selected'}</dd></div>
      {questionDetails.filter(([key]) => answers[key] && (key !== 'pregnancyDetails' || patient.sex === 'Female')).map(([key, label]) => <div className="portal-registration-wide" key={key}><dt>{label}</dt><dd>{answers[key]}</dd></div>)}
    </dl>
    </>}
  </>;
}

function RegistrationEditor({ value, onChange, section = 'all' }) {
  const patient = value.patient || {};
  const answers = value.answers || { conditions: [] };
  const setAnswer = (key, nextValue) => onChange(current => ({ ...current, answers: { ...current.answers, [key]: nextValue } }));
  const setPatient = (key, nextValue) => {
    onChange(current => ({ ...current, patient: { ...current.patient, [key]: nextValue, ...(key === 'birthday' ? { age: ageFromBirthday(nextValue) } : {}) } }));
    if (key === 'sex' && nextValue !== 'Female') {
      setAnswer('pregnant', '');
      setAnswer('pregnancyDetails', '');
    }
  };
  const toggleCondition = (condition, checked) => setAnswer('conditions', checked ? [...(answers.conditions || []), condition] : (answers.conditions || []).filter(item => item !== condition));
  const textField = (key, label, props = {}) => <label className="portal-edit-field" key={key}>{label}<input value={patient[key] || ''} onChange={event => setPatient(key, props.numeric ? event.target.value.replace(/\D/g, '').slice(0, 15) : event.target.value)} {...props.input}/></label>;
  return <div className="portal-registration-editor">
    {section !== 'medical' && <>
    <div className="portal-editor-grid">
      <label className="portal-edit-field portal-edit-wide">Complete address<textarea rows="2" required value={patient.address || ''} onChange={event => setPatient('address', event.target.value)}/></label>
      {textField('age', 'Age', { input: { type: 'number', min: 1, max: 120, placeholder: 'Age' } })}
      <label className="portal-edit-field">Sex<UserSelect label="Sex" placeholder="Select sex" value={patient.sex || ''} options={['Male', 'Female']} onChange={value => setPatient('sex', value)}/></label>
      {textField('occupation', 'Occupation')}
      {textField('weight', 'Weight (kg)', { input: { type: 'number', min: 1, max: 500, step: '0.1' } })}
      {textField('height', 'Height (cm)', { input: { type: 'number', min: 30, max: 250, step: '0.1' } })}
      {textField('birthday', 'Birthday', { input: { type: 'date' } })}
      <label className="portal-edit-field">Civil status<UserSelect label="Civil status" placeholder="Select civil status" value={patient.civilStatus || ''} options={['Single', 'Married', 'Widowed', 'Separated']} onChange={value => setPatient('civilStatus', value)}/></label>
      {textField('referredBy', 'Referred by')}
      {textField('guardianName', 'Patient / guardian name')}
      {textField('guardianPhone', 'Guardian contact number', { numeric: true, input: { type: 'tel', inputMode: 'numeric' } })}
    </div>
    </>}
    {section !== 'personal' && <>
    <div className="portal-medical-editor">
      {yesNoQuestions.filter(([key]) => key !== 'pregnant' || patient.sex === 'Female').map(([key, question]) => <label className="portal-edit-field" key={key}>{question}<UserSelect label={question} placeholder="Choose an answer" value={answers[key] || ''} options={['Yes', 'No']} onChange={value => setAnswer(key, value)}/></label>)}
      <fieldset className="portal-condition-field"><legend>Diagnosed conditions</legend><div className="portal-condition-grid">{healthConditions.map(condition => <label key={condition}><input type="checkbox" checked={(answers.conditions || []).includes(condition)} onChange={event => toggleCondition(condition, event.target.checked)}/><span>{condition}</span></label>)}</div></fieldset>
      {questionDetails.filter(([key]) => key !== 'otherCondition' || (answers.conditions || []).includes('Other')).map(([key, label]) => {
        const questionKey = key === 'hospitalizedDetails' ? 'hospitalized' : key === 'physicianDetails' ? 'physicianCare' : key === 'medicationDetails' ? 'medications' : key === 'allergyDetails' ? 'allergies' : key === 'bleedingDetails' ? 'bleeding' : key === 'pregnancyDetails' ? 'pregnant' : key === 'seriousIllnessDetails' ? 'seriousIllness' : key === 'mouthGrowthDetails' ? 'mouthGrowths' : null;
        const visible = key === 'otherCondition' ? (answers.conditions || []).includes('Other') : key === 'pregnancyDetails' && patient.sex !== 'Female' ? false : answers[questionKey] === 'Yes';
        if (!visible) return null;
        return <label className="portal-edit-field portal-edit-wide" key={key}>{label}<textarea rows="2" value={answers[key] || ''} onChange={event => setAnswer(key, event.target.value)}/></label>;
      })}
    </div>
    </>}
  </div>;
}

function MenuIcon({ name }) {
  const paths = {
    account: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.6-3.2 2.8-5 6.5-5s5.9 1.8 6.5 5"/></>,
    security: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    appointments: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3m2 0h3"/></>,
    logout: <><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"/><path d="M13 8l4 4-4 4M17 12H9"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function PatientPortal({ navigate }) {
  const [user, setUser] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [registrationDraft, setRegistrationDraft] = useState(blankRegistration);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingMedicalHistory, setEditingMedicalHistory] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ fullName: '', email: '', phone: '' });
  const [profilePhoto, setProfilePhoto] = usePatientProfilePhoto(user);
  const [cropFile, setCropFile] = useState(null);
  const [cropSource, setCropSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const photoInputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    authApi.session().then(({ user: activeUser }) => {
      if (!alive) return;
      setUser(activeUser);
      const savedRegistration = readPatientRegistration(activeUser);
      setRegistration(savedRegistration);
      setRegistrationDraft(savedRegistration || blankRegistration());
      setAccountDraft({ fullName: activeUser.fullName, email: activeUser.email, phone: activeUser.phone || '' });
    }).catch(() => { if (alive) navigate('/patient-login'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [navigate]);

  useEffect(() => {
    if (!menuOpen && !profileMenuOpen) return undefined;
    const closeOnOutside = event => {
      const panel = document.getElementById('mobile-nav');
      const toggle = headerRef.current?.querySelector('.menu-toggle');
      if (menuOpen && !panel?.contains(event.target) && !toggle?.contains(event.target)) setMenuOpen(false);
      if (profileMenuOpen && !headerRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') { setMenuOpen(false); setProfileMenuOpen(false); } };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [menuOpen, profileMenuOpen]);

  const goHomeSection = id => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
    navigate('/');
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };
  const openProfileMenu = () => { setMenuOpen(false); setProfileMenuOpen(open => !open); };
  const logOut = async () => {
    setError('');
    try { await authApi.logout(); navigate('/'); }
    catch (err) { setError(err.message || 'You could not be signed out. Please try again.'); }
  };
  const uploadPhoto = file => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WEBP profile photo.'); return; }
    if (file.size > 3 * 1024 * 1024) { setError('Choose a profile photo that is 3 MB or smaller.'); return; }
    setError('');
    setNotice('');
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource(URL.createObjectURL(file));
    setCropFile(file);
  };
  const cancelPhotoCrop = () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
    setCropSource('');
    setCropFile(null);
  };
  const saveCroppedPhoto = photo => {
    try {
      localStorage.setItem(patientProfilePhotoKey(user), photo);
      setProfilePhoto(photo);
      announcePatientProfilePhotoChange(photo, user?.id);
      setError('');
      setNotice('Profile photo updated.');
      if (cropSource) URL.revokeObjectURL(cropSource);
      setCropSource('');
      setCropFile(null);
      return true;
    } catch {
      setError('The profile photo could not be saved in this browser. Choose a smaller image.');
      return false;
    }
  };
  const saveProfile = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user: updatedUser, verificationRequired } = await authApi.updateProfile(accountDraft);
      if (verificationRequired) {
        navigate('/verify-email?email=' + encodeURIComponent(updatedUser.email));
        return;
      }
      if (registration) {
        const saved = { ...registrationDraft, patient: { ...registrationDraft.patient, fullName: updatedUser.fullName, phone: updatedUser.phone || '' }, submittedAt: registration.submittedAt || new Date().toISOString() };
        await authApi.saveRegistration(saved);
        savePatientRegistration(updatedUser, saved);
        setRegistration(saved);
        setRegistrationDraft(saved);
      }
      setUser(updatedUser);
      setAccountDraft({ fullName: updatedUser.fullName, email: updatedUser.email, phone: updatedUser.phone || '' });
      setEditingProfile(false);
      setNotice('Profile information saved.');
    } catch (err) { setError(err.message || 'Account information could not be saved.'); }
    finally { setBusy(false); }
  };
  const saveMedicalHistory = async event => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const saved = { ...registrationDraft, submittedAt: registration?.submittedAt || new Date().toISOString() };
    try {
      await authApi.saveRegistration(saved);
      savePatientRegistration(user, saved);
      setRegistration(saved);
      setEditingMedicalHistory(false);
      setNotice('Registration information saved.');
    } catch (err) { setError(err.message || 'Registration information could not be saved.'); }
    finally { setBusy(false); }
  };
  const cancelRegistration = () => {
    setRegistrationDraft(registration || blankRegistration());
    setEditingMedicalHistory(false);
    setEditingProfile(false);
    setError('');
  };

  if (loading || !user) return <main className="public-site portal-page"><div className="portal-loading">Loading your profile…</div></main>;
  const accountInitials = initials(user.fullName);

  return <main className="public-site portal-page">
    <header className="public-nav portal-nav" ref={headerRef}>
      <a href="/" className="public-logo" onClick={event => { event.preventDefault(); navigate('/'); }}><img src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo"/><span className="public-brand-name"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></a>
      <nav aria-label="Main navigation"><button type="button" onClick={() => goHomeSection('home')}>Home</button><button type="button" onClick={() => goHomeSection('services')}>Services</button><button type="button" onClick={() => goHomeSection('about')}>About us</button><button type="button" onClick={() => goHomeSection('contact')}>Contact</button></nav>
      <div className="nav-actions"><button type="button" className="site-button small" onClick={() => navigate('/book-appointment')}>Book an appointment</button><button type="button" className="profile-nav" onClick={openProfileMenu} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}</button></div>
      <button type="button" className={`menu-toggle${menuOpen ? ' is-open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => { setProfileMenuOpen(false); setMenuOpen(open => !open); }}><span/><span/><span/></button>
      {menuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}/>}
      <div className={`mobile-nav-panel${menuOpen ? ' is-open' : ''}`} id="mobile-nav" aria-hidden={!menuOpen} inert={!menuOpen}>
        <button type="button" onClick={() => goHomeSection('home')}>Home</button><button type="button" onClick={() => goHomeSection('services')}>Services</button><button type="button" onClick={() => goHomeSection('about')}>About us</button><button type="button" onClick={() => goHomeSection('contact')}>Contact</button>
        <div className="mobile-nav-actions"><button type="button" className="site-button small" onClick={() => navigate('/book-appointment')}>Book an appointment</button><button type="button" className="profile-nav" onClick={openProfileMenu} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}<span>Account</span></button></div>
      </div>
      {profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Account menu"><div className="profile-menu-heading">{profilePhoto ? <img className="portal-menu-photo" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}<div><b>{user.fullName}</b><small>{user.email}</small></div></div><button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/patient-portal'); }}><span className="profile-menu-icon"><MenuIcon name="account"/></span><span><b>Profile</b><small>View and edit your personal information and profile photo</small></span></button><button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/forgot-password?email=' + encodeURIComponent(user.email)); }}><span className="profile-menu-icon"><MenuIcon name="security"/></span><span><b>Security &amp; password</b><small>Change your password, update email, and manage account security</small></span></button><button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); window.dispatchEvent(new Event('open-my-appointments')); }}><span className="profile-menu-icon"><MenuIcon name="appointments"/></span><span><b>My appointments</b><small>View your booked visits and appointment details</small></span></button>{error && <p className="profile-logout-error" role="alert">{error}</p>}<button type="button" role="menuitem" className="profile-menu-logout" onClick={logOut}><MenuIcon name="logout"/>Log out</button></div>}
    </header>

    <div className="portal-shell">
      {error && <p className="portal-alert" role="alert">{error}</p>}
      {notice && <p className="portal-success" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></p>}

      <div className="portal-page-heading"><span className="auth-kicker">PATIENT ACCOUNT</span><h1>My Profile</h1><p>Manage your personal information and patient records.</p></div>
      <section className="portal-card portal-profile-hero">
        <ProfileIcon photo={profilePhoto} name={user.fullName} onClick={() => photoInputRef.current?.click()} inputRef={photoInputRef} onPhotoChange={uploadPhoto}/>
        <div className="portal-profile-identity"><strong>{user.fullName}</strong><span className="portal-patient-badge">Patient Account</span><span className="portal-patient-id">Patient ID · {user.patientNumber || 'Assigning ID…'}</span><span className="portal-photo-note">Profile photo · JPG, PNG, or WEBP, up to 3 MB</span></div>
        <div className="portal-hero-actions"><button type="button" className="portal-photo-action" onClick={() => photoInputRef.current?.click()}><ProfileActionIcon name="upload"/>{profilePhoto ? 'Change photo' : 'Upload Photo'}</button>{!editingProfile && <button type="button" className="portal-edit-button portal-profile-edit" onClick={() => { setAccountDraft({ fullName: user.fullName, email: user.email, phone: user.phone || '' }); setRegistrationDraft(registration || blankRegistration()); setEditingProfile(true); setNotice(''); }}><ProfileActionIcon name="edit"/>Edit Profile</button>}</div>
      </section>

      <section className="portal-card portal-information-card">
        <header className="portal-card-heading"><div className="portal-section-heading"><span className="portal-section-icon"><ProfileActionIcon name="person"/></span><div><h2>Personal Information</h2><p>Your contact and patient details.</p></div></div></header>
        {editingProfile ? <form onSubmit={saveProfile}>
          <div className="portal-editor-grid portal-account-editor">
            <label className="portal-edit-field">Full name<input autoComplete="name" required value={accountDraft.fullName} onChange={event => setAccountDraft(current => ({ ...current, fullName: event.target.value }))}/></label>
            <label className="portal-edit-field">Email address<input type="email" autoComplete="email" required value={accountDraft.email} onChange={event => setAccountDraft(current => ({ ...current, email: event.target.value }))}/></label>
            <label className="portal-edit-field">Phone number<input type="tel" autoComplete="tel" value={accountDraft.phone} onChange={event => setAccountDraft(current => ({ ...current, phone: event.target.value }))}/></label>
          </div>
          {registration && <RegistrationEditor section="personal" value={registrationDraft} onChange={setRegistrationDraft}/>}
          <div className="portal-edit-actions"><button type="button" className="portal-cancel-button" onClick={cancelRegistration}>Cancel</button><button type="submit" className="site-button" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button></div>
        </form> : <><RegistrationReadOnly registration={registration || blankRegistration()} user={user} section="personal"/>{!registration && <div className="portal-registration-empty"><p>No patient registration has been saved yet.</p><button type="button" className="site-button" onClick={() => navigate('/patient-registration')}>Complete registration</button></div>}</>}
      </section>

      <section className="portal-card portal-medical-card">
        <header className="portal-card-heading"><div className="portal-section-heading"><span className="portal-section-icon"><ProfileActionIcon name="file"/></span><div><h2>Medical History</h2><p>Your past and current medical information.</p></div></div>{registration && !editingMedicalHistory && <button type="button" className="portal-edit-button portal-history-edit" onClick={() => { setRegistrationDraft(registration); setEditingMedicalHistory(true); setNotice(''); }}><ProfileActionIcon name="edit"/>Edit Medical History</button>}</header>
        {editingMedicalHistory ? <form onSubmit={saveMedicalHistory}><RegistrationEditor section="medical" value={registrationDraft} onChange={setRegistrationDraft}/><div className="portal-edit-actions"><button type="button" className="portal-cancel-button" onClick={cancelRegistration}>Cancel</button><button type="submit" className="site-button" disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button></div></form> : registration ? <RegistrationReadOnly registration={registration} user={user} section="medical"/> : <p className="portal-empty-note">Complete patient registration to add your medical history.</p>}
      </section>
    </div>
    {cropFile && cropSource && <ProfilePhotoCrop source={cropSource} onCancel={cancelPhotoCrop} onConfirm={saveCroppedPhoto}/>}
  </main>;
}
