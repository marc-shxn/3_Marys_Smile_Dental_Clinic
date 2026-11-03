import { useEffect, useRef, useState } from 'react';
import { authApi } from '../../shared/services/authApi.js';
import { patientPortalApi } from '../../shared/services/clinicApi.js';
import { usePatientProfilePhoto } from '../../shared/hooks/usePatientProfilePhoto.js';
import './public-site.css';
import './AiDentalAssessment.css';

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const TOOTH_ANGLES = [
  { id: 'front', label: 'Front View', hint: 'Smile directly at the camera' },
  { id: 'upper', label: 'Upper Teeth', hint: 'Tilt to show upper teeth' },
  { id: 'lower', label: 'Lower Teeth', hint: 'Tilt to show lower teeth' },
];
const MAX_ASSESSMENT_SIZE = 14 * 1024 * 1024;
const ASSESSMENT_CONSENT_VERSION = 'assessment-roboflow-workflow-v6';
const ASSESSMENT_DRAFT_DB = 'smile-clinic-assessment-drafts';
const ASSESSMENT_DRAFT_STORE = 'drafts';
const ASSESSMENT_DRAFT_MAX_AGE = 24 * 60 * 60 * 1000;
const assessmentConsentKey = accountId => `ai-assessment-consent:${accountId}:${ASSESSMENT_CONSENT_VERSION}`;
const REQUIRED_VIEW_IDS = ['front', 'upper', 'lower'];
const ANALYSIS_STEPS = ['Image Validation', 'Photo Processing', 'Roboflow Workflow Analysis', 'Assessment Report Creation'];
const ANGLE_LABELS = { front: 'Front View', upper: 'Upper Teeth', lower: 'Lower Teeth', left: 'Left Side', right: 'Right Side', xray: 'Dental X-ray' };

function getScreenOrientationAngle() {
  if (typeof window === 'undefined') return 0;
  const angle = window.screen?.orientation?.angle ?? window.orientation;
  if (angle != null && Number.isFinite(Number(angle))) return ((Number(angle) % 360) + 360) % 360;
  return window.matchMedia?.('(orientation: landscape)').matches ? 90 : 0;
}

function getPortraitDeviceOrientationAngle(beta, gamma) {
  const pitch = Number(beta);
  const roll = Number(gamma);
  if (!Number.isFinite(pitch) || !Number.isFinite(roll)) return null;
  if (Math.abs(pitch) < 55 || Math.abs(roll) > 35) return null;
  return pitch < 0 ? 180 : 0;
}

const FRONT_UPPER_TEETH = [
  [43, 56, 18, 35, -25], [62, 48, 18, 40, -19], [82, 42, 18, 44, -12],
  [103, 38, 20, 47, -6], [126, 35, 22, 49, -2], [149, 34, 22, 50, 0],
  [171, 34, 22, 50, 0], [194, 35, 22, 49, 2], [217, 38, 20, 47, 6],
  [238, 42, 18, 44, 12], [258, 48, 18, 40, 19], [277, 56, 18, 35, 25],
];
const FRONT_LOWER_TEETH = [
  [43, 110, 18, 34, 25], [62, 118, 18, 38, 19], [82, 124, 18, 42, 12],
  [103, 128, 20, 45, 6], [126, 131, 22, 47, 2], [149, 132, 22, 48, 0],
  [171, 132, 22, 48, 0], [194, 131, 22, 47, -2], [217, 128, 20, 45, -6],
  [238, 124, 18, 42, -12], [258, 118, 18, 38, -19], [277, 110, 18, 34, -25],
];
const CAMERA_ARCH_TEETH = [
  [49, 126, -56], [57, 96, -43], [71, 72, -31], [91, 53, -20],
  [115, 40, -11], [140, 34, -4], [160, 32, 0], [180, 34, 4],
  [205, 40, 11], [229, 53, 20], [249, 72, 31], [263, 96, 43], [271, 126, 56],
];

function CameraDentalArch({ lower = false }) {
  return <g transform={lower ? 'rotate(180 160 110)' : undefined}>
    <path className="camera-arch-gum" d="M38 176C17 134 27 77 69 42C111 7 209 7 251 42C293 77 303 134 282 176L247 155C260 120 252 88 225 66C195 42 125 42 95 66C68 88 60 120 73 155Z"/>
    <path className="camera-arch-palate" d="M73 155C60 120 68 88 95 66C125 42 195 42 225 66C252 88 260 120 247 155C208 174 112 174 73 155Z"/>
    <g className="camera-arch-teeth">
      {CAMERA_ARCH_TEETH.map(([x, y, angle], index) => <g key={index} transform={'translate(' + x + ' ' + y + ') rotate(' + angle + ')'}>
        <rect x="-9" y="-14" width="18" height="28" rx="7"/>
        <path d="M-5-8v12M0-10v18M5-8v12"/>
      </g>)}
    </g>
    <path className="camera-arch-inner-line" d="M76 151C64 116 74 83 101 61C130 39 190 39 219 61C246 83 256 116 244 151"/>
  </g>;
}

