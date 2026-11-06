import { randomUUID } from 'node:crypto';
import { CLINIC_TIME_ZONE } from '../src/shared/data/clinicSchedule.js';

const now = () => new Date().toISOString();
const asText = value => value == null ? '' : String(value).trim();
const amount = value => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
const validPhilippineMobile = value => /^(?:\+63|63|0)9\d{9}$/.test(String(value || '').replace(/[\s()-]/g, ''));
const validDateOnly = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
};
const allowedSex = new Set(['Male', 'Female', 'Prefer not to say']);
const allowedCivilStatuses = new Set(['Single', 'Married', 'Widowed', 'Separated', 'Prefer not to say']);
const required = (value, label) => {
  const text = asText(value);
  if (!text) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  return text;
};
const calculateAge = value => {
  if (!value) return null;
  const birth = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
};
const splitName = name => {
  const parts = asText(name).split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '' };
};
const parseJson = (value, fallback = {}) => {
  try { return JSON.parse(value || ''); } catch { return fallback; }
};
function patientFromRow(row) {
  if (!row) return null;
  const name = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ');
  return {
    id: row.patient_id, patientNumber: row.patient_number || '', name, firstName: row.first_name || '', lastName: row.last_name || '',
    phone: row.phone || '', email: row.email || '', dateOfBirth: row.date_of_birth || '', age: calculateAge(row.date_of_birth),
    gender: row.gender || '', civilStatus: row.civil_status || '', occupation: row.occupation || '', height: row.height ?? '', weight: row.weight ?? '',
    address: row.address || '', referredBy: row.referred_by || '', emergencyContactName: row.emergency_contact_name || '', emergencyContactRelationship: row.emergency_contact_relationship || '',
    emergencyContactPhone: row.emergency_contact_number || '', parentGuardianName: row.parent_guardian_name || '',
    parentGuardianRelationship: row.parent_guardian_relationship || '', parentGuardianPhone: row.parent_guardian_number || '',
    allergies: row.allergies || '', medications: row.medications || '', conditions: row.medical_conditions || '',
    seriousIllnesses: row.serious_illnesses || '', pregnancyStatus: row.pregnancy_status || '', mouthSoresGrowths: row.mouth_growths || '',
    medicalHistoryResponses: (() => { try { return JSON.parse(row.responses_json || 'null'); } catch { return null; } })(),
    notes: row.clinical_notes || row.notes || '', lastVisitDate: row.last_visit_date || '', status: row.status || 'active', isActive: row.status !== 'inactive', createdAt: row.created_at, updatedAt: row.updated_at || row.created_at,
  };
}
const patientSelect = `SELECT p.*, mh.allergies, mh.medications, mh.medical_conditions, mh.serious_illnesses, mh.pregnancy_status, mh.mouth_growths, mh.clinical_notes, mh.responses_json
  FROM patients p LEFT JOIN medical_history mh ON mh.patient_id=p.patient_id`;

