const registrationKey = 'smile-clinic-patient-registration';

export function patientRegistrationKey(userId) {
  return userId ? `${registrationKey}:account:${userId}` : `${registrationKey}:anonymous`;
}

function parseRegistration(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}

export function readPatientRegistration(user) {
  if (!user?.id) return parseRegistration(patientRegistrationKey(''));
  const scopedKey = patientRegistrationKey(user.id);
  const saved = parseRegistration(scopedKey);
  if (saved) return saved;

  // Migrate a prior single-account browser record only when its name matches this account.
  const legacy = parseRegistration(registrationKey);
  const legacyName = String(legacy?.patient?.fullName || '').trim().toLocaleLowerCase();
  const accountName = String(user.fullName || '').trim().toLocaleLowerCase();
  if (legacy && user.patientNumber === 'PT-0001' && legacyName && legacyName === accountName) {
    try {
      localStorage.setItem(scopedKey, JSON.stringify(legacy));
      localStorage.removeItem(registrationKey);
      const legacyPhotoKey = 'smile-clinic-profile-photo';
      const legacyPhoto = localStorage.getItem(legacyPhotoKey);
      if (legacyPhoto) {
        localStorage.setItem(`${legacyPhotoKey}:account:${user.id}`, legacyPhoto);
        localStorage.removeItem(legacyPhotoKey);
      }
    } catch { /* Keep the legacy record available if browser storage is read-only. */ }
    return legacy;
  }
  return null;
}

export function savePatientRegistration(user, registration) {
  localStorage.setItem(patientRegistrationKey(user?.id), JSON.stringify(registration));
}