function CameraFrontSmileGuide() {
  return <g className="camera-front-art">
    <path className="camera-front-mouth-opening" d="M20 66C63 37 112 28 160 28C208 28 257 37 300 66C284 102 246 126 160 132C74 126 36 102 20 66Z"/>
    <path className="camera-front-upper-gum" d="M16 61C68 20 252 20 304 61L296 77C245 47 75 47 24 77Z"/>
    <path className="camera-front-lower-gum" d="M24 94C75 123 245 123 296 94L304 110C252 153 68 153 16 110Z"/>
    <path className="camera-front-smile-outline" d="M15 61C40 94 78 125 160 132C242 125 280 94 305 61"/>
    <g className="camera-front-upper-teeth">
      {FRONT_UPPER_TEETH.map(([x, y, width, height, angle], index) => <g key={index} transform={'translate(' + x + ' ' + y + ') rotate(' + angle + ')'}>
        <rect x={-width / 2} y="0" width={width} height={height} rx="5"/>
        <path d={'M0 5v' + Math.max(12, height - 10)}/>
      </g>)}
    </g>
    <g className="camera-front-lower-teeth">
      {FRONT_LOWER_TEETH.map(([x, y, width, height, angle], index) => <g key={index} transform={'translate(' + x + ' ' + y + ') rotate(' + angle + ')'}>
        <rect x={-width / 2} y={-height} width={width} height={height} rx="5"/>
        <path d={'M0 -5v-' + Math.max(12, height - 10)}/>
      </g>)}
    </g>
    <path className="camera-front-mouth-line" d="M16 61C71 38 249 38 304 61M16 110C71 137 249 137 304 110"/>
  </g>;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please choose that image again.`));
    reader.readAsDataURL(file);
  });
}

function openAssessmentDraftDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Local draft storage is unavailable.')); return; }
    const request = window.indexedDB.open(ASSESSMENT_DRAFT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(ASSESSMENT_DRAFT_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local draft storage.'));
  });
}

async function readAssessmentDraft(accountId) {
  const db = await openAssessmentDraftDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(ASSESSMENT_DRAFT_STORE, 'readonly').objectStore(ASSESSMENT_DRAFT_STORE).get(accountId);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function writeAssessmentDraft(accountId, draft) {
  const db = await openAssessmentDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSESSMENT_DRAFT_STORE, 'readwrite');
    transaction.objectStore(ASSESSMENT_DRAFT_STORE).put(draft, accountId);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

async function deleteAssessmentDraft(accountId) {
  if (!accountId || !('indexedDB' in window)) return;
  const db = await openAssessmentDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ASSESSMENT_DRAFT_STORE, 'readwrite');
    transaction.objectStore(ASSESSMENT_DRAFT_STORE).delete(accountId);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

async function prepareAssessmentImage(file) {
  let source;
  let sourceUrl = '';
  try {
    if (typeof window.createImageBitmap === 'function') {
      try { source = await window.createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: 1600, resizeQuality: 'high' }); }
      catch {
        try { source = await window.createImageBitmap(file, { imageOrientation: 'from-image' }); }
        catch {
          sourceUrl = URL.createObjectURL(file);
          const image = new Image();
          image.style.imageOrientation = 'from-image';
          image.src = sourceUrl;
          await image.decode();
          source = image;
        }
      }
    } else {
      sourceUrl = URL.createObjectURL(file);
      const image = new Image();
      image.style.imageOrientation = 'from-image';
      image.src = sourceUrl;
      await image.decode();
      source = image;
    }
  } catch {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    throw new Error(`Could not open ${file.name}. Choose a clear photo in JPG, PNG, or WEBP format.`);
  }
  const originalWidth = source.width || source.naturalWidth;
  const originalHeight = source.height || source.naturalHeight;
  if (originalWidth < 320 || originalHeight < 240) {
    source.close?.();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    throw new Error(`${file.name} is too small for review. Choose an image at least 320 × 240 pixels.`);
  }
  if (originalWidth > 12000 || originalHeight > 12000) {
    source.close?.();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    throw new Error(`${file.name} is too large to analyze. Choose an image no larger than 12,000 pixels per side.`);
  }
  const scale = Math.min(1, 1600 / originalWidth, 2000 / originalHeight);
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { alpha: false })?.drawImage(source, 0, 0, width, height);
  source.close?.();
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.84));
  canvas.width = 0;
  canvas.height = 0;
  if (!blob) throw new Error(`Could not prepare ${file.name}. Please choose another photo.`);
  if (blob.size > MAX_PHOTO_SIZE) throw new Error(`${file.name} is still larger than 5 MB after resizing. Choose another photo.`);
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'teeth-photo';
  return { file: new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }), width, height };
}

function AssessmentIcon({ name, size = 20 }) {
  const icons = {
    spark: <><path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
    camera: <><path d="M4 7.5h3l1.5-2h7l1.5 2h3A1.5 1.5 0 0 1 21.5 9v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5Z"/><circle cx="12" cy="13" r="3.5"/></>,
    rotate: <><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></>,
    switchCamera: <><path d="M16 3h4v4"/><path d="M20 7a8 8 0 0 0-14-3"/><path d="M8 21H4v-4"/><path d="M4 17a8 8 0 0 0 14 3"/></>,
    cameraTilt: <><rect x="7" y="5" width="10" height="14" rx="2"/><path d="M12 3v2m0-2-2 2m2-2 2 2M12 21v-2m0 2-2-2m2 2 2-2"/></>,
    flashlight: <><path d="M8 4h8l2 4-2.5 3v8a3.5 3.5 0 0 1-7 0v-8L6 8l2-4Z"/><path d="M8 8h8m-6 6h4"/></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"/></>,
    check: <path d="m5 12 4.5 4.5L19 7"/>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
    tooth: <><path d="M12 3.5c-2.5-1.5-7-1-7.5 3-.6 4.2 1.7 13.5 4.2 14 1.4.3 1.4-4.8 3.3-4.8s1.9 5.1 3.3 4.8c2.5-.5 4.8-9.8 4.2-14-.5-4-5-4.5-7.5-3Z"/><path d="M8 7.5c1.5-1 2.5-.7 4 0 1.5-.7 2.5-1 4 0"/></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 14h3m2 0h3m-8 3h3"/></>,
    shield: <><path d="M12 3 19 6v5c0 4.6-2.8 7.8-7 10-4.2-2.2-7-5.4-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

function AssessmentMenuIcon({ name }) {
  const paths = {
    profile: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.6-3.2 2.8-5 6.5-5s5.9 1.8 6.5 5"/></>,
    security: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    appointments: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h3m2 0h3"/></>,
    logout: <><path d="M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10"/><path d="M13 8l4 4-4 4M17 12H9"/></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function AiDentalAssessment({ navigate }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const cameraDialogRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraTimerRef = useRef(null);
  const cameraFocusTimerRef = useRef(null);
  const cameraCaptureLockRef = useRef(false);
  const cameraSensorOrientationRef = useRef(null);
  const xrayInputRef = useRef(null);
  const activeAngleRef = useRef('front');
  const objectUrlsRef = useRef(new Set());
  const infoDialogRef = useRef(null);
  const [photos, setPhotos] = useState({});
  const [xrayPhotos, setXrayPhotos] = useState([]);
  const [draftReady, setDraftReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [assessmentUnlocked, setAssessmentUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [retryAnalysisAvailable, setRetryAnalysisAvailable] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [analysis, setAnalysis] = useState(null);
  const [analysisToken, setAnalysisToken] = useState('');
  const [progressStep, setProgressStep] = useState(0);
  const [assessmentMessage, setAssessmentMessage] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraAngle, setCameraAngle] = useState('front');
  const [cameraFacingMode, setCameraFacingMode] = useState('user');
  const [cameraOrientationAngle, setCameraOrientationAngle] = useState(getScreenOrientationAngle);
  const cameraOrientationAngleRef = useRef(getScreenOrientationAngle());
  const [cameraFlashlightSupported, setCameraFlashlightSupported] = useState(false);
  const [cameraFlashlightOn, setCameraFlashlightOn] = useState(false);
  const [cameraFlashlightNotice, setCameraFlashlightNotice] = useState('');
  const [cameraFocusSupported, setCameraFocusSupported] = useState(false);
  const [cameraFocusPoint, setCameraFocusPoint] = useState(null);
  const [cameraFocusNotice, setCameraFocusNotice] = useState('');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [cameraCountdown, setCameraCountdown] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [profilePhoto] = usePatientProfilePhoto(currentUser);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const headerRef = useRef(null);
  const uploadsDisabled = phase === 'analyzing' || phase === 'saving' || Boolean(currentUser?.id && !draftReady);
  const missingRequiredViews = REQUIRED_VIEW_IDS.filter(angle => !photos[angle]);
  const hasAllRequiredViews = missingRequiredViews.length === 0;
  const cameraGuideQuarterTurn = cameraOrientationAngle === 90 || cameraOrientationAngle === 270;
  const cameraPreviewAspect = cameraGuideQuarterTurn ? 16 / 9 : 4 / 3;
  const cameraGuideBoxAspect = cameraPreviewAspect * (86 / 90);
  const cameraGuideScale = cameraGuideQuarterTurn ? Math.min(cameraGuideBoxAspect, 1 / cameraGuideBoxAspect) : 1;

  useEffect(() => {
    const dialog = infoDialogRef.current;
    if (!dialog) return;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    if (infoOpen && !dialog.open) dialog.showModal();
    if (!infoOpen && dialog.open) dialog.close();
    if (infoOpen) {
      root.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      root.style.overscrollBehavior = 'none';
      body.style.overscrollBehavior = 'none';
    }
    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, [infoOpen]);

  useEffect(() => {
    let alive = true;
    authApi.session().then(({ user }) => { if (alive) setCurrentUser(user); }).catch(() => {}).finally(() => { if (alive) setAuthChecking(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!currentUser?.id) { setDraftReady(false); return undefined; }
    let alive = true;
    setDraftReady(false);
    readAssessmentDraft(currentUser.id).then(draft => {
      if (!alive || !draft) return;
      if (Date.now() - Number(draft.savedAt || 0) > ASSESSMENT_DRAFT_MAX_AGE) {
        void deleteAssessmentDraft(currentUser.id).catch(() => {});
        return;
      }
      const restoredPhotos = {};
      Object.entries(draft.photos || {}).forEach(([angle, image]) => {
        if (!(image?.file instanceof Blob)) return;
        const previewUrl = URL.createObjectURL(image.file);
        objectUrlsRef.current.add(previewUrl);
        restoredPhotos[angle] = { ...image, previewUrl };
      });
      const restoredXrays = (draft.xrayPhotos || []).filter(image => image?.file instanceof Blob).map(image => {
        const previewUrl = URL.createObjectURL(image.file);
        objectUrlsRef.current.add(previewUrl);
        return { ...image, previewUrl };
      });
      setPhotos(restoredPhotos);
      setXrayPhotos(restoredXrays);
    }).catch(() => {}).finally(() => { if (alive) setDraftReady(true); });
    return () => { alive = false; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (authChecking) return;
    let accepted = false;
    if (currentUser?.id) {
      try { accepted = localStorage.getItem(assessmentConsentKey(currentUser.id)) === 'accepted'; }
      catch { /* Ask again when browser storage is unavailable. */ }
    }
    setConsent(accepted);
    setAssessmentUnlocked(accepted);
    setInfoOpen(!accepted);
  }, [authChecking, currentUser?.id]);

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

  const go = id => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
    navigate('/');
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };
  const book = () => {
    setMenuOpen(false);
    navigate('/book-appointment');
  };
  const logIn = () => { setMenuOpen(false); navigate(currentUser ? '/patient-portal' : '/patient-login'); };
  async function requireSignedIn() {
    try {
      const { user } = await authApi.session();
      if (user) { setCurrentUser(user); return user; }
    } catch { /* An unavailable session is treated as signed out. */ }
    setCurrentUser(null);
    setAssessmentUnlocked(false);
    setInfoOpen(false);
    navigate('/patient-login');
    return false;
  }
  async function getSignedInUser() {
    return currentUser?.id ? currentUser : requireSignedIn();
  }
  async function openPhotoPicker(inputRef, angle) {
    if (uploadsDisabled) return;
    if (!await getSignedInUser()) return;
    if (uploadsDisabled) return;
    if (angle) activeAngleRef.current = angle;
    if (!inputRef.current) return;
    inputRef.current.value = '';
    inputRef.current.click();
  }
  async function openCameraCapture(angle) {
    if (uploadsDisabled || !await getSignedInUser() || uploadsDisabled) return;
    activeAngleRef.current = angle;
    setCameraAngle(angle);
    setCameraError(!navigator.mediaDevices?.getUserMedia
      ? (!window.isSecureContext
        ? 'The live camera guide needs a secure page (HTTPS) on mobile. You can still use your device camera now; the live guide will work once the site is served securely.'
        : 'Guided camera capture is not available in this browser. You can still use your device camera from the upload option.')
      : '');
    setCameraCountdown(0);
    setCameraFlashlightSupported(false);
    setCameraFlashlightOn(false);
    setCameraFlashlightNotice('');
    setCameraStatus(navigator.mediaDevices?.getUserMedia ? 'starting' : 'error');
    setCameraOpen(true);
  }
  function toggleCameraFacingMode() {
    if (cameraStatus !== 'ready' && cameraStatus !== 'error') return;
    if (cameraFocusTimerRef.current) window.clearTimeout(cameraFocusTimerRef.current);
    cameraFocusTimerRef.current = null;
    setCameraError('');
    setCameraFlashlightSupported(false);
    setCameraFlashlightOn(false);
    setCameraFlashlightNotice('');
    setCameraFocusSupported(false);
    setCameraFocusPoint(null);
    setCameraFocusNotice('');
    setCameraStatus('starting');
    setCameraFacingMode(mode => mode === 'user' ? 'environment' : 'user');
  }
  function closeCameraCapture() {
    if (cameraTimerRef.current) window.clearInterval(cameraTimerRef.current);
    cameraTimerRef.current = null;
    if (cameraFocusTimerRef.current) window.clearTimeout(cameraFocusTimerRef.current);
    cameraFocusTimerRef.current = null;
    cameraCaptureLockRef.current = false;
    setCameraCountdown(0);
    setCameraFlashlightSupported(false);
    setCameraFlashlightOn(false);
    setCameraFlashlightNotice('');
    setCameraFocusSupported(false);
    setCameraFocusPoint(null);
    setCameraFocusNotice('');
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
    setCameraStatus('idle');
    setCameraOpen(false);
  }
  async function toggleCameraFlashlight() {
    if (cameraStatus !== 'ready') return;
    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') {
      setCameraFlashlightNotice('Flashlight control is not available in this browser. Add more room lighting.');
      return;
    }
    let capabilities;
    try { capabilities = track.getCapabilities?.(); } catch { capabilities = undefined; }
    if (capabilities && capabilities.torch !== true) {
      setCameraFlashlightSupported(false);
      setCameraFlashlightNotice('This camera does not support flashlight control. Add more room lighting.');
      return;
    }
    const nextOn = !cameraFlashlightOn;
    try {
      const currentConstraints = track.getConstraints?.() || {};
      const currentAdvanced = Array.isArray(currentConstraints.advanced) ? currentConstraints.advanced : [];
      const advanced = currentAdvanced.filter(constraint => !Object.prototype.hasOwnProperty.call(constraint, 'torch'));
      await track.applyConstraints({ ...currentConstraints, advanced: [...advanced, { torch: nextOn }] });
      const actualTorch = track.getSettings?.().torch;
      if (actualTorch !== undefined && actualTorch !== nextOn) throw new Error('Flashlight setting was not applied');
      setCameraFlashlightSupported(true);
      setCameraFlashlightOn(nextOn);
      setCameraFlashlightNotice('');
    } catch {
      setCameraFlashlightSupported(false);
      setCameraFlashlightOn(false);
      setCameraFlashlightNotice('The flashlight could not be controlled by this camera. Add more room lighting.');
    }
  }

  async function focusCameraAtPoint(event) {
    if (cameraStatus !== 'ready' || cameraCaptureLockRef.current) return;
    if (event.target instanceof Element && event.target.closest('button')) return;
    const preview = event.currentTarget;
    const video = cameraVideoRef.current;
    const rect = preview.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const localX = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const localY = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setCameraFocusPoint({ x: localX * 100, y: localY * 100 });
    if (cameraFocusTimerRef.current) window.clearTimeout(cameraFocusTimerRef.current);
    cameraFocusTimerRef.current = window.setTimeout(() => setCameraFocusPoint(null), 1400);

    const track = cameraStreamRef.current?.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function' || !video?.videoWidth || !video?.videoHeight) {
      setCameraFocusSupported(false);
      setCameraFocusNotice('Tap-to-focus is unavailable here; the camera will manage focus automatically.');
      return;
    }
    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    let sensorX = Math.min(1, Math.max(0, (localX * rect.width - offsetX) / renderedWidth));
    const sensorY = Math.min(1, Math.max(0, (localY * rect.height - offsetY) / renderedHeight));
    if (cameraFacingMode === 'user') sensorX = 1 - sensorX;

    let focusModes = [];
    try {
      const capabilities = track.getCapabilities?.();
      focusModes = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];
      setCameraFocusSupported(focusModes.includes('single-shot') || focusModes.includes('continuous') || capabilities?.pointsOfInterest === true);
    } catch {
      setCameraFocusSupported(false);
    }
    const replacements = [];
    if (focusModes.includes('single-shot')) replacements.push({ focusMode: 'single-shot' });
    else if (focusModes.includes('continuous')) replacements.push({ focusMode: 'continuous' });
    replacements.push({ pointsOfInterest: [{ x: sensorX, y: sensorY }] });
    try {
      const currentConstraints = track.getConstraints?.() || {};
      const currentAdvanced = Array.isArray(currentConstraints.advanced) ? currentConstraints.advanced : [];
      const nextAdvanced = currentAdvanced.filter(constraint => !('focusMode' in constraint) && !('pointsOfInterest' in constraint));
      await track.applyConstraints({
        ...currentConstraints,
        advanced: [...nextAdvanced, ...replacements],
      });
      setCameraFocusNotice('Focus requested. Hold still while the camera adjusts.');
    } catch {
      setCameraFocusSupported(false);
      setCameraFocusNotice('Tap-to-focus is unavailable here; the camera will manage focus automatically.');
    }
  }

  function beginCameraCountdown() {
    if (cameraStatus !== 'ready' || cameraCaptureLockRef.current) return;
    setCameraError('');
    setCameraCountdown(3);
    setCameraStatus('countdown');
    let remaining = 3;
    cameraTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      setCameraCountdown(Math.max(remaining, 0));
      if (remaining <= 0) {
        window.clearInterval(cameraTimerRef.current);
        cameraTimerRef.current = null;
        void captureCameraPhoto();
      }
    }, 1000);
  }
  async function captureCameraPhoto() {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || cameraCaptureLockRef.current) {
      setCameraError('The camera is not ready yet. Please wait for the preview, then try again.');
      setCameraStatus('ready');
      return;
    }
    cameraCaptureLockRef.current = true;
    const captureOrientationAngle = cameraOrientationAngleRef.current;
    const canvas = document.createElement('canvas');
    const preview = video.getBoundingClientRect();
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const previewAspect = preview.width > 0 && preview.height > 0 ? preview.width / preview.height : sourceWidth / sourceHeight;
    const sourceAspect = sourceWidth / sourceHeight;
    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    if (sourceAspect > previewAspect) {
      cropWidth = sourceHeight * previewAspect;
      cropX = (sourceWidth - cropWidth) / 2;
    } else if (sourceAspect < previewAspect) {
      cropHeight = sourceWidth / previewAspect;
      cropY = (sourceHeight - cropHeight) / 2;
    }
    canvas.width = Math.max(1, Math.round(cropWidth));
    canvas.height = Math.max(1, Math.round(cropHeight));
    const context = canvas.getContext('2d');
    if (context) {
      if (captureOrientationAngle === 180) {
        context.translate(canvas.width, canvas.height);
        context.rotate(Math.PI);
      }
      if (cameraFacingMode === 'user') {
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    }
    const angle = activeAngleRef.current;
    canvas.toBlob(async blob => {
      if (!blob) {
        cameraCaptureLockRef.current = false;
        setCameraError('The photo could not be captured. Please try again.');
        setCameraStatus('ready');
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File([blob], `${angle}-teeth-${stamp}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
      closeCameraCapture();
      await selectPhoto(file, angle);
    }, 'image/jpeg', 0.92);
  }

  useEffect(() => {
    const dialog = cameraDialogRef.current;
    if (!dialog) return;
    if (cameraOpen && !dialog.open) dialog.showModal();
    if (!cameraOpen && dialog.open) dialog.close();
  }, [cameraOpen]);

  useEffect(() => {
    if (!cameraOpen) return undefined;
    const video = cameraVideoRef.current;
    let cancelled = false;
    let stream;
    if (!navigator.mediaDevices?.getUserMedia) return undefined;
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: cameraFacingMode } } }).then(cameraStream => {
      stream = cameraStream;
      if (cancelled) {
        cameraStream.getTracks().forEach(track => track.stop());
        return;
      }
      cameraStreamRef.current = cameraStream;
      const videoTrack = cameraStream.getVideoTracks()[0];
      try {
        const capabilities = videoTrack?.getCapabilities?.();
        const settings = videoTrack?.getSettings?.();
        setCameraFlashlightSupported(capabilities?.torch === true);
        setCameraFlashlightOn(settings?.torch === true);
        const focusModes = Array.isArray(capabilities?.focusMode) ? capabilities.focusMode : [];
        setCameraFocusSupported(focusModes.includes('single-shot') || focusModes.includes('continuous') || capabilities?.pointsOfInterest === true);
      } catch {
        setCameraFlashlightSupported(false);
        setCameraFlashlightOn(false);
        setCameraFocusSupported(false);
      }
      setCameraFlashlightNotice('');
      setCameraFocusNotice('');
      if (!video) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStreamRef.current = null;
        setCameraStatus('error');
        setCameraError('The camera preview could not be started. Use your device camera from the upload option.');
        return;
      }
      video.onloadedmetadata = () => { if (!cancelled) setCameraStatus('ready'); };
      video.srcObject = cameraStream;
      void video.play().catch(() => {
        if (cancelled) return;
        setCameraStatus('error');
        setCameraError('The live camera preview could not be played. Check your browser camera settings, or use your device camera from the upload option.');
      });
    }).catch(() => {
      if (cancelled) return;
      setCameraStatus('error');
      setCameraError('Camera access was unavailable. Allow camera access in your browser settings, or use your device camera from the upload option.');
    });
    return () => {
      cancelled = true;
      if (cameraTimerRef.current) window.clearInterval(cameraTimerRef.current);
      cameraTimerRef.current = null;
      if (cameraFocusTimerRef.current) window.clearTimeout(cameraFocusTimerRef.current);
      cameraFocusTimerRef.current = null;
      stream?.getTracks().forEach(track => track.stop());
      if (cameraStreamRef.current === stream) cameraStreamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [cameraOpen, cameraFacingMode]);

  useEffect(() => {
    if (!cameraOpen) {
      cameraSensorOrientationRef.current = null;
      return undefined;
    }
    const screenOrientation = window.screen?.orientation;
    const syncScreenOrientation = () => {
      const screenAngle = getScreenOrientationAngle();
      const effectiveAngle = screenAngle === 90 || screenAngle === 270 || screenAngle === 180
        ? screenAngle
        : cameraSensorOrientationRef.current ?? screenAngle;
      cameraOrientationAngleRef.current = effectiveAngle;
      setCameraOrientationAngle(current => current === effectiveAngle ? current : effectiveAngle);
    };
    const syncDeviceOrientation = event => {
      const sensorAngle = getPortraitDeviceOrientationAngle(event.beta, event.gamma);
      if (sensorAngle == null) return;
      cameraSensorOrientationRef.current = sensorAngle;
      const screenAngle = getScreenOrientationAngle();
      const effectiveAngle = screenAngle === 90 || screenAngle === 270 || screenAngle === 180
        ? screenAngle
        : sensorAngle;
      cameraOrientationAngleRef.current = effectiveAngle;
      setCameraOrientationAngle(current => current === effectiveAngle ? current : effectiveAngle);
    };
    syncScreenOrientation();
    screenOrientation?.addEventListener?.('change', syncScreenOrientation);
    window.addEventListener('orientationchange', syncScreenOrientation);
    window.addEventListener('resize', syncScreenOrientation);
    window.addEventListener('deviceorientation', syncDeviceOrientation, { passive: true });
    return () => {
      screenOrientation?.removeEventListener?.('change', syncScreenOrientation);
      window.removeEventListener('orientationchange', syncScreenOrientation);
      window.removeEventListener('resize', syncScreenOrientation);
      window.removeEventListener('deviceorientation', syncDeviceOrientation);
      cameraSensorOrientationRef.current = null;
    };
  }, [cameraOpen]);
  const accountNameParts = currentUser?.fullName?.trim().split(/\s+/) || [];
  const accountInitials = accountNameParts.length > 1 ? (accountNameParts[0][0] + accountNameParts[accountNameParts.length - 1][0]).toUpperCase() : accountNameParts[0]?.[0]?.toUpperCase() || 'P';
  const logout = async () => {
    setLogoutError('');
    try { await authApi.logout(); await deleteAssessmentDraft(currentUser?.id).catch(() => {}); setCurrentUser(null); setPhotos({}); setXrayPhotos([]); setProfileMenuOpen(false); navigate('/'); }
    catch (error) { setLogoutError(error.message || 'Could not log out. Please try again.'); }
  };

  useEffect(() => {
    return () => objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (phase !== 'analyzing') return undefined;
    const timer = window.setInterval(() => setProgressStep(current => Math.min(current + 1, ANALYSIS_STEPS.length - 1)), 1100);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function persistUploadDraft(accountId, nextPhotos, nextXrayPhotos) {
    if (!accountId) return;
    const draft = {
      savedAt: Date.now(),
      photos: Object.fromEntries(Object.entries(nextPhotos).map(([angle, image]) => [angle, { file: image.file, width: image.width, height: image.height }])),
      xrayPhotos: nextXrayPhotos.map(({ id, file, width, height }) => ({ id, file, width, height })),
    };
    if (!Object.keys(draft.photos).length && !draft.xrayPhotos.length) {
      await deleteAssessmentDraft(accountId).catch(() => {});
      return;
    }
    await writeAssessmentDraft(accountId, draft);
  }

  async function selectPhoto(file, angle = activeAngleRef.current) {
    if (!file || uploadsDisabled) return;
    const user = await getSignedInUser();
    if (!user) return;
    setError('');
    setRetryAnalysisAvailable(false);
    setPhase('idle');
    setAnalysis(null);
    setAnalysisToken('');
    let prepared;
    try { prepared = await prepareAssessmentImage(file); }
    catch (qualityError) { setPhase('error'); setError(qualityError.message); return; }
    const current = photos[angle];
    if (current?.previewUrl) {
      URL.revokeObjectURL(current.previewUrl);
      objectUrlsRef.current.delete(current.previewUrl);
    }
    const previewUrl = URL.createObjectURL(prepared.file);
    objectUrlsRef.current.add(previewUrl);
    const nextPhotos = { ...photos, [angle]: { ...prepared, previewUrl } };
    setPhotos(nextPhotos);
    await persistUploadDraft(user.id, nextPhotos, xrayPhotos).catch(() => {});
  }
  function removePhoto(angle) {
    if (uploadsDisabled) return;
    const current = photos[angle];
    if (current?.previewUrl) {
      URL.revokeObjectURL(current.previewUrl);
      objectUrlsRef.current.delete(current.previewUrl);
    }
    const nextPhotos = { ...photos };
    delete nextPhotos[angle];
    setPhotos(nextPhotos);
    void persistUploadDraft(currentUser?.id, nextPhotos, xrayPhotos).catch(() => {});
    setPhase('idle');
    setRetryAnalysisAvailable(false);
    setAnalysis(null);
    setAnalysisToken('');
    setError('');
  }

  async function selectXrays(files) {
    if (!files?.length || uploadsDisabled) return;
    const user = await getSignedInUser();
    if (!user || uploadsDisabled) return;
    setError('');
    setRetryAnalysisAvailable(false);
    setPhase('idle');
    setAnalysis(null);
    setAnalysisToken('');
    const selected = [...files];
    let prepared;
    try {
      prepared = [];
      for (const file of selected) prepared.push(await prepareAssessmentImage(file));
    } catch (qualityError) { setPhase('error'); setError(qualityError.message); return; }
    const added = prepared.map(image => {
      const previewUrl = URL.createObjectURL(image.file);
      objectUrlsRef.current.add(previewUrl);
      return { id: `${image.file.name}-${image.file.lastModified}-${Math.random()}`, ...image, previewUrl };
    });
    const nextXrayPhotos = [...xrayPhotos, ...added];
    setXrayPhotos(nextXrayPhotos);
    await persistUploadDraft(user.id, photos, nextXrayPhotos).catch(() => {});
  }
  function removeXray(id) {
    if (uploadsDisabled) return;
    const current = xrayPhotos.find(item => item.id === id);
    if (current?.previewUrl) {
      URL.revokeObjectURL(current.previewUrl);
      objectUrlsRef.current.delete(current.previewUrl);
    }
    const nextXrayPhotos = xrayPhotos.filter(item => item.id !== id);
    setXrayPhotos(nextXrayPhotos);
    void persistUploadDraft(currentUser?.id, photos, nextXrayPhotos).catch(() => {});
    setPhase('idle');
    setRetryAnalysisAvailable(false);
    setAnalysis(null);
    setAnalysisToken('');
  }

  async function analyzeAssessment() {
    if (uploadsDisabled) return;
    if (!hasAllRequiredViews) {
      const missingLabels = missingRequiredViews.map(angle => ANGLE_LABELS[angle]);
      setError(`Complete all required photo views before generating a report. Missing: ${missingLabels.join(', ')}.`);
      setRetryAnalysisAvailable(false);
      setPhase('error');
      window.setTimeout(() => document.getElementById('ai-upload-feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
      return;
    }
    if (!consent) return;
    if (!await requireSignedIn()) return;
    const selectedFiles = [...Object.values(photos).map(image => image.file), ...xrayPhotos.map(image => image.file)];
    if (selectedFiles.length > 15) { setError('An assessment can include up to 15 images. Remove some X-rays and try again.'); setPhase('error'); return; }
    if (selectedFiles.reduce((total, file) => total + file.size, 0) > MAX_ASSESSMENT_SIZE) { setError('Keep the combined assessment images under 14 MB. Remove an image and try again.'); setPhase('error'); return; }
    const imageEntries = [...Object.values(photos), ...xrayPhotos];
    if (imageEntries.some(image => image.width < 320 || image.height < 240)) { setError('One or more photos do not meet the minimum 320 × 240 pixel image quality requirement. Replace the image and try again.'); setPhase('error'); return; }
    setError('');
    setRetryAnalysisAvailable(false);
    setAnalysis(null);
    setAnalysisToken('');
    setProgressStep(0);
    setPhase('analyzing');
    window.setTimeout(() => document.getElementById('ai-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    try {
      const serializeImage = async (image, kind, angle = '') => ({
        kind,
        angle,
        width: image.width,
        height: image.height,
        fileName: image.file.name,
        dataUrl: await fileAsDataUrl(image.file),
      });
      const images = await Promise.all([
        ...Object.entries(photos).map(([angle, image]) => serializeImage(image, 'teeth', angle)),
        ...xrayPhotos.map(image => serializeImage(image, 'xray')),
      ]);
      const response = await patientPortalApi.analyzeAssessment({ consent: true, consentVersion: ASSESSMENT_CONSENT_VERSION, images });
      setAnalysis(response.result);
      setAnalysisToken(response.analysisToken);
      setProgressStep(ANALYSIS_STEPS.length);
      setPhase('ready');
    } catch (analysisError) {
      setPhase('error');
      setRetryAnalysisAvailable(true);
      setError(analysisError.message || 'Your photos could not be analyzed. Please try again.');
    }
  }

  async function saveAssessment() {
    if (!analysisToken || !analysis || uploadsDisabled) return;
    setError('');
    setPhase('saving');
    try {
      const response = await patientPortalApi.saveAssessment({ consent: true, consentVersion: ASSESSMENT_CONSENT_VERSION, analysisToken });
      setAssessmentMessage(response.assessment?.message || 'Your assessment was saved to history.');
      setAnalysisToken('');
      await deleteAssessmentDraft(currentUser?.id).catch(() => {});
      setPhase('saved');
    } catch (saveError) {
      setPhase('ready');
      if (saveError.status === 400) setAnalysisToken('');
      setError(saveError.message || 'Your assessment could not be saved. Please try again.');
    }
  }

  function cancelInfo() {
    setConsent(false);
    setPrivacyOpen(false);
    setInfoOpen(false);
    setAssessmentUnlocked(false);
    navigate('/');
  }

  async function continueFromInfo() {
    if (!consent) return;
    const user = await requireSignedIn();
    if (!user) return;
    try { localStorage.setItem(assessmentConsentKey(user.id), 'accepted'); }
    catch { /* Keep this acceptance for the current page if storage is unavailable. */ }
    setAssessmentUnlocked(true);
    setInfoOpen(false);
    window.setTimeout(() => document.getElementById('upload-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  return <main className="public-site ai-assessment-page">
    <header className="public-nav" ref={headerRef}>
      <a href="/" className="public-logo" onClick={event => { event.preventDefault(); navigate('/'); }}><img src="/marys-smile-gold.png" alt="Mary’s Smile Dental Clinic logo"/><span className="public-brand-name"><b>3 Mary’s Smile</b><small>Dental Clinic</small></span></a>
      <nav aria-label="Main navigation"><button type="button" onClick={() => go('home')}>Home</button><button type="button" onClick={() => go('services')}>Services</button><button type="button" onClick={() => go('about')}>About us</button><button type="button" onClick={() => go('contact')}>Contact</button></nav>
      <div className="nav-actions">{currentUser ? <><button type="button" className="site-button small" onClick={book}>Book an appointment</button><button type="button" className="profile-nav" onClick={() => { setMenuOpen(false); setProfileMenuOpen(open => !open); }} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img className="profile-photo-image" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}</button></> : <><button type="button" className="nav-login" onClick={logIn}>Log in</button><button type="button" className="site-button small" onClick={book}>Book an appointment</button></>}</div>
      <button type="button" className={`menu-toggle${menuOpen ? ' is-open' : ''}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => { setProfileMenuOpen(false); setMenuOpen(open => !open); }}><span/><span/><span/></button>
      {menuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}/>}
      <div className={`mobile-nav-panel${menuOpen ? ' is-open' : ''}`} id="mobile-nav" aria-hidden={!menuOpen} inert={!menuOpen}>
        <button type="button" onClick={() => go('home')}>Home</button><button type="button" onClick={() => go('services')}>Services</button><button type="button" onClick={() => go('about')}>About us</button><button type="button" onClick={() => go('contact')}>Contact</button>
        <div className="mobile-nav-actions">{currentUser ? <><button type="button" className="site-button small" onClick={book}>Book an appointment</button><button type="button" className="profile-nav" onClick={() => { setMenuOpen(false); setProfileMenuOpen(open => !open); }} aria-label="Open account menu" aria-haspopup="menu" aria-expanded={profileMenuOpen}>{profilePhoto ? <img className="profile-photo-image" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}</button></> : <><button type="button" className="nav-login" onClick={logIn}>Log in</button><button type="button" className="site-button small" onClick={book}>Book an appointment</button></>}</div>
      </div>
      {currentUser && profileMenuOpen && <div className="profile-menu" role="menu" aria-label="Account menu">
        <div className="profile-menu-heading">{profilePhoto ? <img className="profile-menu-photo" src={profilePhoto} alt=""/> : <span className="profile-nav-avatar" aria-hidden="true">{accountInitials}</span>}<div><b>{currentUser.fullName}</b><small>{currentUser.email}</small></div></div>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/patient-portal'); }}><span className="profile-menu-icon"><AssessmentMenuIcon name="profile"/></span><span><b>Profile</b><small>View and edit your personal information and profile photo</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); navigate('/forgot-password?email=' + encodeURIComponent(currentUser.email)); }}><span className="profile-menu-icon"><AssessmentMenuIcon name="security"/></span><span><b>Security &amp; password</b><small>Change your password, update email, and manage account security</small></span></button>
        <button type="button" role="menuitem" className="profile-menu-item" onClick={() => { setProfileMenuOpen(false); window.dispatchEvent(new Event('open-my-appointments')); }}><span className="profile-menu-icon"><AssessmentMenuIcon name="appointments"/></span><span><b>My appointments</b><small>View your booked visits and appointment details</small></span></button>
        {logoutError && <p className="profile-logout-error" role="alert">{logoutError}</p>}
        <button type="button" role="menuitem" className="profile-menu-logout" onClick={logout}><AssessmentMenuIcon name="logout"/>Log out</button>
      </div>}
    </header>

    <div className="ai-assessment-wrap">
      <section className="ai-assessment-intro">
        <div>
          <h1>AI Oral Health Assessment</h1>
          <p>Upload photos of your teeth from different angles to receive preliminary oral health observations, preventive care tips, and personalized recommendations.</p>
        </div>
      </section>

      <div className="ai-assessment-grid">
        {!assessmentUnlocked ? <section className="ai-card ai-upload-locked"><span className="ai-locked-icon"><AssessmentIcon name="shield" size={24}/></span><h2>Review the assessment information first</h2><p>Your photos stay unselected until you read the information and provide consent.</p><button type="button" className="ai-primary-button" onClick={() => setInfoOpen(true)}>Review information</button></section> :
        <section className="ai-card ai-upload-card" aria-labelledby="upload-heading">
          <div className="ai-card-heading"><span className="ai-card-icon"><AssessmentIcon name="camera"/></span><div><h2 id="upload-heading">Upload Teeth Photos</h2><p>Add clear, well-lit photos from different angles.</p></div></div>
          <p className="ai-angle-instructions">Add a clear photo for each required view: Front View, Upper Teeth, and Lower Teeth. Dental X-rays are optional.</p>
          <div className="ai-angle-grid">
            {TOOTH_ANGLES.map(angle => {
              const selectedPhoto = photos[angle.id];
              return <article className={`ai-angle-slot${selectedPhoto ? ' has-photo' : ''}`} key={angle.id}>
                {selectedPhoto ? <><img className="ai-angle-preview" src={selectedPhoto.previewUrl} alt={`${angle.label} teeth photo preview`} /><span className="ai-angle-ready"><AssessmentIcon name="check" size={13}/> Added</span></> : <div className="ai-angle-placeholder"><AssessmentIcon name="camera" size={23}/><span>Photo needed</span></div>}
                <div className="ai-angle-copy"><b>{angle.label}<span className={`ai-angle-requirement${REQUIRED_VIEW_IDS.includes(angle.id) ? ' is-required' : ''}`}>{REQUIRED_VIEW_IDS.includes(angle.id) ? 'Required view' : 'Optional'}</span></b><small>{angle.hint}</small></div>
                <div className="ai-angle-controls">
                  <button type="button" className="ai-angle-add" disabled={uploadsDisabled} onClick={() => openPhotoPicker(fileInputRef, angle.id)}><AssessmentIcon name="upload" size={14}/>{selectedPhoto ? 'Change' : 'Add photo'}</button>
                  <button type="button" className="ai-angle-camera" disabled={uploadsDisabled} aria-label={`Take ${angle.label} photo`} title={`Take ${angle.label} photo`} onClick={() => void openCameraCapture(angle.id)}><AssessmentIcon name="camera" size={16}/></button>
                  {selectedPhoto && <button type="button" className="ai-angle-remove" disabled={uploadsDisabled} aria-label={`Remove ${angle.label} photo`} title={`Remove ${angle.label} photo`} onClick={() => removePhoto(angle.id)}><AssessmentIcon name="trash" size={15}/></button>}
                </div>
                {selectedPhoto && <small className="ai-angle-filename" title={selectedPhoto.file.name}>{selectedPhoto.file.name} · {(selectedPhoto.file.size / 1024 / 1024).toFixed(2)} MB</small>}
              </article>;
            })}
          </div>
          <input ref={fileInputRef} className="ai-file-input" type="file" accept="image/*" aria-label="Upload teeth angle photo" disabled={uploadsDisabled} onChange={event => { const input = event.currentTarget; const file = input.files?.[0]; void selectPhoto(file).finally(() => { input.value = ''; }); }}/>
          <input ref={cameraInputRef} className="ai-file-input" type="file" accept="image/*" capture={cameraFacingMode} aria-label="Take teeth angle photo" disabled={uploadsDisabled} onChange={event => { const input = event.currentTarget; const file = input.files?.[0]; void selectPhoto(file).finally(() => { input.value = ''; }); }}/>

          <section className="ai-xray-section" aria-labelledby="xray-heading"><div className="ai-xray-heading"><span className="ai-xray-icon"><AssessmentIcon name="upload" size={18}/></span><div><h3 id="xray-heading">Dental X-rays <span>Optional</span></h3><p>Add X-ray images if you already have them. You can continue without them.</p></div></div>
            {xrayPhotos.length > 0 && <div className="ai-xray-list">{xrayPhotos.map(image => <div className="ai-xray-item" key={image.id}><img src={image.previewUrl} alt={`X-ray preview: ${image.file.name}`} /><div><b title={image.file.name}>{image.file.name}</b><small>{(image.file.size / 1024 / 1024).toFixed(2)} MB</small></div><button type="button" disabled={uploadsDisabled} aria-label={`Remove ${image.file.name}`} onClick={() => removeXray(image.id)}><AssessmentIcon name="close" size={15}/></button></div>)}</div>}
            <input ref={xrayInputRef} className="ai-file-input" type="file" accept="image/*" multiple aria-label="Upload optional dental X-rays" disabled={uploadsDisabled} onChange={event => { const input = event.currentTarget; const files = input.files; void selectXrays(files).finally(() => { input.value = ''; }); }}/>
            <button type="button" className="ai-xray-add" disabled={uploadsDisabled} onClick={() => openPhotoPicker(xrayInputRef)}><AssessmentIcon name="upload" size={16}/> Add X-ray images</button><small className="ai-xray-formats">Images are resized on this device · 5 MB per image · 14 MB total</small>
          </section>
          {error && phase === 'error' && <div id="ai-upload-feedback" className="ai-feedback is-error" role="alert"><span>{error}</span>{retryAnalysisAvailable && <button type="button" className="ai-retry-button" onClick={analyzeAssessment}>Try Again</button>}</div>}
          <button className="ai-primary-button ai-analyze-button" type="button" onClick={analyzeAssessment} disabled={!consent || uploadsDisabled || phase === 'ready' || phase === 'saved'}>{phase === 'analyzing' ? <><span className="ai-spinner"/> Analyzing Images…</> : phase === 'ready' ? <>Report Generated <AssessmentIcon name="check" size={17}/></> : phase === 'saved' ? <>Assessment Saved <AssessmentIcon name="check" size={17}/></> : <>Analyze &amp; Generate Report <AssessmentIcon name="spark" size={17}/></>}</button>
          {!hasAllRequiredViews && <p className="ai-prototype-note">Complete all required views before generating a report: Front View, Upper Teeth, and Lower Teeth. Dental X-rays are optional.</p>}
          {phase === 'saved' && <div className="ai-feedback ai-save-success" role="status"><span>{assessmentMessage} Your findings and photo references are in Assessment History.</span><button type="button" className="ai-retry-button" onClick={() => navigate('/assessment-history')}>View History</button></div>}
        </section>
        }
      </div>

      {assessmentUnlocked && consent && <>
      <section className="ai-report-section" id="ai-report" aria-live="polite" aria-busy={phase === 'analyzing'}><div className="ai-history-heading"><div><h2>Your Oral Health Report</h2><p>Preliminary observations, preventive-care recommendations, and suggested next steps.</p></div>{analysis && <span className="ai-report-date">{new Date(analysis.assessedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>}</div>
        {phase === 'analyzing' ? <div className="ai-analysis-loading" role="status"><div className="ai-analysis-loading-heading"><span className="ai-spinner" aria-hidden="true"/><div><h3>Analyzing Dental Images</h3><p>Our AI is reviewing your uploaded photos and preparing preliminary observations for clinical review.</p></div></div><ol className="ai-analysis-steps">{ANALYSIS_STEPS.map((step, index) => <li key={step} className={index < progressStep ? 'is-complete' : index === progressStep ? 'is-current' : ''}><span>{index < progressStep ? <AssessmentIcon name="check" size={14}/> : <i/>}</span>{step}{index === progressStep && <span className="ai-step-pulse" aria-label="In progress"/>}</li>)}</ol><p className="ai-analysis-note">Keep this page open while the model reviews your images.</p></div> : analysis ? <>
          <div className={`ai-risk-card ${analysis.riskLevel ? `risk-${String(analysis.riskLevel).toLowerCase()}` : 'risk-not-scored'}`}><span className="ai-risk-icon"><AssessmentIcon name="shield" size={22}/></span><div><small>Preliminary Risk Level</small><b>{analysis.riskLevel ? `${analysis.riskLevel} Risk` : 'Not Scored'}</b><p>{analysis.riskDescription}</p></div><span className="ai-risk-badge">{analysis.findings?.length || 0} possible findings</span></div>
          <div className="ai-results-grid">
            <section className="ai-result-card ai-findings-card"><div className="ai-result-card-heading"><h3>Possible Findings</h3><span>{analysis.findings?.length || 0}</span></div>{analysis.findings?.length ? <ul className="ai-finding-list">{analysis.findings.map((finding, index) => <li key={`${finding.angle}-${finding.label}-${index}`}><div className="ai-finding-heading"><b>{finding.label}</b><span>{Math.round(finding.confidence * 100)}% confidence</span></div><small>{ANGLE_LABELS[finding.angle] || finding.angle}</small><p>{finding.description}</p></li>)}</ul> : <div className="ai-no-findings"><AssessmentIcon name="check" size={18}/><p>No matching labels were detected in these photos. This does not rule out an oral-health concern.</p></div>}</section>
            <section className="ai-result-card ai-angle-findings-card"><div className="ai-result-card-heading"><h3>Findings by Uploaded Angle</h3></div>{analysis.byAngle?.map((angle, index) => <div className="ai-angle-result" key={`${angle.angle}-${index}`}><b>{ANGLE_LABELS[angle.angle] || angle.angle}</b>{angle.kind === 'xray' && <small>{angle.fileName}</small>}{angle.findings?.length ? <ul>{angle.findings.map((finding, findingIndex) => <li key={`${finding.label}-${findingIndex}`}>{finding.label} <span>{Math.round(finding.confidence * 100)}%</span></li>)}</ul> : <small>No matching detections</small>}</div>)}</section>
            <section className="ai-result-card ai-recommendations-card"><div className="ai-result-card-heading"><h3>Recommendations</h3></div><ul className="ai-recommendation-list">{analysis.recommendations?.map((recommendation, index) => <li key={index}><span><AssessmentIcon name="check" size={14}/></span>{recommendation}</li>)}</ul></section>
            <section className="ai-result-card ai-education-card"><div className="ai-result-card-heading"><h3>Educational Notes</h3></div>{analysis.education?.length ? analysis.education.map((note, index) => <article key={`${note.title}-${index}`}><b>{note.title}</b><p>{note.body}</p></article>) : <article><b>Routine preventive care</b><p>Brush twice daily, clean between teeth each day, and keep regular dental checkups. An image assessment cannot determine overall oral health.</p></article>}</section>
            <section className="ai-result-card ai-annotated-gallery"><div className="ai-result-card-heading"><div><h3>AI Detection Review</h3><small>Bounding boxes show model detections for dentist verification.</small></div><span>{analysis.annotatedImages?.length || 0} images</span></div><div className="ai-annotated-grid">{(analysis.annotatedImages || []).map(annotated => {
              const sourceImages = [...Object.entries(photos).map(([angle, image]) => ({ ...image, angle, kind: 'teeth' })), ...xrayPhotos.map(image => ({ ...image, angle: 'xray', kind: 'xray' }))];
              const source = sourceImages[annotated.imageIndex];
              const detections = analysis.findings?.filter(finding => finding.imageIndex === annotated.imageIndex && finding.box) || [];
              const imageSize = annotated.imageSize || { width: source?.width || 1, height: source?.height || 1 };
              return <article className="ai-annotated-item" key={`${annotated.imageIndex}-${annotated.fileName}`}><div className="ai-annotated-canvas" style={{ aspectRatio: `${imageSize.width || 1} / ${imageSize.height || 1}` }}>{source?.previewUrl && <img src={source.previewUrl} alt={`${ANGLE_LABELS[annotated.angle] || 'Dental'} original with AI detections`}/>}<svg viewBox={`0 0 ${imageSize.width || 1} ${imageSize.height || 1}`} role="img" aria-label={`${detections.length} AI detection boxes`}>{detections.map((finding, index) => <g key={`${finding.label}-${index}`}><rect x={finding.box.x - finding.box.width / 2} y={finding.box.y - finding.box.height / 2} width={finding.box.width} height={finding.box.height} rx="5"/><text x={finding.box.x - finding.box.width / 2} y={Math.max(15, finding.box.y - finding.box.height / 2 - 4)}>{finding.label} · {Math.round(finding.confidence * 100)}%</text></g>)}</svg></div><div className="ai-annotated-caption"><b>{ANGLE_LABELS[annotated.angle] || 'Dental X-ray'}</b><span>{detections.length ? `${detections.length} detections` : 'No box detections'}</span><small>{annotated.fileName}</small></div></article>;
            })}</div></section>
          </div>
          <p className="ai-model-note">Analysis model: {analysis.model}. Confidence scores describe model output only.</p>
          {error && <div className="ai-feedback is-error" role="alert">{error}</div>}
          <div className="ai-report-actions">{phase === 'saved' ? <div className="ai-feedback ai-save-success" role="status">{assessmentMessage}</div> : analysisToken ? <button type="button" className="ai-primary-button" onClick={saveAssessment} disabled={phase === 'saving'}>{phase === 'saving' ? <><span className="ai-spinner"/> Saving Assessment…</> : <>Save Assessment <AssessmentIcon name="check" size={16}/></>}</button> : <button type="button" className="ai-primary-button" onClick={analyzeAssessment} disabled={phase === 'analyzing'}>Analyze Again <AssessmentIcon name="spark" size={16}/></button>}<button type="button" className="ai-secondary-button" onClick={() => navigate('/assessment-history')}>View Assessment History</button></div>
        </> : <div className="ai-report-empty"><span className="ai-history-icon"><AssessmentIcon name="tooth" size={25}/></span><div><b>No Assessment Available Yet</b><p>Upload dental photos and run an AI assessment to generate your oral health report.</p></div><button type="button" className="ai-secondary-button" onClick={() => navigate('/assessment-history')}>View Assessment History</button></div>}
      </section>

      <footer className="ai-report-disclaimer"><AssessmentIcon name="info"/><div><b>Important Disclaimer</b><p>This assessment uses the clinic’s Roboflow-hosted oral-health Workflow to identify possible indicators in uploaded photos. Findings may be inaccurate and do not constitute a professional diagnosis. They must be reviewed by a licensed dental professional before treatment decisions. Saved reports and uploaded images are available to clinic staff in the Admin Portal for clinical review.</p></div></footer>
      </>}
    </div>
    <dialog ref={cameraDialogRef} className={`ai-camera-dialog${cameraOrientationAngle === 90 || cameraOrientationAngle === 270 ? ' is-landscape' : ''}${cameraOrientationAngle === 180 ? ' is-inverted' : ''}`} aria-label="Guided teeth photo capture" onCancel={event => { event.preventDefault(); closeCameraCapture(); }}>
      <header className="ai-camera-dialog-header"><div><span className="ai-camera-eyebrow">Guided photo capture</span><h2>{ANGLE_LABELS[cameraAngle] || 'Teeth photo'}</h2></div><button type="button" className="ai-info-close" aria-label="Close camera" onClick={closeCameraCapture}><AssessmentIcon name="close" size={18}/></button></header>
      <div className="ai-camera-dialog-content">
        <p className="ai-camera-instruction">{cameraAngle === 'upper' ? 'Aim the camera at the roof of your mouth and center your upper arch in the smaller guide. You do not need to look into the lens.' : cameraAngle === 'lower' ? 'Aim the camera at your lower teeth and center the arch in the smaller guide. You do not need to look into the lens.' : 'Face the camera, smile gently, and center both rows of teeth in the smaller guide.'}</p>
        <div className={'ai-camera-angle-cue angle-' + cameraAngle}>
          <span className="ai-camera-angle-icon"><AssessmentIcon name="cameraTilt" size={17}/></span>
          <span>{cameraAngle === 'upper' ? 'Aim upward toward the roof of your mouth. Keep the phone level side-to-side; do not turn left or right.' : cameraAngle === 'lower' ? 'Aim downward toward your lower arch. Keep the phone level side-to-side; do not turn left or right.' : 'Face the camera and keep your phone straight. Do not turn left or right.'}</span>
        </div>
        <div className="ai-camera-orientation-hint">
          <span className="ai-camera-orientation-icon"><span className="ai-camera-orientation-glyph" style={{ transform: `rotate(${cameraOrientationAngle}deg)` }}><AssessmentIcon name="rotate" size={13}/></span></span>
          <span>{cameraAngle === 'upper' ? 'Tilt the camera toward the roof of your mouth; keep the guide centered over the preview.' : cameraAngle === 'lower' ? 'Tilt the camera toward your lower teeth; keep the guide centered over the preview.' : 'Turn your phone upright or sideways if needed; the preview and guide stay aligned.'}</span>
        </div>
        <div className={`ai-camera-preview${cameraStatus === 'countdown' ? ' is-counting' : ''}${cameraOrientationAngle === 180 ? ' is-inverted' : ''}`} onClick={event => void focusCameraAtPoint(event)}>
          <button type="button" className={`ai-camera-flashlight${cameraFlashlightOn ? ' is-on' : ''}`} onClick={() => void toggleCameraFlashlight()} disabled={cameraStatus !== 'ready'} aria-label={cameraFlashlightOn ? 'Turn flashlight off' : 'Turn flashlight on'} aria-pressed={cameraFlashlightOn} title={cameraFlashlightSupported ? (cameraFlashlightOn ? 'Turn flashlight off' : 'Turn flashlight on') : 'Flashlight availability depends on your camera and browser'}><AssessmentIcon name="flashlight" size={16}/><span>{cameraFlashlightOn ? 'Light on' : 'Flashlight'}</span></button>
          <button type="button" className="ai-camera-switch" onClick={toggleCameraFacingMode} disabled={cameraStatus !== 'ready' && cameraStatus !== 'error'} aria-label={cameraFacingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'} title={cameraFacingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}><AssessmentIcon name="switchCamera" size={16}/><span>Use {cameraFacingMode === 'user' ? 'back' : 'front'} camera</span></button>
          <div className="ai-camera-feed">
            <video ref={cameraVideoRef} className={cameraFacingMode === 'user' ? 'is-mirrored' : ''} autoPlay muted playsInline aria-label={`Live ${cameraFacingMode === 'user' ? 'front' : 'back'} camera preview`}/>
            <div className={`ai-camera-landmarks angle-${cameraAngle}${cameraOrientationAngle === 180 ? ' is-inverted' : ''}`} aria-hidden="true">
              <svg viewBox="-131 -90 582 400" preserveAspectRatio="xMidYMid meet" style={{ transform: `rotate(${cameraOrientationAngle}deg) scale(${cameraGuideScale})` }}>
                <g className="camera-guide camera-guide-front"><CameraFrontSmileGuide/></g>
                <g className="camera-guide camera-guide-upper"><CameraDentalArch/></g>
                <g className="camera-guide camera-guide-lower"><CameraDentalArch lower/></g>
              </svg>
              <span>{cameraAngle === 'upper' ? 'Center your upper arch' : cameraAngle === 'lower' ? 'Center your lower arch' : 'Center both rows of teeth'}</span>
            </div>
            {cameraFocusPoint && <span className="ai-camera-focus-indicator" aria-hidden="true" style={{ left: `${cameraFocusPoint.x}%`, top: `${cameraFocusPoint.y}%` }} />}
          </div>
          {cameraStatus === 'countdown' && <span className="ai-camera-countdown" aria-live="assertive">{cameraCountdown || 'Smile'}</span>}
          {cameraStatus === 'starting' && <span className="ai-camera-loading"><i/>Starting camera…</span>}
        </div>
        <p className="ai-camera-focus-hint" role="status">{cameraFocusNotice || (cameraFocusSupported ? 'Tap the preview where you want the camera to focus.' : 'Tap-to-focus is not available in this browser; the camera manages focus automatically.')}</p>
        <p className="ai-camera-hold-note">Keep your teeth centered and hold still for 3 seconds. The photo will be taken automatically.</p>
        {cameraError && <p className="ai-camera-error" role="alert">{cameraError}</p>}
        {cameraFlashlightNotice && <p className="ai-camera-flashlight-notice" role="status">{cameraFlashlightNotice}</p>}
      </div>
      <footer className="ai-camera-dialog-actions"><button type="button" className="ai-secondary-button" onClick={closeCameraCapture}>Close</button><button type="button" className="ai-primary-button" onClick={beginCameraCountdown} disabled={cameraStatus !== 'ready'}>{cameraStatus === 'countdown' ? 'Hold still…' : 'Start 3-second capture'}<AssessmentIcon name="camera" size={16}/></button>{cameraStatus === 'error' && <button type="button" className="ai-secondary-button ai-camera-fallback" onClick={() => { const angle = activeAngleRef.current; closeCameraCapture(); void openPhotoPicker(cameraInputRef, angle); }}>Use device camera</button>}</footer>
    </dialog>
    <dialog ref={infoDialogRef} className="ai-info-dialog" aria-label="AI Oral Health Assessment information" onCancel={event => { event.preventDefault(); cancelInfo(); }}>
      <button type="button" className="ai-info-close" aria-label="Close information" onClick={cancelInfo}><AssessmentIcon name="close" size={18}/></button>
      <div className="ai-info-dialog-content">
        <section className="ai-info-section"><h3>About this feature</h3><p>This AI-assisted oral health assessment reviews an uploaded photo of your teeth and mouth to offer preliminary observations and general preventive dental care recommendations.</p></section>
        <section className="ai-info-section"><h3>How it works</h3><ol className="ai-info-steps"><li><span>1</span><p>Read the instructions and photo requirements.</p></li><li><span>2</span><p>Upload a clear photo of your teeth and mouth.</p></li><li><span>3</span><p>Wait for the AI to analyze the image.</p></li><li><span>4</span><p>Review preliminary observations and recommendations.</p></li></ol></section>
        <section className="ai-info-section"><h3>What you may receive</h3><ul className="ai-info-list"><li>Preliminary observations of visible dental concerns.</li><li>Possible oral health issues that may need attention.</li><li>General preventive dental care recommendations.</li><li>Guidance on whether to consider a professional dental consultation.</li></ul><p>Results depend on the quality and visibility of your uploaded image.</p></section>
        <section className="ai-info-section"><h3>Photo requirements</h3><ul className="ai-info-list"><li>Upload photos for all three required views: Front View, Upper Teeth, and Lower Teeth.</li><li>Dental X-rays are optional. Use clear, well-lit images with teeth visible.</li><li>Avoid blurry, dark, or obstructed images, and keep the camera steady.</li><li>Choose image formats your device can open. Photos are resized on your device to fit the 5 MB per image and 14 MB total limits.</li></ul></section>
        <section className="ai-info-disclaimer"><span><AssessmentIcon name="info" size={18}/></span><div><b>Important: preliminary information only</b><p>AI results are not a confirmed diagnosis and cannot replace a professional dental examination or advice from a licensed dentist.</p></div></section>
        <label className="ai-info-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)}/><span>I understand that my photos will be sent through the clinic server to Roboflow’s hosted inference service for analysis by the clinic’s oral-health Workflow. Selected photos are temporarily kept in this browser to protect upload progress. If I save the assessment, the report and image references will be added to my patient record and available to clinic staff in the Admin Portal for review. Results are preliminary and do not replace an in-person dental examination. Please read the clinic's <a href="#ai-privacy-notice" onClick={event => { event.preventDefault(); setPrivacyOpen(open => !open); }}>Privacy Notice</a>.</span></label>
        {!currentUser && !authChecking && <p className="ai-info-login-note" role="status">Sign in is required to use this assessment. You can review this information now, then log in before continuing to photo upload.</p>}
        {privacyOpen && <div className="ai-info-privacy" id="ai-privacy-notice" role="note"><b>Privacy Notice</b><p>Selected photos are temporarily stored in this browser on this device so your upload progress can be restored if the page reloads. They are removed after 24 hours, when you save the assessment, or when you log out. After you accept consent and start analysis, selected photos are sent to the clinic server for dental-content checking before a report is generated. The API key stays on the clinic server. The report and image references are added to your patient record only after you choose Save Assessment. Unsaved validation and analysis data is held temporarily by the clinic server for up to 15 minutes so it can be saved. Retention and access policies for a public production deployment still need to be finalized by the clinic.</p></div>}
      </div>
      <div className="ai-info-dialog-actions"><button type="button" className="ai-secondary-button" onClick={cancelInfo}>Cancel</button><button type="button" className="ai-primary-button" disabled={!consent || authChecking} onClick={continueFromInfo}>{!currentUser && !authChecking ? 'Log in to continue' : 'I Understand & Continue'}</button></div>
    </dialog>
  </main>;
}