async function listPatients(db) {
  return (await db.prepare(`${patientSelect}
    WHERE p.account_id IS NULL
      OR EXISTS (
        SELECT 1 FROM patient_accounts pa
        WHERE pa.account_id=p.account_id AND pa.email_verified_at IS NOT NULL
      )
      OR EXISTS (SELECT 1 FROM medical_history mh WHERE mh.patient_id=p.patient_id)
    ORDER BY p.created_at, p.full_name`).all()).map(patientFromRow);
}
async function insertMedicalHistory(db, patientId, record, timestamp) {
  (await db.prepare(`INSERT INTO medical_history (medical_history_id, patient_id, allergies, medications, medical_conditions, serious_illnesses, pregnancy_status, mouth_growths, clinical_notes, responses_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(patient_id) DO UPDATE SET allergies=excluded.allergies, medications=excluded.medications, medical_conditions=excluded.medical_conditions,
    serious_illnesses=excluded.serious_illnesses, pregnancy_status=excluded.pregnancy_status, mouth_growths=excluded.mouth_growths,
    clinical_notes=excluded.clinical_notes, responses_json=COALESCE(excluded.responses_json, medical_history.responses_json), updated_at=excluded.updated_at`).run(randomUUID(), patientId, asText(record.allergies) || null, asText(record.medications) || null,
    asText(record.conditions || record.medicalConditions) || null, asText(record.seriousIllnesses) || null, asText(record.pregnancyStatus) || null,
    asText(record.mouthSoresGrowths || record.mouthGrowths) || null, asText(record.notes || record.clinicalNotes) || null,
    record.responses && typeof record.responses === 'object' ? JSON.stringify(record.responses) : null, timestamp, timestamp));
}
async function medicalHistoryRows(db) {
  return (await db.prepare('SELECT * FROM medical_history ORDER BY created_at').all()).map(row => ({ id: row.medical_history_id, patientId: row.patient_id, allergies: row.allergies || '', medications: row.medications || '', conditions: row.medical_conditions || '',
    seriousIllnesses: row.serious_illnesses || '', pregnancyStatus: row.pregnancy_status || '', mouthSoresGrowths: row.mouth_growths || '', clinicalNotes: row.clinical_notes || '', createdAt: row.created_at, updatedAt: row.updated_at }));
}
async function saveMedicalHistory(db, input, id = null) {
  const recordId = asText(id);
  const linked = recordId && (await db.prepare('SELECT patient_id FROM medical_history WHERE medical_history_id=? OR patient_id=? LIMIT 1').get(recordId, recordId));
  const patientId = asText(input.patientId || linked?.patient_id || recordId);
  if (!patientId || !(await db.prepare('SELECT patient_id FROM patients WHERE patient_id=?').get(patientId))) throw Object.assign(new Error('Select an existing patient record.'), { status: 400 });
  const timestamp = now();
  (await insertMedicalHistory(db, patientId, input, timestamp));
  return (await medicalHistoryRows(db)).find(row => row.patientId === patientId);
}
async function patientNumber(db) {
  const rows = (await db.prepare("SELECT patient_number FROM patients WHERE patient_number LIKE 'PT-%'").all());
  const highest = rows.reduce((max, row) => Math.max(max, Number(String(row.patient_number).slice(3)) || 0), 0);
  return `PT-${String(highest + 1).padStart(4, '0')}`;
}
async function createPatient(db, input) {
  const name = required(input.name || input.fullName, 'Full name');
  const phone = required(input.phone || input.phoneNumber, 'Phone number');
  if (!validPhilippineMobile(phone)) throw Object.assign(new Error('Enter a valid Philippine mobile number.'), { status: 400 });
  const dateOfBirth = required(input.dateOfBirth, 'Date of birth');
  const gender = required(input.gender || input.sex, 'Sex');
  const civilStatus = required(input.civilStatus, 'Civil status');
  const address = required(input.address, 'Address');
  if (!validDateOnly(dateOfBirth)) throw Object.assign(new Error('Enter a valid date of birth.'), { status: 400 });
  if (!allowedSex.has(gender)) throw Object.assign(new Error('Choose a valid sex option.'), { status: 400 });
  if (!allowedCivilStatuses.has(civilStatus)) throw Object.assign(new Error('Choose a valid civil status option.'), { status: 400 });
  if (dateOfBirth > new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Date of birth cannot be in the future.'), { status: 400 });
  if (asText(input.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asText(input.email))) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  const age = calculateAge(dateOfBirth);
  const minor = age !== null && age <= 18;
  const married = age !== null && age >= 19 && civilStatus === 'Married';
  if (minor && (!asText(input.parentGuardianName) || !asText(input.parentGuardianRelationship) || !asText(input.parentGuardianPhone))) throw Object.assign(new Error('Complete all parent or guardian information for patients age 18 and below.'), { status: 400 });
  if (married && (!asText(input.emergencyContactName) || !asText(input.emergencyContactRelationship) || !asText(input.emergencyContactPhone))) throw Object.assign(new Error('Complete all emergency contact information for married patients.'), { status: 400 });
  if (minor && !validPhilippineMobile(input.parentGuardianPhone)) throw Object.assign(new Error('Enter a valid parent or guardian contact number.'), { status: 400 });
  if (input.emergencyContactPhone && !validPhilippineMobile(input.emergencyContactPhone)) throw Object.assign(new Error('Enter a valid emergency contact number.'), { status: 400 });
  const parsedHeight = input.height === 'None' || input.height === '' || input.height == null ? null : Number(input.height);
  const parsedWeight = input.weight === 'None' || input.weight === '' || input.weight == null ? null : Number(input.weight);
  if (parsedHeight !== null && (!Number.isFinite(parsedHeight) || parsedHeight < 0)) throw Object.assign(new Error('Height must be a non-negative number.'), { status: 400 });
  if (parsedWeight !== null && (!Number.isFinite(parsedWeight) || parsedWeight < 0)) throw Object.assign(new Error('Weight must be a non-negative number.'), { status: 400 });
  const email = asText(input.email) || null;
  const account = email ? (await db.prepare('SELECT account_id FROM patient_accounts WHERE lower(email)=lower(?)').get(email)) : null;
  const linkedPatient = account ? (await db.prepare('SELECT patient_id FROM patients WHERE account_id=?').get(account.account_id)) : null;
  if (linkedPatient) throw Object.assign(new Error('This email is already linked to a patient profile. Open the existing record to make changes.'), { status: 409 });
  const nameParts = splitName(name);
  const id = asText(input.id) || randomUUID();
  const code = asText(input.patientNumber) || (await patientNumber(db));
  const timestamp = now();
  const row = (await db.prepare(`INSERT INTO patients (patient_id, clinic_id, account_id, full_name, email, phone, date_of_birth, gender, address, notes, patient_number, first_name, last_name, age, civil_status, occupation, height, weight,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_number, parent_guardian_name, parent_guardian_relationship, parent_guardian_number, status, updated_at)
    VALUES (?, 'default-clinic', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING patient_id`).get(id, account?.account_id || null, name, email, phone, dateOfBirth, gender, address, asText(input.notes) || null, code, nameParts.firstName, nameParts.lastName, age, civilStatus,
    asText(input.occupation) || null, parsedHeight, parsedWeight, asText(input.emergencyContactName) || null, asText(input.emergencyContactRelationship) || null,
    asText(input.emergencyContactPhone) || null, asText(input.parentGuardianName) || null, asText(input.parentGuardianRelationship) || null, asText(input.parentGuardianPhone) || null, asText(input.status || 'active'), timestamp));
  if (account) (await db.prepare('UPDATE patient_accounts SET full_name=?, first_name=?, last_name=?, phone=?, date_of_birth=?, gender=?, address=? WHERE account_id=?')
    .run(name, nameParts.firstName, nameParts.lastName, phone, dateOfBirth, gender, address, account.account_id));
  (await insertMedicalHistory(db, row.patient_id, input, timestamp));
  return patientFromRow((await db.prepare(`${patientSelect} WHERE p.patient_id=?`).get(row.patient_id)));
}
async function importLegacyPatient(db, input, index) {
  const name = asText(input.name || input.fullName);
  if (!name) return null;
  const code = asText(input.patientNumber || input.patientCode || input.code) || `PT-${String(index + 1).padStart(4, '0')}`;
  const existing = (await db.prepare('SELECT patient_id FROM patients WHERE patient_id=? OR patient_number=? LIMIT 1').get(asText(input.id), code));
  if (existing) return existing.patient_id;
  const nameParts = splitName(name);
  const patientId = asText(input.id) || randomUUID();
  const timestamp = asText(input.createdAt) || now();
  const dateOfBirth = asText(input.dateOfBirth) || null;
  const age = calculateAge(dateOfBirth);
  const height = input.height === 'None' || input.height === '' || input.height == null ? null : Number(input.height);
  const weight = input.weight === 'None' || input.weight === '' || input.weight == null ? null : Number(input.weight);
  (await db.prepare(`INSERT INTO patients (patient_id, clinic_id, account_id, full_name, email, phone, date_of_birth, gender, address, notes, patient_number, first_name, last_name, age, civil_status, occupation, height, weight,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_number, parent_guardian_name, parent_guardian_relationship, parent_guardian_number, status, updated_at)
    VALUES (?, 'default-clinic', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(patientId, name, asText(input.email) || null, asText(input.phone || input.phoneNumber) || null, dateOfBirth, asText(input.gender || input.sex) || null, asText(input.address) || null,
      asText(input.notes) || null, code, nameParts.firstName, nameParts.lastName, age, asText(input.civilStatus) || null, asText(input.occupation) || null,
      Number.isFinite(height) ? height : null, Number.isFinite(weight) ? weight : null, asText(input.emergencyContactName) || null,
      asText(input.emergencyContactRelationship) || null, asText(input.emergencyContactPhone || input.emergencyContactNumber) || null, asText(input.parentGuardianName) || null,
      asText(input.parentGuardianRelationship) || null, asText(input.parentGuardianPhone || input.parentGuardianNumber) || null, asText(input.status || 'active'), timestamp));
  (await insertMedicalHistory(db, patientId, input, timestamp));
  return patientId;
}
async function updatePatient(db, id, input) {
  const existing = (await db.prepare(`${patientSelect} WHERE p.patient_id=?`).get(id));
  if (!existing) throw Object.assign(new Error('Patient record not found.'), { status: 404 });
  const current = patientFromRow(existing);
  const values = { ...current, ...input };
  const name = required(values.name, 'Full name');
  const phone = required(values.phone, 'Phone number');
  if (!validPhilippineMobile(phone)) throw Object.assign(new Error('Enter a valid Philippine mobile number.'), { status: 400 });
  const dateOfBirth = required(values.dateOfBirth, 'Date of birth');
  const gender = required(values.gender || values.sex, 'Sex');
  const civilStatus = required(values.civilStatus, 'Civil status');
  const address = required(values.address, 'Address');
  if (!validDateOnly(dateOfBirth)) throw Object.assign(new Error('Enter a valid date of birth.'), { status: 400 });
  if (!allowedSex.has(gender)) throw Object.assign(new Error('Choose a valid sex option.'), { status: 400 });
  if (!allowedCivilStatuses.has(civilStatus)) throw Object.assign(new Error('Choose a valid civil status option.'), { status: 400 });
  if (dateOfBirth > new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Date of birth cannot be in the future.'), { status: 400 });
  if (asText(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asText(values.email))) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  const age = calculateAge(dateOfBirth);
  const minor = age !== null && age <= 18;
  const married = age !== null && age >= 19 && civilStatus === 'Married';
  if (minor && (!asText(values.parentGuardianName) || !asText(values.parentGuardianRelationship) || !asText(values.parentGuardianPhone))) throw Object.assign(new Error('Complete all parent or guardian information for patients age 18 and below.'), { status: 400 });
  if (married && (!asText(values.emergencyContactName) || !asText(values.emergencyContactRelationship) || !asText(values.emergencyContactPhone))) throw Object.assign(new Error('Complete all emergency contact information for married patients.'), { status: 400 });
  if (minor && !validPhilippineMobile(values.parentGuardianPhone)) throw Object.assign(new Error('Enter a valid parent or guardian contact number.'), { status: 400 });
  if (values.emergencyContactPhone && !validPhilippineMobile(values.emergencyContactPhone)) throw Object.assign(new Error('Enter a valid emergency contact number.'), { status: 400 });
  const height = values.height === 'None' || values.height === '' || values.height == null ? null : Number(values.height);
  const weight = values.weight === 'None' || values.weight === '' || values.weight == null ? null : Number(values.weight);
  if (height !== null && (!Number.isFinite(height) || height < 0)) throw Object.assign(new Error('Height must be a non-negative number.'), { status: 400 });
  if (weight !== null && (!Number.isFinite(weight) || weight < 0)) throw Object.assign(new Error('Weight must be a non-negative number.'), { status: 400 });
  const parts = splitName(name);
  const timestamp = now();
  (await db.prepare(`UPDATE patients SET full_name=?, first_name=?, last_name=?, email=?, phone=?, date_of_birth=?, age=?, gender=?, civil_status=?, occupation=?, height=?, weight=?, address=?,
    emergency_contact_name=?, emergency_contact_relationship=?, emergency_contact_number=?, parent_guardian_name=?, parent_guardian_relationship=?, parent_guardian_number=?, notes=?, status=?, updated_at=? WHERE patient_id=?`)
    .run(name, parts.firstName, parts.lastName, asText(values.email) || null, phone, dateOfBirth, age, gender, civilStatus, asText(values.occupation) || null, height, weight, address,
      asText(values.emergencyContactName) || null, asText(values.emergencyContactRelationship) || null, asText(values.emergencyContactPhone) || null,
      asText(values.parentGuardianName) || null, asText(values.parentGuardianRelationship) || null, asText(values.parentGuardianPhone) || null, asText(values.notes) || null, asText(values.status || 'active'), timestamp, id));
  if (existing.account_id) {
    (await db.prepare('UPDATE patient_accounts SET full_name=?, email=?, phone=?, date_of_birth=?, gender=?, address=? WHERE account_id=?').run(name, asText(values.email) || existing.email, phone, dateOfBirth, gender, address, existing.account_id));
  }
  (await insertMedicalHistory(db, id, values, timestamp));
  return patientFromRow((await db.prepare(`${patientSelect} WHERE p.patient_id=?`).get(id)));
}

function appointmentClinicParts(startsAt) {
  const starts = String(startsAt || '');
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(starts)) return { date: starts.slice(0, 10), time: starts.slice(11, 16) };
  const instant = new Date(starts);
  if (!Number.isFinite(instant.getTime())) return { date: starts.slice(0, 10), time: starts.slice(11, 16) };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
function appointmentFromRow(row) {
  const starts = row.starts_at || '';
  const clinicDateTime = appointmentClinicParts(starts);
  return { id: row.appointment_id, patientId: row.patient_id || '', patient: row.patient_name || row.patient_name_snapshot || '', date: clinicDateTime.date || row.appointment_date || '', time: clinicDateTime.time || row.appointment_time || '', startsAt: starts,
    service: row.treatment_type || row.service || '', treatmentType: row.treatment_type || row.service || '', visitSource: 'Appointment', provider: row.provider || '', status: String(row.status || 'scheduled').replace(/^./, c => c.toUpperCase()), notes: row.notes || '',
    reminderMethod: row.reminder_method || '', createdAt: row.created_at, updatedAt: row.updated_at || row.created_at };
}
async function listAppointments(db, patientId = null) {
  const rows = patientId
    ? (await db.prepare('SELECT a.*, p.full_name AS patient_name FROM appointments a LEFT JOIN patients p ON p.patient_id=a.patient_id WHERE a.patient_id=? ORDER BY a.starts_at').all(patientId))
    : (await db.prepare('SELECT a.*, p.full_name AS patient_name FROM appointments a LEFT JOIN patients p ON p.patient_id=a.patient_id ORDER BY a.starts_at').all());
  return rows.map(appointmentFromRow);
}
function visitFromRow(row) {
  return { id: row.visit_id, patientId: row.patient_id || '', patient: row.patient_name || row.patient_name_snapshot || '', patientNumber: row.patient_number || '',
    service: row.treatment_type || '', treatmentType: row.treatment_type || '', date: row.visit_date || '', status: 'Completed',
    visitSource: row.visit_source || row.visit_type || 'Walk-In', visitType: row.visit_source || row.visit_type || 'Walk-In',
    type: row.visit_source || row.visit_type || 'Walk-In', notes: row.clinical_notes || '', clinicalNotes: row.clinical_notes || '',
    createdAt: row.created_at || '', updatedAt: row.updated_at || row.created_at || '' };
}
async function listVisits(db, patientId = null) {
  const rows = patientId
    ? (await db.prepare('SELECT v.*, p.full_name AS patient_name, p.patient_number FROM visits v LEFT JOIN patients p ON p.patient_id=v.patient_id WHERE v.patient_id=? ORDER BY v.visit_date DESC, v.created_at DESC').all(patientId))
    : (await db.prepare('SELECT v.*, p.full_name AS patient_name, p.patient_number FROM visits v LEFT JOIN patients p ON p.patient_id=v.patient_id ORDER BY v.visit_date DESC, v.created_at DESC').all());
  return rows.map(visitFromRow);
}
async function resolvePatientId(db, input) {
  const id = asText(input.patientId || input.patient_id);
  if (id && (await db.prepare('SELECT patient_id FROM patients WHERE patient_id=?').get(id))) return id;
  const name = asText(input.patient || input.patientName);
  if (name) {
    const found = (await db.prepare('SELECT patient_id FROM patients WHERE lower(full_name)=lower(?) ORDER BY created_at LIMIT 1').get(name));
    if (found) return found.patient_id;
  }
  throw Object.assign(new Error('Select a patient record for this item.'), { status: 400 });
}
function clinicDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
async function createVisit(db, input) {
  const patientId = (await resolvePatientId(db, { patientId: required(input.patientId || input.patient_id, 'Patient') }));
  const service = required(input.service || input.treatmentType || input.treatment_type, 'Treatment or service');
  const validTreatments = ['Consultation', 'Routine Cleaning', 'Tooth Extraction', 'Root Canal Therapy', 'Teeth Whitening', 'Braces Adjustment', 'Crown & Bridge', 'Dentures', 'Other'];
  if (!validTreatments.includes(service)) throw Object.assign(new Error('Choose a valid treatment or service.'), { status: 400 });
  const date = required(input.visitDate || input.date, 'Visit date');
  if (!validDateOnly(date)) throw Object.assign(new Error('Enter a valid visit date.'), { status: 400 });
  if (date > clinicDateKey()) throw Object.assign(new Error('Visit date cannot be in the future.'), { status: 400 });
  const patient = (await db.prepare('SELECT full_name, patient_number FROM patients WHERE patient_id=?').get(patientId));
  if (!patient) throw Object.assign(new Error('Select an existing patient record.'), { status: 400 });
  const visitSource = asText(input.visitSource || input.visit_source || input.visitType || input.visit_type || 'Walk-In');
  if (!['Walk-In', 'Appointment'].includes(visitSource)) throw Object.assign(new Error('Choose Walk-In or Appointment as the visit source.'), { status: 400 });
  const notes = asText(input.clinicalNotes ?? input.notes) || null;
  const createdAt = now();
  const inserted = await db.prepare(`INSERT INTO visits (clinic_id, patient_id, patient_name_snapshot, treatment_type, visit_date, visit_source, clinical_notes, created_at, updated_at)
    VALUES ('default-clinic', ?, ?, ?, ?, ?, ?, ?, ?) RETURNING visit_id`).get(patientId, patient.full_name, service, date, visitSource, notes, createdAt, createdAt);
  const id = Number(inserted.visit_id);
  (await db.prepare(`UPDATE patients SET last_visit_date=CASE
    WHEN last_visit_date IS NULL OR last_visit_date < ? THEN ? ELSE last_visit_date END, updated_at=? WHERE patient_id=?`)
    .run(date, date, createdAt, patientId));
  return visitFromRow((await db.prepare('SELECT v.*, p.full_name AS patient_name, p.patient_number FROM visits v LEFT JOIN patients p ON p.patient_id=v.patient_id WHERE v.visit_id=?').get(id)));
}
async function createAppointment(db, input, { allowOrphan = false } = {}) {
  const patientId = allowOrphan && !asText(input.patientId || input.patient_id) ? null : (await resolvePatientId(db, input));
  const service = required(input.service || input.treatmentType || input.treatment_type, 'Treatment type');
  const startsAt = asText(input.startsAt) || (asText(input.date) ? `${asText(input.date)}T${asText(input.time) || '09:00'}` : '');
  if (!startsAt || !Number.isFinite(Date.parse(startsAt))) throw Object.assign(new Error('Enter a valid appointment date and time.'), { status: 400 });
  const id = asText(input.id) || randomUUID();
  const status = asText(input.status || 'Scheduled').toLowerCase();
  if (!['scheduled', 'confirmed', 'completed', 'cancelled'].includes(status)) throw Object.assign(new Error('Choose a valid appointment status.'), { status: 400 });
  const timestamp = now();
  const patientName = patientId ? (await db.prepare('SELECT full_name FROM patients WHERE patient_id=?').get(patientId))?.full_name : asText(input.patient || input.patientName);
  if (!patientName) throw Object.assign(new Error('Select a patient record for this appointment.'), { status: 400 });
  const row = (await db.prepare(`INSERT INTO appointments (appointment_id, clinic_id, patient_id, starts_at, service, provider, status, notes, reminder_method, updated_at, treatment_type, appointment_date, appointment_time, patient_name_snapshot)
    VALUES (?, 'default-clinic', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING appointment_id`).get(id, patientId, startsAt, service, asText(input.provider) || null, status,
    asText(input.notes) || null, asText(input.reminderMethod || input.reminder_method) || null, timestamp, service, startsAt.slice(0, 10), startsAt.slice(11, 16), patientName));
  return appointmentFromRow((await db.prepare('SELECT a.*, p.full_name AS patient_name FROM appointments a LEFT JOIN patients p ON p.patient_id=a.patient_id WHERE a.appointment_id=?').get(row.appointment_id)));
}
async function updateAppointment(db, id, input) {
  const old = (await db.prepare('SELECT * FROM appointments WHERE appointment_id=?').get(id));
  if (!old) throw Object.assign(new Error('Appointment not found.'), { status: 404 });
  const patientId = input.patientId || input.patient ? (await resolvePatientId(db, input)) : old.patient_id;
  const status = asText(input.status || old.status).toLowerCase();
  if (!['scheduled', 'confirmed', 'completed', 'cancelled'].includes(status)) throw Object.assign(new Error('Choose a valid appointment status.'), { status: 400 });
  const startsAt = asText(input.startsAt) || (input.date ? `${input.date}T${input.time || '09:00'}` : old.starts_at);
  if (!Number.isFinite(Date.parse(startsAt))) throw Object.assign(new Error('Enter a valid appointment date and time.'), { status: 400 });
  const service = asText(input.service || input.treatmentType || old.treatment_type || old.service);
  const patientName = patientId ? (await db.prepare('SELECT full_name FROM patients WHERE patient_id=?').get(patientId))?.full_name || old.patient_name_snapshot : old.patient_name_snapshot;
  (await db.prepare('UPDATE appointments SET patient_id=?, starts_at=?, service=?, provider=?, status=?, notes=?, reminder_method=?, updated_at=?, treatment_type=?, appointment_date=?, appointment_time=?, patient_name_snapshot=? WHERE appointment_id=?')
    .run(patientId, startsAt, service, asText(input.provider ?? old.provider) || null, status,
      asText(input.notes ?? old.notes) || null, asText(input.reminderMethod ?? old.reminder_method) || null, now(), service, startsAt.slice(0, 10), startsAt.slice(11, 16), patientName, id));
  return appointmentFromRow((await db.prepare('SELECT a.*, p.full_name AS patient_name FROM appointments a LEFT JOIN patients p ON p.patient_id=a.patient_id WHERE a.appointment_id=?').get(id)));
}

function messageFromRow(row) {
  return { id: row.message_id, conversationId: row.conversation_id || '', patientId: row.patient_id || '', patient: row.patient_name || row.patient_label || row.conversation_patient_name || '', patientNumber: row.patient_number || row.patient_number_snapshot || '',
    senderId: row.sender_id || '', readAt: row.read_at || '',
    subject: row.subject ?? row.conversation_subject ?? '', message: row.message_content || row.body || '', messageType: row.message_type || '', sendVia: row.delivery_method || '',
    direction: row.sender_type === 'staff' ? 'sent' : 'received', isRead: Boolean(row.is_read), archived: Boolean(row.is_archived), archivedAt: row.archived_at || '',
    archivedRead: row.archived_read == null ? undefined : Boolean(row.archived_read), trashed: Boolean(row.is_trashed), isDraft: Boolean(row.is_draft), status: row.status || '', createdAt: row.created_at, updatedAt: row.updated_at || row.created_at };
}
const messageSelect = `SELECT m.*, c.subject AS conversation_subject, c.patient_name_snapshot AS conversation_patient_name, p.full_name AS patient_name, p.patient_number
  FROM messages m LEFT JOIN conversations c ON c.conversation_id=m.conversation_id LEFT JOIN patients p ON p.patient_id=m.patient_id`;
async function listMessages(db, patientId = null) {
  const rows = patientId ? (await db.prepare(`${messageSelect} WHERE m.patient_id=? ORDER BY m.created_at`).all(patientId)) : (await db.prepare(`${messageSelect} ORDER BY m.created_at`).all());
  return rows.map(messageFromRow);
}
async function createMessage(db, input, { allowOrphan = false } = {}) {
  const patientId = allowOrphan && !asText(input.patientId || input.patient_id) ? null : (await resolvePatientId(db, input));
  const sender = input.direction === 'sent' || input.senderType === 'staff' ? 'staff' : 'patient';
  const isDraft = Boolean(input.isDraft);
  const message = input.isDraft ? asText(input.message || input.messageContent || input.body) : required(input.message || input.messageContent || input.body, 'Message content');
  const subject = isDraft ? asText(input.subject) : sender === 'staff' ? required(input.subject, 'Subject') : asText(input.subject) || 'Patient message';
  const messageType = sender === 'staff' && !isDraft ? required(input.messageType, 'Message type') : asText(input.messageType) || (sender === 'staff' ? null : 'Patient Portal');
  const deliveryMethod = sender === 'staff' && !isDraft ? required(input.sendVia || input.deliveryMethod, 'Delivery method') : asText(input.sendVia || input.deliveryMethod) || (sender === 'staff' ? null : 'Patient Portal');
  const patient = patientId ? (await db.prepare('SELECT full_name, patient_number FROM patients WHERE patient_id=?').get(patientId)) : null;
  const patientName = patient?.full_name || asText(input.patient || input.patientName);
  const patientNumber = patient?.patient_number || asText(input.patientNumber) || null;
  if (!patientName) throw Object.assign(new Error('Select a patient record for this message.'), { status: 400 });
  const id = asText(input.id) || randomUUID();
  const timestamp = asText(input.createdAt) || now();
  let conversation = patientId
    ? (await db.prepare('SELECT conversation_id FROM conversations WHERE patient_id=? ORDER BY created_at DESC LIMIT 1').get(patientId))
    : (await db.prepare('SELECT conversation_id FROM conversations WHERE patient_id IS NULL AND patient_name_snapshot=? ORDER BY created_at DESC LIMIT 1').get(patientName));
  if (!conversation) conversation = (await db.prepare('INSERT INTO conversations (conversation_id, clinic_id, patient_id, subject, patient_name_snapshot) VALUES (?, ?, ?, ?, ?) RETURNING conversation_id').get(randomUUID(), 'default-clinic', patientId, subject || 'Patient message', patientName));
  const isRead = input.isRead === undefined ? 0 : Number(Boolean(input.isRead));
  (await db.prepare(`INSERT INTO messages (message_id, conversation_id, sender_type, sender_id, body, created_at, patient_id, message_type, subject, message_content, delivery_method, status, is_read, read_at, is_archived, archived_at, archived_read, is_trashed, is_draft, patient_label, patient_number_snapshot, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, conversation.conversation_id, sender, asText(input.senderId || input.accountId) || null, message, timestamp, patientId, messageType, subject, message, deliveryMethod,
      asText(input.status || (isDraft ? 'draft' : 'sent')), isRead, isRead ? timestamp : null, Number(Boolean(input.archived)),
      asText(input.archivedAt) || null, input.archivedRead == null ? null : Number(Boolean(input.archivedRead)), Number(Boolean(input.trashed)), Number(isDraft), asText(input.patient) || patientName, patientNumber, timestamp));
  (await db.prepare("UPDATE conversations SET subject=?, patient_name_snapshot=?, updated_at=?, status='open' WHERE conversation_id=?").run(subject || 'Patient message', patientName, timestamp, conversation.conversation_id));
  return messageFromRow((await db.prepare(`${messageSelect} WHERE m.message_id=?`).get(id)));
}
async function updateMessage(db, id, input) {
  const old = (await db.prepare(`${messageSelect} WHERE m.message_id=?`).get(id));
  if (!old) throw Object.assign(new Error('Message not found.'), { status: 404 });
  const existing = messageFromRow(old);
  const next = { ...existing, ...input };
  const patientId = (await resolvePatientId(db, next));
  const message = next.isDraft ? asText(next.message) : required(next.message, 'Message content');
  const sender = next.direction === 'sent' ? 'staff' : 'patient';
  const subject = next.isDraft ? asText(next.subject) : sender === 'staff' ? required(next.subject, 'Subject') : asText(next.subject) || 'Patient message';
  const messageType = sender === 'staff' && !next.isDraft ? required(next.messageType, 'Message type') : asText(next.messageType) || (sender === 'staff' ? null : 'Patient Portal');
  const deliveryMethod = sender === 'staff' && !next.isDraft ? required(next.sendVia || next.deliveryMethod, 'Delivery method') : asText(next.sendVia || next.deliveryMethod) || (sender === 'staff' ? null : 'Patient Portal');
  let conversationId = old.conversation_id;
  const patient = (await db.prepare('SELECT full_name, patient_number FROM patients WHERE patient_id=?').get(patientId));
  const patientName = patient.full_name;
  if (patientId !== old.patient_id) {
    let conversation = (await db.prepare('SELECT conversation_id FROM conversations WHERE patient_id=? ORDER BY created_at DESC LIMIT 1').get(patientId));
    if (!conversation) conversation = (await db.prepare('INSERT INTO conversations (conversation_id, clinic_id, patient_id, subject, patient_name_snapshot) VALUES (?, ?, ?, ?, ?) RETURNING conversation_id').get(randomUUID(), 'default-clinic', patientId, asText(next.subject) || 'Patient message', patientName));
    conversationId = conversation.conversation_id;
  }
  (await db.prepare(`UPDATE messages SET conversation_id=?, patient_id=?, sender_type=?, sender_id=?, body=?, subject=?, message_content=?, message_type=?, delivery_method=?, status=?, is_read=?, read_at=?, is_archived=?, archived_at=?, archived_read=?, is_trashed=?, is_draft=?, patient_label=?, patient_number_snapshot=?, updated_at=? WHERE message_id=?`)
    .run(conversationId, patientId, sender, asText(next.senderId) || (sender === 'staff' ? null : existing.senderId) || null, message, subject, message, messageType, deliveryMethod, asText(next.status || (next.isDraft ? 'draft' : 'sent')),
      Number(Boolean(next.isRead)), next.isRead ? now() : null, Number(Boolean(next.archived)), asText(next.archivedAt) || null,
      next.archivedRead == null ? null : Number(Boolean(next.archivedRead)), Number(Boolean(next.trashed)), Number(Boolean(next.isDraft)), patientName, patient.patient_number || asText(next.patientNumber) || null, now(), id));
  if (subject) (await db.prepare("UPDATE conversations SET subject=?, patient_name_snapshot=?, updated_at=?, status='open' WHERE conversation_id=?").run(subject, patientName, now(), conversationId));
  return messageFromRow((await db.prepare(`${messageSelect} WHERE m.message_id=?`).get(id)));
}
function notificationFromRow(row) {
  return { id: row.notification_id, patientId: row.patient_id || '', patient: row.patient_name_snapshot || '', patientNumber: row.patient_number_snapshot || '', title: row.title, message: row.message, type: row.notification_type,
    read: Boolean(row.is_read), archived: Boolean(row.is_archived), archivedAt: row.archive_date || '', archivedRead: row.archived_read == null ? undefined : Boolean(row.archived_read), createdAt: row.created_at };
}
async function listNotifications(db, patientId = undefined) {
  const rows = patientId === undefined ? (await db.prepare('SELECT * FROM notifications ORDER BY created_at DESC').all())
    : (await db.prepare('SELECT * FROM notifications WHERE patient_id=? ORDER BY created_at DESC').all(patientId));
  return rows.map(notificationFromRow);
}
async function createNotification(db, input) {
  const id = asText(input.id) || randomUUID();
  const title = required(input.title, 'Notification title');
  const message = required(input.message, 'Notification message');
  const patientId = asText(input.patientId) || null;
  const patient = patientId ? (await db.prepare('SELECT full_name, patient_number FROM patients WHERE patient_id=?').get(patientId)) : null;
  if (patientId && !patient) throw Object.assign(new Error('Patient record not found.'), { status: 400 });
  (await db.prepare('INSERT INTO notifications (notification_id, patient_id, patient_name_snapshot, patient_number_snapshot, title, message, notification_type, is_read, is_archived, archive_date, archived_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, patientId, patient?.full_name || asText(input.patient) || null, patient?.patient_number || asText(input.patientNumber) || null, title, message, asText(input.type || input.notificationType) || 'update', Number(Boolean(input.read)), Number(Boolean(input.archived)), asText(input.archivedAt) || null,
      input.archivedRead == null ? null : Number(Boolean(input.archivedRead)), asText(input.createdAt) || now()));
  return notificationFromRow((await db.prepare('SELECT * FROM notifications WHERE notification_id=?').get(id)));
}
async function updateNotification(db, id, input) {
  const row = (await db.prepare('SELECT * FROM notifications WHERE notification_id=?').get(id));
  if (!row) throw Object.assign(new Error('Notification not found.'), { status: 404 });
  const old = notificationFromRow(row);
  const next = { ...old, ...input };
  (await db.prepare('UPDATE notifications SET title=?, message=?, notification_type=?, is_read=?, is_archived=?, archive_date=?, archived_read=? WHERE notification_id=?')
    .run(required(next.title, 'Notification title'), required(next.message, 'Notification message'), asText(next.type || 'update'), Number(Boolean(next.read)), Number(Boolean(next.archived)), asText(next.archivedAt) || null,
      next.archivedRead == null ? null : Number(Boolean(next.archivedRead)), id));
  return notificationFromRow((await db.prepare('SELECT * FROM notifications WHERE notification_id=?').get(id)));
}

function receiptFromRow(row) { return { id: row.receipt_id, receiptNumber: row.receipt_number, amount: Number(row.amount_paid), paymentMethod: row.payment_method, paymentDate: row.payment_date, createdAt: row.created_at }; }
async function invoiceFromRow(db, row) {
  if (!row) return null;
  const receipts = (await db.prepare('SELECT * FROM receipts WHERE invoice_id=? ORDER BY payment_date, created_at').all(row.invoice_id)).map(receiptFromRow);
  const total = row.total_amount == null ? Number(row.amount_cents || 0) / 100 : Number(row.total_amount);
  const paid = row.amount_paid == null ? receipts.reduce((sum, receipt) => sum + receipt.amount, 0) : Number(row.amount_paid);
  return { id: row.invoice_id, invoiceNumber: row.invoice_number || '', patientId: row.patient_id || '', patient: row.patient_name || row.patient_name_snapshot || '', patientNumber: row.patient_number || row.patient_number_snapshot || '',
    treatment: row.treatment_name || row.description || '', totalAmount: total, amountPaid: paid, remainingBalance: row.remaining_balance == null ? Math.max(0, total - paid) : Number(row.remaining_balance),
    status: row.payment_status || (row.status === 'paid' ? 'Paid' : row.status === 'void' ? 'Void' : paid ? 'Partial Payment' : 'Unpaid'), paymentStatus: row.payment_status || '',
    paymentMethod: row.payment_method || receipts.at(-1)?.paymentMethod || '', paymentDate: row.payment_date || receipts.at(-1)?.paymentDate || '', receiptNumber: receipts.at(-1)?.receiptNumber || '',
    paymentHistory: receipts, invoiceDate: row.invoice_date || row.created_at?.slice(0, 10) || '', dueDate: row.due_date || '', notes: row.description || '', createdAt: row.created_at, updatedAt: row.updated_at || row.created_at };
}
const invoiceSelect = `SELECT i.*, p.full_name AS patient_name, p.patient_number FROM invoices i LEFT JOIN patients p ON p.patient_id=i.patient_id`;
async function listInvoices(db, patientId = null) {
  const rows = patientId ? (await db.prepare(`${invoiceSelect} WHERE i.patient_id=? ORDER BY i.created_at DESC`).all(patientId)) : (await db.prepare(`${invoiceSelect} ORDER BY i.created_at DESC`).all());
  return Promise.all(rows.map(async row => (await invoiceFromRow(db, row))));
}
async function createInvoice(db, input, { allowOrphan = false } = {}) {
  const patientId = allowOrphan && !asText(input.patientId || input.patient_id) ? null : (await resolvePatientId(db, input));
  const treatment = required(input.treatment || input.treatmentName, 'Treatment');
  const total = amount(input.totalAmount ?? input.amount);
  if (total <= 0) throw Object.assign(new Error('Invoice amount must be greater than zero.'), { status: 400 });
  const id = asText(input.id) || randomUUID();
  const number = required(input.invoiceNumber || input.number, 'Invoice number');
  const paymentStatus = asText(input.status || input.paymentStatus || 'Unpaid');
  const timestamp = asText(input.createdAt) || now();
  const patient = patientId ? (await db.prepare('SELECT full_name, patient_number FROM patients WHERE patient_id=?').get(patientId)) : null;
  const patientName = patient?.full_name || asText(input.patient || input.patientName);
  if (!patientName) throw Object.assign(new Error('Select a patient record for this invoice.'), { status: 400 });
  (await db.prepare(`INSERT INTO invoices (invoice_id, clinic_id, patient_id, amount_cents, currency, description, status, due_date, invoice_number, treatment_name, total_amount, amount_paid, remaining_balance, payment_status, payment_method, invoice_date, payment_date, patient_name_snapshot, patient_number_snapshot, updated_at)
    VALUES (?, 'default-clinic', ?, ?, 'PHP', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, patientId, Math.round(total * 100), asText(input.notes) || treatment, paymentStatus.toLowerCase() === 'paid' ? 'paid' : paymentStatus.toLowerCase() === 'void' ? 'void' : 'unpaid', asText(input.dueDate) || null, number, treatment, total,
      amount(input.amountPaid), input.remainingBalance == null ? total - amount(input.amountPaid) : amount(input.remainingBalance), paymentStatus, asText(input.paymentMethod) || null,
      asText(input.invoiceDate) || timestamp.slice(0, 10), asText(input.paymentDate) || null, patientName, patient?.patient_number || asText(input.patientNumber) || null, timestamp));
  for (const payment of Array.isArray(input.paymentHistory) ? input.paymentHistory : []) (await createReceipt(db, id, payment));
  return (await invoiceFromRow(db, (await db.prepare(`${invoiceSelect} WHERE i.invoice_id=?`).get(id))));
}
async function updateInvoice(db, id, input) {
  const oldRow = (await db.prepare(`${invoiceSelect} WHERE i.invoice_id=?`).get(id));
  if (!oldRow) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
  const old = (await invoiceFromRow(db, oldRow));
  const next = { ...old, ...input };
  const treatment = required(next.treatment, 'Treatment');
  const total = amount(next.totalAmount);
  if (total <= 0) throw Object.assign(new Error('Invoice amount must be greater than zero.'), { status: 400 });
  const paid = amount(next.amountPaid);
  const status = asText(next.status || 'Unpaid');
  const patientId = next.patientId || old.patientId || null;
  const patient = patientId ? (await db.prepare('SELECT full_name, patient_number FROM patients WHERE patient_id=?').get(patientId)) : null;
  (await db.prepare('UPDATE invoices SET patient_id=?, amount_cents=?, description=?, status=?, due_date=?, invoice_number=?, treatment_name=?, total_amount=?, amount_paid=?, remaining_balance=?, payment_status=?, payment_method=?, invoice_date=?, payment_date=?, patient_name_snapshot=?, patient_number_snapshot=?, updated_at=? WHERE invoice_id=?')
    .run(patientId, Math.round(total * 100), asText(next.notes) || treatment, status.toLowerCase() === 'paid' ? 'paid' : status.toLowerCase() === 'void' ? 'void' : 'unpaid', asText(next.dueDate) || null,
      required(next.invoiceNumber, 'Invoice number'), treatment, total, paid, Math.max(0, total - paid), status, asText(next.paymentMethod) || null, asText(next.invoiceDate) || null, asText(next.paymentDate) || null,
      patient?.full_name || asText(next.patient) || old.patient, patient?.patient_number || asText(next.patientNumber) || old.patientNumber || null, now(), id));
  return (await invoiceFromRow(db, (await db.prepare(`${invoiceSelect} WHERE i.invoice_id=?`).get(id))));
}
async function createReceipt(db, invoiceId, input) {
  const receiptNumber = required(input.receiptNumber || input.number, 'Receipt number');
  const paid = amount(input.amount);
  if (paid <= 0) throw Object.assign(new Error('Payment amount must be greater than zero.'), { status: 400 });
  const method = required(input.paymentMethod, 'Payment method');
  const date = required(input.paymentDate, 'Payment date');
  const id = asText(input.id) || randomUUID();
  (await db.prepare('INSERT INTO receipts (receipt_id, invoice_id, receipt_number, amount_paid, payment_method, payment_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, invoiceId, receiptNumber, paid, method, date, asText(input.createdAt) || now()));
  return receiptFromRow((await db.prepare('SELECT * FROM receipts WHERE receipt_id=?').get(id)));
}
async function recordPayment(db, invoiceId, payment) {
  const old = (await db.prepare('SELECT * FROM invoices WHERE invoice_id=?').get(invoiceId));
  if (!old) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
  const total = old.total_amount == null ? Number(old.amount_cents || 0) / 100 : Number(old.total_amount);
  const paid = Number(old.amount_paid) || (await db.prepare('SELECT COALESCE(SUM(amount_paid), 0) AS total FROM receipts WHERE invoice_id=?').get(invoiceId)).total;
  const received = amount(payment.amount);
  if (received <= 0 || received > total - paid) throw Object.assign(new Error('Enter a payment within the remaining balance.'), { status: 400 });
  const receipt = (await createReceipt(db, invoiceId, payment));
  const newPaid = Math.round((paid + received) * 100) / 100;
  const balance = Math.max(0, Math.round((total - newPaid) * 100) / 100);
  const status = balance === 0 ? 'Paid' : 'Partial Payment';
  (await db.prepare('UPDATE invoices SET amount_paid=?, remaining_balance=?, payment_status=?, payment_method=?, payment_date=?, status=?, updated_at=? WHERE invoice_id=?')
    .run(newPaid, balance, status, payment.paymentMethod, payment.paymentDate, balance === 0 ? 'paid' : 'unpaid', now(), invoiceId));
  return { invoice: (await invoiceFromRow(db, (await db.prepare(`${invoiceSelect} WHERE i.invoice_id=?`).get(invoiceId)))), receipt };
}
async function recalculateInvoiceFromReceipts(db, invoiceId) {
  const invoice = (await db.prepare('SELECT * FROM invoices WHERE invoice_id=?').get(invoiceId));
  if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
  const total = invoice.total_amount == null ? Number(invoice.amount_cents || 0) / 100 : Number(invoice.total_amount);
  const paid = Number((await db.prepare('SELECT COALESCE(SUM(amount_paid), 0) AS total FROM receipts WHERE invoice_id=?').get(invoiceId)).total);
  const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
  const status = remaining === 0 ? 'Paid' : paid > 0 ? 'Partial Payment' : 'Unpaid';
  const latest = (await db.prepare('SELECT payment_method, payment_date FROM receipts WHERE invoice_id=? ORDER BY payment_date DESC, created_at DESC LIMIT 1').get(invoiceId));
  (await db.prepare('UPDATE invoices SET amount_paid=?, remaining_balance=?, payment_status=?, payment_method=?, payment_date=?, status=?, updated_at=? WHERE invoice_id=?')
    .run(paid, remaining, status, latest?.payment_method || null, latest?.payment_date || null, status === 'Paid' ? 'paid' : 'unpaid', now(), invoiceId));
}
async function updateReceipt(db, id, input) {
  const old = (await db.prepare('SELECT * FROM receipts WHERE receipt_id=?').get(id));
  if (!old) throw Object.assign(new Error('Receipt not found.'), { status: 404 });
  const receiptNumber = required(input.receiptNumber ?? old.receipt_number, 'Receipt number');
  const paid = amount(input.amount ?? old.amount_paid);
  if (paid <= 0) throw Object.assign(new Error('Payment amount must be greater than zero.'), { status: 400 });
  const method = required(input.paymentMethod ?? old.payment_method, 'Payment method');
  const date = required(input.paymentDate ?? old.payment_date, 'Payment date');
  (await db.prepare('UPDATE receipts SET receipt_number=?, amount_paid=?, payment_method=?, payment_date=? WHERE receipt_id=?').run(receiptNumber, paid, method, date, id));
  (await recalculateInvoiceFromReceipts(db, old.invoice_id));
  return receiptFromRow((await db.prepare('SELECT * FROM receipts WHERE receipt_id=?').get(id)));
}

function goalFromRow(row) {
  if (!row) return null;
  return { ...parseJson(row.metadata_json), id: row.goal_id, goalName: row.goal_name, targetAmount: Number(row.target_amount), collectedAmount: Number(row.collected_amount),
    achievementPercentage: Number(row.achievement_percentage), status: row.status, startDate: row.start_date || '', endDate: row.end_date || '', completionDate: row.completion_date || '',
    archivedAt: row.archive_date || '', createdAt: row.created_at, updatedAt: row.updated_at };
}
async function listGoals(db) { return (await db.prepare('SELECT * FROM collection_goals ORDER BY created_at DESC').all()).map(goalFromRow); }
async function saveGoal(db, input, id = null) {
  const goalName = required(input.goalName || input.name, 'Goal name');
  const target = amount(input.targetAmount);
  if (target <= 0) throw Object.assign(new Error('Target amount must be greater than zero.'), { status: 400 });
  const goalId = id || asText(input.id) || randomUUID();
  const timestamp = now();
  const metadata = { ...input };
  for (const key of ['id', 'goalName', 'targetAmount', 'collectedAmount', 'achievementPercentage', 'status', 'startDate', 'endDate', 'completionDate', 'archivedAt', 'createdAt', 'updatedAt']) delete metadata[key];
  (await db.prepare(`INSERT INTO collection_goals (goal_id, goal_name, target_amount, collected_amount, achievement_percentage, status, start_date, end_date, completion_date, archive_date, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(goal_id) DO UPDATE SET goal_name=excluded.goal_name, target_amount=excluded.target_amount, collected_amount=excluded.collected_amount,
    achievement_percentage=excluded.achievement_percentage, status=excluded.status, start_date=excluded.start_date, end_date=excluded.end_date,
    completion_date=excluded.completion_date, archive_date=excluded.archive_date, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at`)
    .run(goalId, goalName, target, amount(input.collectedAmount), amount(input.achievementPercentage), asText(input.status || 'Active'), asText(input.startDate) || null,
      asText(input.endDate) || null, asText(input.completionDate) || null, asText(input.archivedAt || input.archiveDate) || null, JSON.stringify(metadata), asText(input.createdAt) || timestamp, timestamp));
  return goalFromRow((await db.prepare('SELECT * FROM collection_goals WHERE goal_id=?').get(goalId)));
}
async function saveReport(db, input) {
  const id = asText(input.id) || randomUUID();
  const name = required(input.reportName || input.name, 'Report name');
  const type = required(input.reportType || input.type, 'Report type');
  const generatedDate = asText(input.generatedDate) || now();
  (await db.prepare('INSERT INTO reports (report_id, report_name, report_type, generated_by, generated_date, data_json) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, name, type, asText(input.generatedBy) || 'Clinic staff', generatedDate, JSON.stringify(input.data || {})));
  return { id, reportName: name, reportType: type, generatedBy: input.generatedBy || 'Clinic staff', generatedDate, data: input.data || {} };
}
async function updateReport(db, id, input) {
  const old = (await db.prepare('SELECT * FROM reports WHERE report_id=?').get(id));
  if (!old) throw Object.assign(new Error('Report not found.'), { status: 404 });
  const name = required(input.reportName ?? old.report_name, 'Report name');
  const type = required(input.reportType ?? old.report_type, 'Report type');
  const date = asText(input.generatedDate ?? old.generated_date) || now();
  const by = asText(input.generatedBy ?? old.generated_by) || null;
  const data = input.data === undefined ? parseJson(old.data_json) : input.data;
  (await db.prepare('UPDATE reports SET report_name=?, report_type=?, generated_by=?, generated_date=?, data_json=? WHERE report_id=?').run(name, type, by, date, JSON.stringify(data), id));
  return { id, reportName: name, reportType: type, generatedBy: by, generatedDate: date, data };
}

async function tableData(db) {
  return { patients: (await listPatients(db)), medicalHistory: (await medicalHistoryRows(db)), appointments: (await listAppointments(db)), visits: (await listVisits(db)), messages: (await listMessages(db)), notifications: (await listNotifications(db)), invoices: (await listInvoices(db)),
    receipts: (await db.prepare('SELECT * FROM receipts ORDER BY payment_date DESC').all()).map(receiptFromRow), goals: (await listGoals(db)),
    reports: (await db.prepare('SELECT * FROM reports ORDER BY generated_date DESC').all()).map(row => ({ id: row.report_id, reportName: row.report_name, reportType: row.report_type, generatedBy: row.generated_by, generatedDate: row.generated_date, data: parseJson(row.data_json) })) };
}
async function mutation(db, resource, method, id, body) {
  if (resource === 'patients') {
    if (method === 'POST') return (await createPatient(db, body));
    if (method === 'PUT' || method === 'PATCH') return (await updatePatient(db, id, body));
    if (method === 'DELETE') { const result = (await db.prepare('DELETE FROM patients WHERE patient_id=?').run(id)); if (!result.changes) throw Object.assign(new Error('Patient record not found.'), { status: 404 }); return { id }; }
  }
  if (resource === 'appointments') {
    if (method === 'POST') {
      if (!Array.isArray(body)) return (await createAppointment(db, body));
      if (!body.length) throw Object.assign(new Error('Add at least one appointment.'), { status: 400 });
      return Promise.all(body.map(async appointment => (await createAppointment(db, appointment))));
    }
    if (method === 'PUT' || method === 'PATCH') return (await updateAppointment(db, id, body));
    if (method === 'DELETE') { const result = (await db.prepare('DELETE FROM appointments WHERE appointment_id=?').run(id)); if (!result.changes) throw Object.assign(new Error('Appointment not found.'), { status: 404 }); return { id }; }
  }
  if (resource === 'visits') {
    if (method === 'POST') return (await createVisit(db, body));
    if (method === 'DELETE') {
      const visit = (await db.prepare('SELECT patient_id FROM visits WHERE visit_id=?').get(id));
      const result = (await db.prepare('DELETE FROM visits WHERE visit_id=?').run(id));
      if (!result.changes) throw Object.assign(new Error('Visit not found.'), { status: 404 });
      if (visit?.patient_id) {
        const lastVisit = (await db.prepare('SELECT MAX(visit_date) AS visit_date FROM visits WHERE patient_id=?').get(visit.patient_id)).visit_date || null;
        (await db.prepare('UPDATE patients SET last_visit_date=?, updated_at=? WHERE patient_id=?').run(lastVisit, now(), visit.patient_id));
      }
      return { id };
    }
  }
  if (resource === 'medical-history' || resource === 'medicalHistory') {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return (await saveMedicalHistory(db, body, method === 'POST' ? null : id));
    if (method === 'DELETE') { const result = (await db.prepare('DELETE FROM medical_history WHERE medical_history_id=? OR patient_id=?').run(id, id)); if (!result.changes) throw Object.assign(new Error('Medical history record not found.'), { status: 404 }); return { id }; }
  }
  if (resource === 'messages') {
    if (method === 'POST') return (await createMessage(db, body));
    if (method === 'PUT' || method === 'PATCH') return (await updateMessage(db, id, body));
    if (method === 'DELETE') { const result = (await db.prepare('DELETE FROM messages WHERE message_id=?').run(id)); if (!result.changes) throw Object.assign(new Error('Message not found.'), { status: 404 }); return { id }; }
  }
  if (resource === 'notifications') {
    if (method === 'POST') return (await createNotification(db, body));
    if (method === 'PUT' || method === 'PATCH') return (await updateNotification(db, id, body));
    if (method === 'DELETE') { const result = (await db.prepare('DELETE FROM notifications WHERE notification_id=?').run(id)); if (!result.changes) throw Object.assign(new Error('Notification not found.'), { status: 404 }); return { id }; }
  }
  if (resource === 'invoices') {
    if (method === 'POST') return (await createInvoice(db, body));
    if (method === 'PUT' || method === 'PATCH') return (await updateInvoice(db, id, body));
    if (method === 'DELETE') { const result = (await db.prepare('DELETE FROM invoices WHERE invoice_id=?').run(id)); if (!result.changes) throw Object.assign(new Error('Invoice not found.'), { status: 404 }); return { id }; }
  }
  if (resource === 'receipts') {
    if (method === 'POST') {
      const invoiceId = required(body.invoiceId, 'Invoice');
      return (await recordPayment(db, invoiceId, body)).receipt;
    }
    if (method === 'PUT' || method === 'PATCH') return (await updateReceipt(db, id, body));
    if (method === 'DELETE') {
      const old = (await db.prepare('SELECT invoice_id FROM receipts WHERE receipt_id=?').get(id));
      if (!old) throw Object.assign(new Error('Receipt not found.'), { status: 404 });
      (await db.prepare('DELETE FROM receipts WHERE receipt_id=?').run(id));
      (await recalculateInvoiceFromReceipts(db, old.invoice_id));
      return { id };
    }
  }
  if (resource === 'goals') {
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') return (await saveGoal(db, body, method === 'POST' ? null : id));
    if (method === 'DELETE') { const result = (await db.prepare('DELETE FROM collection_goals WHERE goal_id=?').run(id)); if (!result.changes) throw Object.assign(new Error('Collection goal not found.'), { status: 404 }); return { id }; }
  }
  if (resource === 'reports' && method === 'POST') return (await saveReport(db, body));
  if (resource === 'reports' && (method === 'PUT' || method === 'PATCH')) return (await updateReport(db, id, body));
  if (resource === 'reports' && method === 'DELETE') { const result = (await db.prepare('DELETE FROM reports WHERE report_id=?').run(id)); if (!result.changes) throw Object.assign(new Error('Report not found.'), { status: 404 }); return { id }; }
  throw Object.assign(new Error('This data operation is not supported.'), { status: 405 });
}

async function importLegacyData(db, payload) {
  const importKey = required(payload.importKey, 'Import key');
  const prior = (await db.prepare('SELECT imported_summary FROM legacy_imports WHERE import_key=?').get(importKey));
  if (prior) return { imported: false, summary: parseJson(prior.imported_summary) };
  const data = payload.data || {};
  const summary = { patients: 0, appointments: 0, invoices: 0, messages: 0, notifications: 0, goals: 0, skipped: 0 };
  const patientIds = new Map();
  for (const [index, patient] of (Array.isArray(data.patients) ? data.patients : []).entries()) {
    const number = asText(patient.patientNumber || patient.patientCode || patient.code) || `PT-${String(index + 1).padStart(4, '0')}`;
    const name = asText(patient.name || patient.fullName).toLocaleLowerCase();
    if ((number === 'PT-0001' && name === 'test') || (number === 'PT-0002' && name === 'az')) { summary.skipped += 1; continue; }
    const id = (await importLegacyPatient(db, patient, index));
    if (id) { summary.patients += 1; if (patient.id) patientIds.set(patient.id, id); }
    else summary.skipped += 1;
  }
  const resolveLegacyId = async item => {
    const priorId = asText(item.patientId);
    if (priorId && patientIds.has(priorId)) return patientIds.get(priorId);
    if (priorId && (await db.prepare('SELECT patient_id FROM patients WHERE patient_id=?').get(priorId))) return priorId;
    const patientName = asText(item.patient || item.patientName);
    if (!patientName) return '';
    return (await db.prepare('SELECT patient_id FROM patients WHERE lower(full_name)=lower(?) ORDER BY created_at LIMIT 1').get(patientName))?.patient_id || '';
  };
  for (const appointment of Array.isArray(data.appointments) ? data.appointments : []) {
    try {
      const patientId = (await resolveLegacyId(appointment));
      if (!patientId && !asText(appointment.patient || appointment.patientName)) { summary.skipped += 1; continue; }
      (await createAppointment(db, { ...appointment, patientId }, { allowOrphan: !patientId }));
      summary.appointments += 1;
    }
    catch { summary.skipped += 1; }
  }
  for (const invoice of Array.isArray(data.invoices) ? data.invoices : []) {
    try {
      const patientId = (await resolveLegacyId(invoice));
      if ((!patientId && !asText(invoice.patient || invoice.patientName)) || amount(invoice.totalAmount ?? invoice.amount) <= 0) { summary.skipped += 1; continue; }
      const invoiceNumber = asText(invoice.invoiceNumber || invoice.number) || `INV-LEGACY-${randomUUID().slice(0, 8)}`;
      (await createInvoice(db, { ...invoice, invoiceNumber, patientId }, { allowOrphan: !patientId })); summary.invoices += 1;
    } catch { summary.skipped += 1; }
  }
  for (const message of Array.isArray(data.messages) ? data.messages : []) {
    try {
      const patientId = (await resolveLegacyId(message));
      if (!patientId && !asText(message.patient || message.patientName)) { summary.skipped += 1; continue; }
      (await createMessage(db, { ...message, patientId, messageType: message.messageType || 'General Inquiry', sendVia: message.sendVia || 'Clinic Portal' }, { allowOrphan: !patientId }));
      summary.messages += 1;
    }
    catch { summary.skipped += 1; }
  }
  for (const notification of Array.isArray(data.notifications) ? data.notifications : []) {
    try {
      const patientId = (await resolveLegacyId(notification));
      (await createNotification(db, { ...notification, patientId: patientId || null, patient: notification.patient || notification.patientName || '', title: notification.title || 'Clinic update', message: notification.message || 'A new clinic update is available.' })); summary.notifications += 1;
    } catch { summary.skipped += 1; }
  }
  const goals = [...(Array.isArray(data.archivedGoals) ? data.archivedGoals : []), ...(data.collectionGoal ? [data.collectionGoal] : [])];
  for (const goal of goals) {
    try { if (Number(goal.targetAmount) > 0) { (await saveGoal(db, goal)); summary.goals += 1; } else summary.skipped += 1; }
    catch { summary.skipped += 1; }
  }
  (await db.prepare('INSERT INTO legacy_imports (import_key, imported_summary) VALUES (?, ?)').run(importKey, JSON.stringify(summary)));
  return { imported: true, summary };
}

async function action(db, resource, body) {
  const timestamp = now();
  if (resource === 'messages') {
    const patientId = asText(body.patientId);
    const conversationId = asText(body.conversationId);
    const patientName = asText(body.patient);
    const where = patientId ? 'patient_id=?' : conversationId ? 'conversation_id=?' : patientName ? 'patient_id=(SELECT patient_id FROM patients WHERE lower(full_name)=lower(?) LIMIT 1)' : '1=1';
    const param = patientId || conversationId || patientName;
    if (body.action === 'read') (await db.prepare(`UPDATE messages SET is_read=1, read_at=COALESCE(read_at, ?), updated_at=? WHERE ${where} AND is_draft=0`).run(timestamp, timestamp, ...(param ? [param] : [])));
    else if (body.action === 'archive' || body.action === 'trash') {
      const column = body.action === 'archive' ? 'is_archived' : 'is_trashed';
      (await db.prepare(`UPDATE messages SET ${column}=?, updated_at=? WHERE ${where}`).run(Number(Boolean(body.value)), timestamp, ...(param ? [param] : [])));
    } else if (body.action === 'delete') (await db.prepare(`DELETE FROM messages WHERE ${where}`).run(...(param ? [param] : [])));
    else throw Object.assign(new Error('Unknown message action.'), { status: 400 });
    return;
  }
  if (resource === 'notifications') {
    if (body.action === 'mark-read') (await db.prepare('UPDATE notifications SET is_read=1 WHERE is_archived=0').run());
    else if (body.action === 'archive-read') (await db.prepare('UPDATE notifications SET is_archived=1, archived_read=is_read, archive_date=? WHERE is_read=1 AND is_archived=0').run(timestamp));
    else throw Object.assign(new Error('Unknown notification action.'), { status: 400 });
    return;
  }
  throw Object.assign(new Error('Unknown data action.'), { status: 400 });
}

export async function handleAdminData(db, req, res, { json, readBody, notify, beforePatientDelete = () => {}, afterFileDeletion = () => {} }) {
  const url = new URL(req.url || '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'admin' || parts[2] !== 'data') return false;
  const resource = parts[3] || '';
  const id = parts[4] || '';
  try {
    if (req.method === 'GET' && !resource) return json(res, 200, (await tableData(db)));
    if (req.method === 'GET' && resource) {
      const key = resource === 'medical-history' ? 'medicalHistory' : resource;
      const list = (await tableData(db))[key];
      if (!Array.isArray(list)) return json(res, 404, { error: 'Unknown data module.' });
      const row = id ? list.find(item => String(item.id) === id || item.patientId === id) : list;
      return row === undefined ? json(res, 404, { error: 'Record not found.' }) : json(res, 200, row);
    }
    if (req.method === 'POST' && resource === 'import-legacy') {
      const body = await readBody(req);
      (await db.exec('BEGIN'));
      try { const result = (await importLegacyData(db, body)); (await db.exec('COMMIT')); notify('all'); return json(res, 200, result); }
      catch (error) { (await db.exec('ROLLBACK')); throw error; }
    }
    if (req.method === 'POST' && resource === 'actions') {
      const body = await readBody(req);
      (await action(db, parts[4] || '', body));
      notify(parts[4] || '');
      return json(res, 200, { ok: true });
    }
    if (resource === 'invoices' && id && parts[5] === 'payments' && req.method === 'POST') {
      const body = await readBody(req);
      (await db.exec('BEGIN'));
      try { const result = (await recordPayment(db, id, body)); (await db.exec('COMMIT')); notify('invoices'); notify('receipts'); return json(res, 201, result); }
      catch (error) { (await db.exec('ROLLBACK')); throw error; }
    }
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const body = await readBody(req);
      (await db.exec('BEGIN'));
      try {
        const result = (await mutation(db, resource, req.method, id, body));
        (await db.exec('COMMIT'));
        notify(resource);
        if (resource === 'visits') notify('patients');
        return json(res, req.method === 'POST' ? 201 : 200, result);
      } catch (error) {
        (await db.exec('ROLLBACK'));
        throw error;
      }
    }
    if (req.method === 'DELETE' && resource && id) {
      (await db.exec('BEGIN'));
      try {
        if (resource === 'patients') (await beforePatientDelete(id));
        const result = (await mutation(db, resource, 'DELETE', id, {}));
        (await db.exec('COMMIT'));
        if (resource === 'patients') (await afterFileDeletion());
        notify(resource);
        if (resource === 'visits') notify('patients');
        return json(res, 200, result);
      } catch (error) {
        (await db.exec('ROLLBACK'));
        throw error;
      }
    }
    return json(res, 404, { error: 'Not found.' });
  } catch (error) {
    if (error.code === '23505' || String(error.message).includes('UNIQUE')) return json(res, 409, { error: 'That ID or number is already in use.' });
    if (error.code === '23503' || String(error.message).includes('FOREIGN KEY')) return json(res, 400, { error: 'The related record does not exist.' });
    return json(res, error.status || 500, { error: error.status ? error.message : 'The server could not complete the request.' });
  }
}

export async function handlePatientPortalData(db, accountId) {
  const row = (await db.prepare(`${patientSelect} WHERE p.account_id=?`).get(accountId));
  if (!row) throw Object.assign(new Error('Your patient profile is not available. Please contact the clinic.'), { status: 404 });
  const patient = patientFromRow(row);
  return { patient, appointments: (await listAppointments(db, patient.id)), visits: (await listVisits(db, patient.id)), messages: (await listMessages(db, patient.id)).filter(message => !message.isDraft),
    notifications: (await listNotifications(db, patient.id)), invoices: (await listInvoices(db, patient.id)) };
}

export async function createPatientMessage(db, accountId, input) {
  const patient = (await db.prepare('SELECT patient_id, full_name, patient_number FROM patients WHERE account_id=?').get(accountId));
  if (!patient) throw Object.assign(new Error('Your patient profile is not available. Please contact the clinic.'), { status: 404 });
  return (await createMessage(db, { ...input, patientId: patient.patient_id, accountId, patient: patient.full_name, direction: 'received', isRead: false }));
}

export async function createPatientChatExchange(db, accountId, { message, autoReply, autoReplyKind = 'welcome' }) {
  const patient = (await db.prepare('SELECT patient_id, full_name FROM patients WHERE account_id=?').get(accountId));
  if (!patient) throw Object.assign(new Error('Your patient profile is not available. Please contact the clinic.'), { status: 404 });
  const received = (await createPatientMessage(db, accountId, { message }));
  const alreadyWelcomed = Boolean((await db.prepare("SELECT 1 FROM messages WHERE patient_id=? AND sender_type='staff' AND (message_type='Automated Welcome' OR message_content LIKE '%We’re glad you reached out to 3 Mary’s Smile Dental Clinic%') LIMIT 1").get(patient.patient_id)));
  let reply = null;
  if (autoReply && (autoReplyKind !== 'welcome' || !alreadyWelcomed)) {
    reply = (await createMessage(db, {
      patientId: patient.patient_id,
      patient: patient.full_name,
      subject: 'Patient chat',
      messageType: autoReplyKind === 'faq' ? 'Automated FAQ' : 'Automated Welcome',
      sendVia: 'Clinic Chat',
      message: required(autoReply, 'Automatic reply'),
      direction: 'sent',
      isRead: true,
    }));
  }
  (await createNotification(db, {
    patientId: patient.patient_id,
    patient: patient.full_name,
    title: `New chat message from ${patient.full_name}`,
    message: received.message.length > 140 ? `${received.message.slice(0, 137)}…` : received.message,
    type: 'message',
  }));
  return { messages: reply ? [received, reply] : [received] };
}

export async function listPatientMessages(db, accountId) {
  const patient = (await db.prepare('SELECT patient_id FROM patients WHERE account_id=?').get(accountId));
  if (!patient) throw Object.assign(new Error('Your patient profile is not available. Please contact the clinic.'), { status: 404 });
  return (await listMessages(db, patient.patient_id)).filter(message => !message.isDraft && !message.archived && !message.trashed);
}

export async function markPatientMessagesRead(db, accountId) {
  const patient = (await db.prepare('SELECT patient_id FROM patients WHERE account_id=?').get(accountId));
  if (!patient) throw Object.assign(new Error('Your patient profile is not available. Please contact the clinic.'), { status: 404 });
  const timestamp = now();
  const result = (await db.prepare("UPDATE messages SET is_read=1, read_at=COALESCE(read_at, ?), updated_at=? WHERE patient_id=? AND sender_type='staff' AND is_read=0 AND is_draft=0").run(timestamp, timestamp, patient.patient_id));
  return { ok: true, updated: result.changes };
}

export async function seedDemoData(db) {
  if ((await db.prepare('SELECT COUNT(*) AS count FROM patients').get()).count > 0) return { seeded: false, reason: 'The database already contains patient records.' };
  const patient = (await createPatient(db, { id: 'seed-patient-0001', patientNumber: 'PT-9001', name: 'Demo Patient', phone: '09123456789', email: 'demo@example.test', dateOfBirth: '1990-06-15', gender: 'Prefer not to say', civilStatus: 'Single', address: 'Demo clinic address', allergies: 'None', medications: 'None', conditions: 'None' }));
  const appointment = (await createAppointment(db, { id: 'seed-appointment-0001', patientId: patient.id, date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '10:00', service: 'General checkup & cleaning', status: 'Confirmed' }));
  const invoice = (await createInvoice(db, { id: 'seed-invoice-0001', invoiceNumber: 'INV-9001', patientId: patient.id, treatment: 'Routine Cleaning', totalAmount: 1200, invoiceDate: now().slice(0, 10), dueDate: now().slice(0, 10), status: 'Unpaid' }));
  (await createMessage(db, { id: 'seed-message-0001', patientId: patient.id, subject: 'Appointment Confirmation', messageType: 'Appointment Confirmation', message: `Hello ${patient.name}, your appointment is confirmed.`, direction: 'sent', sendVia: 'Email', isRead: true }));
  (await createNotification(db, { id: 'seed-notification-0001', patientId: patient.id, title: 'Appointment Confirmed', message: `Your appointment for ${appointment.date} at ${appointment.time} is confirmed.`, type: 'appointment' }));
  (await saveGoal(db, { id: 'seed-goal-0001', goalName: 'Demo monthly goal', targetAmount: 25000, collectedAmount: 0, achievementPercentage: 0, status: 'Active', startDate: now().slice(0, 10), endDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }));
  return { seeded: true, patientId: patient.id, invoiceId: invoice.id };
}
