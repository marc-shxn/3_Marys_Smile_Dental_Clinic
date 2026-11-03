import { useEffect, useState } from 'react';

export const PATIENT_PROFILE_PHOTO_KEY = 'smile-clinic-profile-photo';
const profilePhotoEvent = 'smile-clinic-profile-photo-updated';

export function patientProfilePhotoKey(user) {
  const userId = typeof user === 'string' ? user : user?.id;
  return userId ? `${PATIENT_PROFILE_PHOTO_KEY}:account:${userId}` : `${PATIENT_PROFILE_PHOTO_KEY}:anonymous`;
}

function readPhoto(key, user) {
  try {
    const photo = localStorage.getItem(key);
    if (photo) return photo;
    const userId = typeof user === 'string' ? user : user?.id;
    const userName = String(typeof user === 'object' ? user?.fullName : '').trim().toLocaleLowerCase();
    if (userId && typeof user === 'object' && user?.patientNumber === 'PT-0001' && userName) {
      const legacyRecord = JSON.parse(localStorage.getItem('smile-clinic-patient-registration') || 'null');
      const legacyName = String(legacyRecord?.patient?.fullName || '').trim().toLocaleLowerCase();
      if (legacyName && legacyName === userName) {
        const legacyPhoto = localStorage.getItem(PATIENT_PROFILE_PHOTO_KEY) || '';
        if (legacyPhoto) localStorage.setItem(key, legacyPhoto);
        localStorage.removeItem(PATIENT_PROFILE_PHOTO_KEY);
        return legacyPhoto;
      }
    }
    return '';
  }
  catch { return ''; }
}

export function usePatientProfilePhoto(user) {
  const key = patientProfilePhotoKey(user);
  const userId = typeof user === 'string' ? user : user?.id || '';
  const [photo, setPhoto] = useState(() => readPhoto(key, user));

  useEffect(() => {
    setPhoto(readPhoto(key, user));
    const refresh = event => {
      if (event?.type === profilePhotoEvent && event.detail?.accountId && event.detail.accountId !== userId) return;
      if (event?.type === 'storage' && event.key && event.key !== key) return;
      setPhoto(event?.detail?.photo ?? readPhoto(key, user));
    };
    window.addEventListener('storage', refresh);
    window.addEventListener(profilePhotoEvent, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(profilePhotoEvent, refresh);
    };
  }, [key, user, userId]);

  return [photo, setPhoto];
}

export function announcePatientProfilePhotoChange(photo, accountId = '') {
  window.dispatchEvent(new CustomEvent(profilePhotoEvent, { detail: { photo, accountId } }));
}
