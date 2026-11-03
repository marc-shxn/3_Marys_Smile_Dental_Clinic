import { useEffect, useMemo, useRef, useState } from 'react';
import FormModal from '../../components/FormModal.jsx';
import AdminSelect from '../../components/AdminSelect.jsx';
import NewVisitModal from './NewVisitModal.jsx';
import './Patients.css';

const SEX_OPTIONS = ['Male', 'Female', 'Prefer not to say'];
const CIVIL_STATUS_OPTIONS = ['Single', 'Married', 'Widowed', 'Separated', 'Prefer not to say'];
const EMERGENCY_RELATIONSHIP_OPTIONS = ['Spouse', 'Parent', 'Sibling', 'Relative', 'Friend', 'Other'];
const GUARDIAN_RELATIONSHIP_OPTIONS = ['Mother', 'Father', 'Guardian', 'Relative', 'Other'];
const REQUIRED_PATIENT_FIELDS = ['name', 'phone', 'dateOfBirth', 'gender', 'civilStatus', 'address'];
const MARRIED_CONTACT_FIELDS = ['emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone'];
const MINOR_GUARDIAN_FIELDS = ['parentGuardianName', 'parentGuardianRelationship', 'parentGuardianPhone'];
const fields = [
  { name: 'name', label: 'Full name *', placeholder: "Enter patient's full name", required: true, wide: true },
  { name: 'phone', label: 'Phone number *', type: 'tel', placeholder: '09XX-XXX-XXXX', required: true, validate: value => isPhilippineMobile(value), validationMessage: 'Enter a valid Philippine mobile number in 09XX-XXX-XXXX format.' },
  { name: 'email', label: 'Email address (optional)', type: 'email', placeholder: 'name@example.com' },
  { name: 'dateOfBirth', label: 'Date of birth *', type: 'date', required: true, validate: value => !value || value <= todayISO(), validationMessage: 'Date of birth cannot be in the future.' },
  { name: 'age', label: 'Age (Auto-calculated)', type: 'age', source: 'dateOfBirth' },
  { name: 'gender', label: 'Sex *', type: 'select', required: true, placeholder: 'Select sex', options: SEX_OPTIONS },
  { name: 'civilStatus', label: 'Civil status *', type: 'select', required: true, placeholder: 'Select civil status', options: CIVIL_STATUS_OPTIONS },
  { name: 'height', label: 'Height (cm) (Optional)', type: 'numberOrNone', placeholder: 'Enter height (cm)', step: 'any' },
  { name: 'weight', label: 'Weight (kg) (Optional)', type: 'numberOrNone', placeholder: 'Enter weight (kg)', step: 'any' },
  { name: 'occupation', label: 'Occupation', placeholder: 'Enter occupation' },
  { name: 'address', label: 'Address *', placeholder: 'Enter patient address', required: true, wide: true },
  { name: 'emergencyContactName', label: 'Emergency contact name', placeholder: 'Enter contact name', requiredWhen: values => values.civilStatus === 'Married', optionalWhen: values => values.civilStatus !== 'Married', visibleWhen: values => { const age = ageOf(values.dateOfBirth); return age !== null && age >= 19; } },
  { name: 'emergencyContactRelationship', label: 'Relationship', type: 'select', placeholder: 'Select relationship', options: EMERGENCY_RELATIONSHIP_OPTIONS, requiredWhen: values => values.civilStatus === 'Married', optionalWhen: values => values.civilStatus !== 'Married', visibleWhen: values => { const age = ageOf(values.dateOfBirth); return age !== null && age >= 19; } },
  { name: 'emergencyContactPhone', label: 'Contact number', type: 'tel', placeholder: '09XX-XXX-XXXX', requiredWhen: values => values.civilStatus === 'Married', optionalWhen: values => values.civilStatus !== 'Married', validate: (value, values) => (!value && values.civilStatus !== 'Married') || isPhilippineMobile(value), validationMessage: 'Enter a valid Philippine mobile number in 09XX-XXX-XXXX format.', visibleWhen: values => { const age = ageOf(values.dateOfBirth); return age !== null && age >= 19; } },
  { name: 'parentGuardianName', label: 'Parent / guardian name', placeholder: 'Enter parent or guardian name', required: true, visibleWhen: values => { const age = ageOf(values.dateOfBirth); return age !== null && age <= 18; } },
  { name: 'parentGuardianRelationship', label: 'Relationship to patient', type: 'select', required: true, placeholder: 'Select relationship', options: GUARDIAN_RELATIONSHIP_OPTIONS, visibleWhen: values => { const age = ageOf(values.dateOfBirth); return age !== null && age <= 18; } },
  { name: 'parentGuardianPhone', label: 'Contact number', type: 'tel', placeholder: '09XX-XXX-XXXX', required: true, validate: value => isPhilippineMobile(value), validationMessage: 'Enter a valid Philippine mobile number in 09XX-XXX-XXXX format.', visibleWhen: values => { const age = ageOf(values.dateOfBirth); return age !== null && age <= 18; } },
  { name: 'allergies', label: 'Allergies', type: 'textarea', placeholder: 'Enter known allergies or “None”', wide: true },
  { name: 'conditions', label: 'Medical conditions', type: 'textarea', placeholder: 'Enter medical conditions or “None”' },
  { name: 'medications', label: 'Current medications', type: 'textarea', placeholder: 'Enter current medications or “None”' },
  { name: 'seriousIllnesses', label: 'Other serious illnesses', type: 'textarea', placeholder: 'Enter other serious illnesses or “None”' },
  { name: 'pregnancyStatus', label: 'Pregnancy status', placeholder: 'Enter pregnancy status or “None”' },
  { name: 'mouthSoresGrowths', label: 'Sores or growths in mouth', type: 'textarea', placeholder: 'Enter details or “None”' },
  { name: 'notes', label: 'Clinical notes (Optional)', type: 'textarea', placeholder: 'Add additional information about the patient.', wide: true }
];
const patientChangeLabels = { name: 'Full Name', phone: 'Phone Number', email: 'Email Address', dateOfBirth: 'Date of Birth', gender: 'Sex', civilStatus: 'Civil Status', height: 'Height (cm)', weight: 'Weight (kg)', occupation: 'Occupation', address: 'Address', emergencyContactName: 'Emergency Contact Name', emergencyContactRelationship: 'Emergency Contact Relationship', emergencyContactPhone: 'Emergency Contact Number', parentGuardianName: 'Parent / Guardian Name', parentGuardianRelationship: 'Parent / Guardian Relationship', parentGuardianPhone: 'Parent / Guardian Contact Number', allergies: 'Allergies', conditions: 'Medical Conditions', medications: 'Current Medications', seriousIllnesses: 'Other Serious Illnesses', pregnancyStatus: 'Pregnancy Status', mouthSoresGrowths: 'Sores or Growths in Mouth', notes: 'Clinical Notes' };
const noteFields = [{ name: 'note', label: 'Clinical note', type: 'textarea', placeholder: 'Add a note to the patient record...', required: true, wide: true }];
const PATIENT_FILTERS_KEY = 'smile-clinic-patient-filters';
const PATIENT_FILTER_OPTIONS = ['All Patients', 'Added This Month', 'Active Patients', 'Inactive Patients'];
const VISIT_FILTER_OPTIONS = ['All Visits', 'Visited Within 30 Days', 'Visited Within 90 Days', 'Visited Within 1 Year', 'No Visit History'];
const ADVANCED_FILTER_OPTIONS = {
  profile: [{ value: 'complete', label: 'Complete Profiles' }, { value: 'incomplete', label: 'Incomplete Profiles' }],
  activity: [{ value: 'upcoming', label: 'Has Upcoming Appointment' }, { value: 'no-upcoming', label: 'No Upcoming Appointment' }],
  treatment: [{ value: 'active-treatment', label: 'Has Active Treatment' }, { value: 'no-active-treatment', label: 'No Active Treatment' }],
  registration: [{ value: 'this-month', label: 'Added This Month' }, { value: 'this-year', label: 'Added This Year' }],
};
const emptyAdvancedFilters = () => ({ profile: [], activity: [], treatment: [], registration: [] });
const initials = value => (value || '').trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'P';
const normalize = value => String(value || '').trim().toLocaleLowerCase();
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const patientCode = (patient, index) => patient?.patientNumber || patient?.patientCode || patient?.code || `PT-${String(index + 1).padStart(4, '0')}`;
const nextPatientCode = patients => {
  const lastAssignedNumber = patients.reduce((highest, patient, index) => {
    const number = Number(patientCode(patient, index).match(/(\d+)$/)?.[1] || 0);
    return Math.max(highest, number);
  }, patients.length);
  return `PT-${String(lastAssignedNumber + 1).padStart(4, '0')}`;
};
const dateValue = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
const formatDate = value => { const d = dateValue(value); return d && !Number.isNaN(d.valueOf()) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
const formatAppointmentTime = value => {
  const time = String(value || '').trim();
  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return time;
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'AM' : 'PM'}`;
};
const isPatientActive = patient => patient?.isActive !== false && normalize(patient?.status) !== 'inactive';
const isForPatient = (appointment, patient) => appointment.patientId ? appointment.patientId === patient.id : normalize(appointment.patient) === normalize(patient.name);
const isCompletedVisit = appointment => normalize(appointment.status) === 'completed';
const isUpcomingAppointment = appointment => appointment.date >= todayISO() && !['cancelled', 'completed'].includes(normalize(appointment.status));
const hasFields = (patient, keys) => keys.every(key => String(patient[key] || '').trim());
const isProfileComplete = patient => hasFields(patient, REQUIRED_PATIENT_FIELDS)
  && (ageOf(patient.dateOfBirth) !== null && ageOf(patient.dateOfBirth) <= 18 ? hasFields(patient, MINOR_GUARDIAN_FIELDS)
    : patient.civilStatus !== 'Married' || hasFields(patient, MARRIED_CONTACT_FIELDS));
const readPatientFilters = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PATIENT_FILTERS_KEY) || 'null');
    return {
      patientFilter: PATIENT_FILTER_OPTIONS.includes(saved?.patientFilter) ? saved.patientFilter : 'All Patients',
      visitFilter: VISIT_FILTER_OPTIONS.includes(saved?.visitFilter) ? saved.visitFilter : 'All Visits',
      advanced: Object.fromEntries(Object.entries(ADVANCED_FILTER_OPTIONS).map(([group, options]) => [group, Array.isArray(saved?.advanced?.[group]) ? saved.advanced[group].filter(value => options.some(option => option.value === value)) : []])),
    };
  } catch { return { patientFilter: 'All Patients', visitFilter: 'All Visits', advanced: emptyAdvancedFilters() }; }
};
const ageOf = value => { const dob = dateValue(value); if (!dob || Number.isNaN(dob.valueOf())) return null; const now = new Date(); let age = now.getFullYear() - dob.getFullYear(); if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--; return age >= 0 ? age : null; };
const measurementText = (value, unit) => value == null || value === '' || normalize(value) === 'none' ? 'Not Provided' : `${value} ${unit}`;
const reportedText = value => String(value ?? '').trim() && normalize(value) !== 'none' ? String(value).trim() : 'None Reported';
const money = value => `₱${Number(value || 0).toLocaleString()}`;
const numericAmount = value => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
const invoiceTotal = invoice => numericAmount(invoice.totalAmount ?? invoice.amount);
const invoicePaid = invoice => {
  if (invoice.amountPaid != null) return numericAmount(invoice.amountPaid);
  if (Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length) return invoice.paymentHistory.reduce((sum, payment) => sum + numericAmount(payment.amount), 0);
  if (normalize(invoice.status) === 'paid') return invoiceTotal(invoice);
  if (normalize(invoice.status) === 'partial payment' && invoice.remainingBalance != null) return Math.max(0, invoiceTotal(invoice) - numericAmount(invoice.remainingBalance));
  return 0;
};
const invoicePayments = invoice => {
  if (Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length) return invoice.paymentHistory;
  const amount = invoicePaid(invoice);
  return amount > 0 ? [{ amount, paymentMethod: invoice.paymentMethod, paymentDate: invoice.paymentDate || invoice.invoiceDate || invoice.dueDate, receiptNumber: invoice.receiptNumber }] : [];
};

function PatientFilterDropdown({ value, options, label, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeEscape = event => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
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
    const next = (index + step + options.length) % options.length;
    listRef.current?.querySelectorAll('[role="option"]')[next]?.focus();
  };

  return <div className={`patient-filter-select${compact ? ' is-compact' : ''}${open ? ' is-open' : ''}`} ref={rootRef}>
    <button ref={triggerRef} className="patient-filter-trigger" type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)}>
      <span>{value}</span><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <div className="patient-filter-menu" role="listbox" aria-label={label} aria-hidden={!open} ref={listRef}>
      {options.map((option, index) => {
        const selected = value === option;
        return <button key={option} className={`patient-filter-option${selected ? ' is-selected' : ''}`} type="button" role="option" tabIndex={open ? 0 : -1} aria-selected={selected} onClick={() => { onChange(option); setOpen(false); triggerRef.current?.focus(); }} onKeyDown={event => moveFocus(event, index)}>
          <span>{option}</span><span className="patient-filter-check" aria-hidden="true">{selected ? '✓' : ''}</span>
        </button>;
      })}
    </div>
  </div>;
}

const emptyPatientForm = () => ({ name: '', phone: '', dateOfBirth: '', email: '', gender: '', civilStatus: '', height: '', weight: '', occupation: '', address: '', emergencyContactName: '', emergencyContactRelationship: '', emergencyContactPhone: '', parentGuardianName: '', parentGuardianRelationship: '', parentGuardianPhone: '', allergies: '', conditions: '', medications: '', seriousIllnesses: '', pregnancyStatus: '', mouthSoresGrowths: '', notes: '' });
const isPhilippineMobile = value => /^(?:\+63|63|0)9\d{9}$/.test(String(value || '').replace(/[\s()-]/g, ''));
const philippinePhoneSubscriber = value => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('639') && digits.length >= 12) digits = digits.slice(3);
  else if (digits.startsWith('09') && digits.length >= 11) digits = digits.slice(2);
  else if (digits.startsWith('63') && digits.length >= 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(1);
  else if (digits.startsWith('9') && digits.length >= 10) digits = digits.slice(1);
  return digits.slice(0, 9);
};
const formatPhilippinePhoneRemainder = value => {
  const subscriber = philippinePhoneSubscriber(value);
  const firstGroup = subscriber.slice(0, 2);
  const secondGroup = subscriber.slice(2, 5);
  const thirdGroup = subscriber.slice(5, 9);
  return `${firstGroup}${subscriber.length > 2 ? `-${secondGroup}` : ''}${subscriber.length > 5 ? `-${thirdGroup}` : ''}`;
};
const formatPhilippinePhoneInput = value => `09${formatPhilippinePhoneRemainder(value)}`;

const calendarMonths = Array.from({ length: 12 }, (_, index) => new Date(2020, index, 1).toLocaleDateString(undefined, { month: 'long' }));
const calendarDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseCalendarDate = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
};

function PatientDatePicker({ value, max, invalid, onChange, id, required }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const pickerRef = useRef(null);
  const maxDate = parseCalendarDate(max) || new Date();
  const maxKey = calendarDateKey(maxDate);
  const selectedDate = parseCalendarDate(value);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = selectedDate || maxDate;
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const selectedKey = selectedDate ? calendarDateKey(selectedDate) : '';
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = Array.from({ length: 42 }, (_, index) => new Date(year, month, index - firstWeekday + 1));
  const years = Array.from({ length: Math.max(1, maxDate.getFullYear() - 1899) }, (_, index) => maxDate.getFullYear() - index);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!pickerRef.current?.contains(event.target)) setOpen(false); };
    const closeEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const chooseDate = date => {
    const key = calendarDateKey(date);
    if (key > maxKey) return;
    onChange(key);
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setOpen(false);
  };

  return <div className={`patient-date-picker${open ? ' is-open' : ''}`} ref={pickerRef}>
    <button id={id} ref={triggerRef} className={`patient-date-trigger${invalid ? ' is-invalid' : ''}`} type="button" aria-haspopup="dialog" aria-expanded={open} aria-required={required} aria-invalid={Boolean(invalid)} aria-label={`Date of birth${value ? `, ${selectedDate?.toLocaleDateString() || value}` : ''}`} onClick={() => {
      if (!open) {
        const initial = selectedDate || maxDate;
        setViewMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
      }
      setOpen(current => !current);
    }}>
      <span>{selectedDate ? selectedDate.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'mm/dd/yyyy'}</span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.3"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01"/></svg>
    </button>
    {open && <div className="patient-date-menu" role="dialog" aria-label="Choose date of birth">
      <div className="patient-date-menu-header">
        <AdminSelect className="patient-calendar-select" compact label="Month" value={String(month)} options={calendarMonths.map((label, index) => ({ value: String(index), label }))} onChange={value => setViewMonth(new Date(year, Number(value), 1))}/>
        <AdminSelect className="patient-calendar-select" compact label="Year" value={String(year)} options={years.map(option => String(option))} onChange={value => setViewMonth(new Date(Number(value), month, 1))}/>
      </div>
      <div className="patient-date-weekdays" aria-hidden="true">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="patient-date-grid" role="grid" aria-label={`${calendarMonths[month]} ${year}`}>
        {days.map((date, index) => {
          const key = calendarDateKey(date);
          const outsideMonth = date.getMonth() !== month;
          const futureDate = key > maxKey;
          const isToday = key === maxKey;
          return <button key={`${key}-${index}`} type="button" role="gridcell" className={`${outsideMonth ? 'is-outside ' : ''}${key === selectedKey ? 'is-selected ' : ''}${isToday ? 'is-today' : ''}`} disabled={futureDate} aria-label={date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} aria-selected={key === selectedKey} onClick={() => chooseDate(date)}>{date.getDate()}</button>;
        })}
      </div>
      <div className="patient-date-menu-footer">
        <button type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
        <button type="button" onClick={() => chooseDate(maxDate)}>Today</button>
      </div>
    </div>}
  </div>;
}

function AddPatientModal({ patients, onClose, onSubmit, onViewPatient }) {
  const [values, setValues] = useState(emptyPatientForm);
  const [errors, setErrors] = useState({});
  const [createdPatient, setCreatedPatient] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const today = todayISO();
  const calculatedAge = ageOf(values.dateOfBirth);
  const updateField = (name, value) => {
    const nextValue = name === 'phone' || name === 'emergencyContactPhone' || name === 'parentGuardianPhone' ? philippinePhoneSubscriber(value) : value;
    setValues(current => ({ ...current, [name]: nextValue }));
    setErrors(current => {
      const next = { ...current, [name]: '' };
      if (name === 'civilStatus' && value !== 'Married') MARRIED_CONTACT_FIELDS.forEach(key => { next[key] = ''; });
      if (name === 'dateOfBirth' && (ageOf(value) === null || ageOf(value) >= 19)) MINOR_GUARDIAN_FIELDS.forEach(key => { next[key] = ''; });
      return next;
    });
  };
  const update = event => {
    const { name, value } = event.target;
    updateField(name, value);
  };
  const validate = () => {
    const nextErrors = {};
    if (!values.name.trim()) nextErrors.name = 'Please enter the patient’s full name.';
    if (!values.phone) nextErrors.phone = 'Please enter a phone number.';
    else if (!isPhilippineMobile(`09${values.phone}`)) nextErrors.phone = 'Enter a valid Philippine mobile number in 09XX-XXX-XXXX format.';
    if (!values.dateOfBirth) nextErrors.dateOfBirth = 'Please select the patient’s date of birth.';
    else if (values.dateOfBirth > today) nextErrors.dateOfBirth = 'Date of birth cannot be in the future.';
    if (!values.gender) nextErrors.gender = 'Please select the patient’s sex.';
    if (!values.civilStatus) nextErrors.civilStatus = 'Please select the patient’s civil status.';
    if (!values.address.trim()) nextErrors.address = 'Please enter the patient’s address.';
    if (calculatedAge !== null && calculatedAge >= 19) {
      if (values.civilStatus === 'Married') {
        if (!values.emergencyContactName.trim()) nextErrors.emergencyContactName = 'Please enter an emergency contact name.';
        if (!values.emergencyContactRelationship) nextErrors.emergencyContactRelationship = 'Please select the emergency contact relationship.';
        if (!values.emergencyContactPhone) nextErrors.emergencyContactPhone = 'Please enter an emergency contact number.';
      }
      if (values.emergencyContactPhone && !isPhilippineMobile(`09${values.emergencyContactPhone}`)) nextErrors.emergencyContactPhone = 'Enter a valid Philippine mobile number in 09XX-XXX-XXXX format.';
    }
    if (calculatedAge !== null && calculatedAge <= 18) {
      if (!values.parentGuardianName.trim()) nextErrors.parentGuardianName = 'Please enter a parent or guardian name.';
      if (!values.parentGuardianRelationship) nextErrors.parentGuardianRelationship = 'Please select the parent or guardian relationship.';
      if (!values.parentGuardianPhone) nextErrors.parentGuardianPhone = 'Please enter a parent or guardian contact number.';
      else if (!isPhilippineMobile(`09${values.parentGuardianPhone}`)) nextErrors.parentGuardianPhone = 'Enter a valid Philippine mobile number in 09XX-XXX-XXXX format.';
    }
    if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) nextErrors.email = 'Enter a valid email address.';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  const save = async event => {
    event.preventDefault();
    if (saving || !validate()) return;
    const patientRecord = { ...values, name: values.name.trim(), phone: formatPhilippinePhoneInput(values.phone), address: values.address.trim(), occupation: values.occupation.trim(), height: values.height === 'None' ? 'None' : values.height ? Number(values.height) : '', weight: values.weight === 'None' ? 'None' : values.weight ? Number(values.weight) : '', emergencyContactName: values.emergencyContactName.trim(), emergencyContactRelationship: values.emergencyContactRelationship, emergencyContactPhone: values.emergencyContactPhone ? formatPhilippinePhoneInput(values.emergencyContactPhone) : '', parentGuardianName: values.parentGuardianName.trim(), parentGuardianRelationship: values.parentGuardianRelationship, parentGuardianPhone: values.parentGuardianPhone ? formatPhilippinePhoneInput(values.parentGuardianPhone) : '', patientNumber: nextPatientCode(patients), status: 'active', isActive: true };
    setSaving(true);
    setSaveError('');
    try { setCreatedPatient(await onSubmit(patientRecord) || patientRecord); }
    catch (error) { setSaveError(error.message || 'The patient record could not be saved.'); }
    finally { setSaving(false); }
  };
  const input = (name, label, placeholder, type = 'text', wide = false, required = false) => {
    const isPhone = name === 'phone' || name === 'emergencyContactPhone' || name === 'parentGuardianPhone';
    return <label className={`field${wide ? ' wide' : ''}${errors[name] ? ' has-error' : ''}`} key={name}>{label}{isPhone ? <span className="patient-phone-control"><span className="patient-phone-prefix" aria-hidden="true">09</span><input name={name} type="tel" placeholder="XX-XXX-XXXX" value={formatPhilippinePhoneRemainder(values[name])} onChange={update} required={required} aria-invalid={Boolean(errors[name])} /></span> : type === 'textarea' ? <textarea name={name} rows={2} placeholder={placeholder} value={values[name]} onChange={update} aria-invalid={Boolean(errors[name])}/> : type === 'date' ? <PatientDatePicker id={`patient-${name}`} value={values[name]} max={today} invalid={Boolean(errors[name])} required={required} onChange={value => updateField(name, value)}/> : <input name={name} type={type} placeholder={placeholder} value={values[name]} onChange={update} required={required} aria-invalid={Boolean(errors[name])}/>}{errors[name] && <small className="patient-field-error" role="alert">{errors[name]}</small>}</label>;
  };
  const selectField = (name, label, placeholder, options) => <label className={`field${errors[name] ? ' has-error' : ''}`} key={name}>{label}<PatientFilterDropdown value={values[name] || placeholder} options={options} label={label.replace(' *', '')} compact onChange={value => updateField(name, value)}/>{errors[name] && <small className="patient-field-error" role="alert">{errors[name]}</small>}</label>;
  const measurementField = (name, label, unit) => <div className="field" key={name}><label htmlFor={`patient-${name}`}>{label}</label><div className="patient-measurement-control"><input id={`patient-${name}`} name={name} type="number" min="0" step="any" placeholder={`Enter ${label.toLowerCase()}`} value={values[name] === 'None' ? '' : values[name]} disabled={values[name] === 'None'} onChange={update} aria-label={label}/><label className="patient-measurement-none"><input type="checkbox" checked={values[name] === 'None'} onChange={event => updateField(name, event.target.checked ? 'None' : '')} aria-label={`Select no ${unit} value`}/><span>None</span></label></div></div>;

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="form-modal patient-add-modal" role="dialog" aria-modal="true" aria-labelledby="patient-modal-title">
      {createdPatient ? <>
        <header className="modal-heading"><div><p className="eyebrow">PATIENT PROFILE</p><h2 id="patient-modal-title">Patient Added Successfully</h2></div><button className="close-button" type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="patient-add-success"><span className="patient-add-success-icon" aria-hidden="true">✓</span><p>The patient profile has been created and is ready for appointments, treatments, and billing records.</p><div className="patient-add-id"><small>Patient ID</small><strong>{createdPatient.patientNumber}</strong><span>{createdPatient.name}</span></div><div className="patient-add-success-actions"><button className="primary-button" type="button" onClick={() => onViewPatient(createdPatient)}>View Patient Profile</button><button className="secondary-button" type="button" onClick={() => { setValues(emptyPatientForm()); setErrors({}); setCreatedPatient(null); }}>Add Another Patient</button></div></div>
      </> : <>
        <header className="modal-heading"><div><p className="eyebrow">CLINIC WORKSPACE</p><h2 id="patient-modal-title">Add Patient</h2><p>Create a patient profile for appointments, treatments, and billing.</p></div><button className="close-button" type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <form className="patient-add-form" noValidate onSubmit={save}>
          <div className="patient-add-scroll">
            <section className="patient-add-section"><header><h3>Patient Information</h3><p>Personal and contact details</p></header><div className="patient-add-grid">
              {input('name', 'Full Name *', "Enter patient's full name", 'text', true, true)}
              {input('phone', 'Phone Number *', '09XX-XXX-XXXX', 'tel', false, true)}
              {input('email', 'Email Address (Optional)', 'name@example.com', 'email')}
              {input('dateOfBirth', 'Date of Birth *', '', 'date', false, true)}
              <div className="field patient-age-field"><span>Age (Auto-calculated)</span><output>{calculatedAge === null ? 'Select date of birth' : `${calculatedAge} ${calculatedAge === 1 ? 'year' : 'years'} old`}</output><small>Updates automatically from date of birth</small></div>
              {selectField('gender', 'Sex *', 'Select sex', SEX_OPTIONS)}
              {selectField('civilStatus', 'Civil Status *', 'Select civil status', CIVIL_STATUS_OPTIONS)}
              {measurementField('height', 'Height (cm) (Optional)', 'height')}
              {measurementField('weight', 'Weight (kg) (Optional)', 'weight')}
              {input('occupation', 'Occupation (Optional)', 'Enter occupation')}
              {input('address', 'Address *', 'Enter patient address', 'text', true, true)}
            </div></section>
            {calculatedAge !== null && calculatedAge >= 19 && <section className="patient-add-section"><header><h3>Emergency Contact Information</h3><p>{values.civilStatus === 'Married' ? 'Required for married patients' : 'Optional for adult patients'}</p></header><div className="patient-add-grid">
              {input('emergencyContactName', `Emergency Contact Name${values.civilStatus === 'Married' ? ' *' : ' (Optional)'}`, 'Enter contact name', 'text', false, values.civilStatus === 'Married')}
              {selectField('emergencyContactRelationship', `Relationship${values.civilStatus === 'Married' ? ' *' : ' (Optional)'}`, 'Select relationship', EMERGENCY_RELATIONSHIP_OPTIONS)}
              {input('emergencyContactPhone', `Contact Number${values.civilStatus === 'Married' ? ' *' : ' (Optional)'}`, '09XX-XXX-XXXX', 'tel', false, values.civilStatus === 'Married')}
            </div></section>}
            {calculatedAge !== null && calculatedAge <= 18 && <section className="patient-add-section"><header><h3>Parent / Guardian Information</h3><p>Required for patients age 18 or below</p></header><div className="patient-add-grid">
              {input('parentGuardianName', 'Parent / Guardian Name *', 'Enter parent or guardian name', 'text', false, true)}
              {selectField('parentGuardianRelationship', 'Relationship to Patient *', 'Select relationship', GUARDIAN_RELATIONSHIP_OPTIONS)}
              {input('parentGuardianPhone', 'Contact Number *', '09XX-XXX-XXXX', 'tel', false, true)}
            </div></section>}
            <section className="patient-add-section"><header><h3>Medical Overview</h3><p>Enter “None” when there is no known information</p></header><div className="patient-add-grid patient-medical-form-grid">
              {input('allergies', 'Allergies', 'Enter known allergies or “None”', 'textarea')}
              {input('conditions', 'Medical Conditions', 'Enter existing medical conditions or “None”', 'textarea')}
              {input('medications', 'Current Medications', 'Enter current medications or “None”', 'textarea')}
              {input('seriousIllnesses', 'Other Serious Illnesses', 'Enter other serious illnesses or “None”', 'textarea')}
              {input('pregnancyStatus', 'Pregnancy Status', 'Enter pregnancy status or “None”')}
              {input('mouthSoresGrowths', 'Sores or Growths in Mouth', 'Enter details or “None”', 'textarea')}
            </div></section>
            <section className="patient-add-section"><header><h3>Clinical Notes</h3><p>Additional information for the patient’s care record</p></header><div className="patient-add-grid">{input('notes', 'Clinical Notes (Optional)', 'Add additional information about the patient.', 'textarea', true)}</div></section>
          </div>
          {saveError && <p className="form-error" role="alert">{saveError}</p>}
          <footer className="form-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Patient'}</button></footer>
        </form>
      </>}
    </section>
  </div>;
}

function PatientAddIcon() {
  return <svg className="patient-add-button-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
    <path d="M2.5 21v-2a6 6 0 0 1 12 0v2M19 8v6m-3-3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function PatientDetailsIcon({ name }) {
  const shapes = {
    phone: <path d="M7 3H4.8A1.8 1.8 0 0 0 3 4.8C3 13.7 10.3 21 19.2 21a1.8 1.8 0 0 0 1.8-1.8V17l-4.7-2-2 2a14 14 0 0 1-5.5-5.5l2-2L9 3H7Z" />,
    message: <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.8-3A7.5 7.5 0 1 1 20 11.5Z" />,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M4 10h16"/></>,
    edit: <><path d="m14 5 5 5M4 20l4.2-.8L20 7.4 16.6 4 4.8 15.8 4 20Z"/><path d="M13 21h8"/></>,
    email: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    person: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-1a7.5 7.5 0 0 1 15 0v1"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
    note: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    treatment: <><path d="M8.3 4.2C5.4 3.4 3 5.6 3 8.5c0 3.8 2.1 10.6 4.3 12.3 1.7 1.3 2.6-.1 3.2-2.5l.6-2.5c.3-1.1 1.5-1.1 1.8 0l.6 2.5c.6 2.4 1.5 3.8 3.2 2.5C18.9 19.1 21 12.3 21 8.5c0-2.9-2.4-5.1-5.3-4.3C13.8 4.7 12.9 6 12 6s-1.8-1.3-3.7-1.8Z"/></>,
  };
  return <svg className="patient-details-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] || shapes.note}</svg>;
}

function PatientRecordIcon() { return <svg viewBox="0 0 200 190" fill="none" aria-hidden="true"><circle cx="100" cy="96" r="91" fill="#EAF9F1"/><path d="m66 19 64-5c14-1 22 8 24 22l17 111c2 14-6 23-20 25l-68 9c-14 2-23-7-25-21L42 50c-2-14 7-29 24-31Z" fill="white" stroke="#BDEBD2" strokeWidth="4"/><path d="M88 17h35c6 0 10 4 10 10v7c0 5-4 9-9 9H88c-6 0-10-4-10-9v-7c0-6 4-10 10-10Z" fill="#C6F1D7"/><path d="M91 72c-8-2-15 4-16 13-2 12 4 28 8 39 3 9 8 10 10 1l3-13c2-8 7-8 9 0l4 13c3 9 8 8 11-1 4-11 10-28 8-40-1-8-8-14-16-12-6 1-10 5-11 5-2 0-5-4-10-5Z" fill="#EAF9F1" stroke="#16825F" strokeWidth="3.5" strokeLinejoin="round"/><path d="M68 152h66" stroke="#C6F1D7" strokeWidth="8" strokeLinecap="round"/><circle cx="163" cy="151" r="29" fill="#69DF95" stroke="white" strokeWidth="5"/><path d="M163 138v26M150 151h26" stroke="#167854" strokeWidth="3" strokeLinecap="round"/><circle cx="18" cy="64" r="6" fill="#BDEBD2"/><circle cx="179" cy="34" r="5" fill="#69DF95"/></svg>; }

function PatientDetails({ patient, patientCode, patients, appointments, visits = [], invoices, onBack, onNavigate, onOpenConversation, onUpdate, onAddVisit }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showVisitToast, setShowVisitToast] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savingChanges, setSavingChanges] = useState(false);
  const patientAge = ageOf(patient.dateOfBirth);
  const hasEmergencyContact = Boolean(patient.emergencyContactName || patient.emergencyContactRelationship || patient.emergencyContactPhone);
  const hasParentGuardian = Boolean(patient.parentGuardianName || patient.parentGuardianRelationship || patient.parentGuardianPhone);
  const showEmergencyContact = patientAge === null ? hasEmergencyContact : patientAge >= 19;
  const showParentGuardian = hasParentGuardian;
  const allVisits = [...appointments, ...visits.map(visit => ({ ...visit, service: visit.service || visit.treatmentType || 'Dental visit', status: 'Completed', visitSource: visit.visitSource || visit.visitType || 'Walk-In', visitType: visit.visitSource || visit.visitType || 'Walk-In', time: '' }))]
    .filter(item => isForPatient(item, patient))
    .sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));
  const upcoming = allVisits.find(isUpcomingAppointment);
  const latestVisit = [...allVisits].reverse().find(item => isCompletedVisit(item) && item.date <= todayISO()) || (patient.lastVisitDate ? { date: patient.lastVisitDate } : null);
  const patientInvoices = invoices.filter(item => item.patientId ? item.patientId === patient.id : normalize(item.patient) === normalize(patient.name)).sort((a, b) => (b.invoiceDate || b.dueDate || '').localeCompare(a.invoiceDate || a.dueDate || ''));
  const paid = patientInvoices.reduce((sum, item) => sum + invoicePaid(item), 0);
  const billed = patientInvoices.reduce((sum, item) => sum + invoiceTotal(item), 0);
  const balance = Math.max(0, billed - paid);
  const progress = billed ? Math.min(100, Math.round(paid / billed * 100)) : 0;
  const transactions = patientInvoices.flatMap(invoice => invoicePayments(invoice).map((payment, index) => ({ ...payment, amount: numericAmount(payment.amount), invoice, date: payment.paymentDate || invoice.paymentDate || invoice.invoiceDate || invoice.dueDate, key: payment.id || payment.receiptNumber || `${invoice.id || invoice.patientNumber || invoice.treatment}-${index}` }))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const nextDueDate = patientInvoices.filter(item => normalize(item.status) !== 'paid' && item.dueDate >= todayISO()).map(item => item.dueDate).sort()[0];
  const timeline = [...allVisits.map(item => ({ date: item.date, title: /walk[ -]?in/i.test(item.visitType || '') ? 'Walk-in visit recorded' : normalize(item.status) === 'completed' ? 'Appointment completed' : normalize(item.status) === 'cancelled' ? 'Appointment cancelled' : 'Appointment scheduled', detail: `${item.service || 'Dental visit'}${item.notes ? ` · ${item.notes}` : ''}` })), ...transactions.map(item => ({ date: item.date, title: 'Payment received', detail: `${money(item.amount)} · ${item.invoice.treatment || 'Treatment'}` }))].filter(item => item.date).sort((a, b) => a.date.localeCompare(b.date));
  const historyNotes = (patient.notes || '').split('\n').filter(Boolean);
  const patientActive = isPatientActive(patient);
  const hasKnownAllergies = Boolean(String(patient.allergies || '').trim() && normalize(patient.allergies) !== 'none');
  const activity = [...transactions.map(item => ({ date: item.date, icon: 'payment', title: 'Payment recorded', detail: `${money(item.amount)}${item.paymentMethod ? ` · ${item.paymentMethod}` : ''}` })), ...patientInvoices.filter(item => !invoicePaid(item)).map(item => ({ date: item.invoiceDate || item.createdAt || item.dueDate, icon: 'note', title: 'Invoice created', detail: `${item.treatment || 'Treatment'} · ${money(invoiceTotal(item))}` })), ...allVisits.map(item => ({ date: item.date, icon: 'calendar', title: /walk[ -]?in/i.test(item.visitType || '') ? 'Walk-in visit recorded' : normalize(item.status) === 'completed' ? 'Appointment completed' : 'Appointment scheduled', detail: `${item.service || 'Dental visit'}${item.notes ? ` · ${item.notes}` : ''}` })), ...historyNotes.map(note => ({ date: patient.updatedAt || patient.createdAt, icon: 'note', title: 'Clinical note added', detail: note }))].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const saveNote = async values => { const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); await onUpdate(patient.id, { notes: [...historyNotes, `${stamp} · ${values.note.trim()}`].join('\n'), updatedAt: new Date().toISOString() }); setShowNote(false); };
  const savePatientChanges = async () => {
    if (!pendingChanges || savingChanges) return;
    setSavingChanges(true);
    setSaveError('');
    try {
      await onUpdate(patient.id, pendingChanges);
      setPendingChanges(null);
      setShowEdit(false);
      setShowSavedToast(true);
    } catch (error) {
      setSaveError(error.message || 'The patient record could not be updated.');
    } finally {
      setSavingChanges(false);
    }
  };
  const openConversation = () => onOpenConversation ? onOpenConversation(patient) : onNavigate('Messages');
  const saveVisit = async visit => {
    if (!onAddVisit) throw new Error('New visits are unavailable right now.');
    await onAddVisit(visit);
    setShowVisitForm(false);
    setShowVisitToast(true);
  };
  const changedFields = pendingChanges ? fields.filter(field => field.type !== 'age' && String(pendingChanges[field.name] ?? '') !== String(patient[field.name] ?? '')).map(field => ({ label: patientChangeLabels[field.name] || field.label, value: pendingChanges[field.name] || 'Not provided' })) : [];
  useEffect(() => {
    if (!showSavedToast) return undefined;
    const timeout = window.setTimeout(() => setShowSavedToast(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [showSavedToast]);
  useEffect(() => {
    if (!showVisitToast) return undefined;
    const timeout = window.setTimeout(() => setShowVisitToast(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [showVisitToast]);

  return <div className="content-page patients-page patient-details-page">
    <div className="patient-breadcrumb"><button onClick={onBack}>Patients</button><span>›</span><b>{patient.name}</b></div>
    <div className="patient-details-heading"><div><h1>Patient Details</h1><p>Complete care record and clinical timeline.</p></div><div className="patient-details-heading-actions"><button className="patient-edit-button" onClick={() => setShowEdit(true)}><PatientDetailsIcon name="edit"/> Edit Patient</button><button className="primary-button patient-new-visit-button" onClick={() => setShowVisitForm(true)}><PatientDetailsIcon name="calendar"/> New Visit</button></div></div>
    <div className="patient-details-layout"><div className="patient-details-main">
      <section className="patient-info-section"><h2>Personal Information</h2><div className="patient-info-card">
        <div className="patient-info-top"><span className="patient-detail-avatar">{initials(patient.name)}</span><div className="patient-detail-name"><small>Full Name</small><h3>{patient.name || 'Not Provided'}</h3><p>Patient ID · {patientCode}</p></div><span className={`patient-active-label${patientActive ? '' : ' is-inactive'}`}><i/>{patientActive ? 'Active patient' : 'Inactive patient'}</span></div>
        <div className="patient-contact-actions"><a className="patient-outline-action" href={patient.phone ? `tel:${patient.phone.replace(/[^\d+]/g, '')}` : undefined} aria-disabled={!patient.phone}><PatientDetailsIcon name="phone"/> Call</a><button className="patient-outline-action" onClick={openConversation}><PatientDetailsIcon name="message"/> Message</button><button className="patient-primary-action" onClick={() => onNavigate('Schedule')}><PatientDetailsIcon name="calendar"/> Book Appointment</button></div>
        <div className="patient-contact-grid"><div><b><PatientDetailsIcon name="phone"/></b><span>Phone Number</span><p>{patient.phone || 'Not Provided'}</p></div><div><b><PatientDetailsIcon name="email"/></b><span>Email Address</span><p>{patient.email || 'Not Provided'}</p></div><div><b><PatientDetailsIcon name="location"/></b><span>Address</span><p>{patient.address || 'Not Provided'}</p></div></div>
        <div className="patient-demographic-grid"><div><small>Date of Birth</small><b>{patient.dateOfBirth ? formatDate(patient.dateOfBirth) : 'Not Provided'}</b></div><div><small>Age · Auto-calculated</small><b>{patientAge === null ? 'Not Provided' : `${patientAge} ${patientAge === 1 ? 'year' : 'years'} old`}</b></div><div><small>Sex</small><b>{patient.gender || 'Not Provided'}</b></div><div><small>Civil Status</small><b>{patient.civilStatus || 'Not Provided'}</b></div><div><small>Occupation</small><b>{patient.occupation || 'Not Provided'}</b></div><div><small>Height</small><b>{measurementText(patient.height, 'cm')}</b></div><div><small>Weight</small><b>{measurementText(patient.weight, 'kg')}</b></div>{patient.referredBy && <div><small>Referred By</small><b>{patient.referredBy}</b></div>}</div>
        {showEmergencyContact && <div className="patient-emergency-information"><h3>Emergency Contact Information</h3><div><span><small>Name</small><b>{patient.emergencyContactName || 'Not Provided'}</b></span><span><small>Relationship</small><b>{patient.emergencyContactRelationship || 'Not Provided'}</b></span><span><small>Contact Number</small><b>{patient.emergencyContactPhone || 'Not Provided'}</b></span></div></div>}
        {showParentGuardian && <div className="patient-emergency-information patient-guardian-information"><h3>Parent / Guardian Information</h3><div><span><small>Name</small><b>{patient.parentGuardianName || 'Not Provided'}</b></span><span><small>Relationship</small><b>{patient.parentGuardianRelationship || 'Not Provided'}</b></span><span><small>Contact Number</small><b>{patient.parentGuardianPhone || 'Not Provided'}</b></span></div></div>}
      </div></section>
      <section className="patient-info-section"><div className="patient-section-heading"><h2>Medical Overview</h2><button onClick={() => setShowEdit(true)}>Update</button></div><div className="patient-medical-card">
        {hasKnownAllergies ? <div className="patient-allergy-alert"><b>⚠</b><strong>{patient.allergies}</strong><span>Recorded allergy</span></div> : <div className="patient-medical-empty">✓ &nbsp; Allergies: None Reported</div>}
        <div className="patient-medical-facts"><div><small>Medical Conditions</small><b>{reportedText(patient.conditions)}</b></div><div><small>Current Medications</small><b>{reportedText(patient.medications)}</b></div><div><small>Other Serious Illnesses</small><b>{reportedText(patient.seriousIllnesses)}</b></div><div><small>Pregnancy Status</small><b>{reportedText(patient.pregnancyStatus)}</b></div><div><small>Sores or Growths in Mouth</small><b>{reportedText(patient.mouthSoresGrowths)}</b></div><div><small>Last Visit</small><b>{latestVisit ? formatDate(latestVisit.date) : 'No visits yet'}</b></div></div>
        {patient.medicalHistoryResponses && <div className="patient-registration-responses"><h3>Patient Registration Answers</h3><div className="patient-registration-response-grid">
          {(patient.medicalHistoryResponses.questions || []).map(item => <div key={item.label}><small>{item.label}</small><b>{item.answer || 'No answer recorded'}</b></div>)}
          {(patient.medicalHistoryResponses.conditions || []).length > 0 && <div><small>Selected conditions</small><b>{patient.medicalHistoryResponses.conditions.join(', ')}</b></div>}
          {(patient.medicalHistoryResponses.details || []).map(item => <div key={item.label}><small>{item.label}</small><b>{item.answer}</b></div>)}
        </div><small className="patient-registration-submitted">Submitted {patient.medicalHistoryResponses.submittedAt ? new Date(patient.medicalHistoryResponses.submittedAt).toLocaleString() : 'date unavailable'}</small></div>}
      </div></section>
      <section className="patient-info-section"><h2>Dental Treatment Summary</h2><div className="patient-treatment-grid">
        <article className="patient-detail-panel"><header><b>Current Dental Plan</b><span className="patient-status-pill">{patient.treatmentPlan ? 'Active' : 'No plan'}</span></header><small>Dental Plan Type</small><strong className="patient-treatment-title"><PatientDetailsIcon name="treatment"/>{patient.treatmentPlan || patientInvoices[0]?.treatment || 'No treatment plan recorded'}</strong><hr/><small>Most recent treatment</small><b>{latestVisit?.service || patientInvoices[0]?.treatment || 'No treatment history yet'}</b><div className="patient-plan-next"><PatientDetailsIcon name="calendar"/><div><small>Next appointment</small><b>{upcoming ? `${formatDate(upcoming.date)}${upcoming.time ? ` · ${formatAppointmentTime(upcoming.time)}` : ''}` : 'No upcoming appointment'}</b></div></div></article>
        <article className="patient-detail-panel patient-payment-summary"><header><b>Payment Information</b><span className={`patient-status-pill ${balance ? 'is-pending' : ''}`}>{balance ? 'Balance due' : billed ? 'On track' : 'No invoices'}</span></header><div className="patient-payment-stats"><div><small>Total Treatment Cost</small><strong>{money(billed)}</strong></div><div><small>Amount Paid</small><strong>{money(paid)}</strong></div></div><hr/><div className="patient-billing-row"><span>Remaining balance</span><b>{money(balance)}</b></div><div className="patient-billing-progress"><div><span>Payment progress</span><b>{progress}%</b></div><span className="patient-progress-track"><i style={{ width: `${progress}%` }}/></span></div></article>
      </div></section>
      <section className="patient-info-section patient-timeline-card"><h2>Treatment Timeline</h2>{timeline.length ? <div className="patient-timeline">{timeline.map((item, index) => <div className="patient-timeline-item" key={`${item.date}-${index}`}><i/><time>{formatDate(item.date)}</time><b>{item.title}</b><small>{item.detail}</small></div>)}</div> : <div className="patient-detail-empty-inline">Visits and billing activity will appear here as they are recorded.</div>}
        <div className="patient-adjustment-history"><h3>Visit History</h3>{allVisits.length ? <div className="table-scroll"><table><thead><tr><th>Date</th><th>Visit details</th><th>Status</th></tr></thead><tbody>{[...allVisits].reverse().map(item => <tr key={item.id}><td>{formatDate(item.date)}</td><td>{item.service || 'Dental visit'}{item.notes ? <small className="patient-visit-note">{item.notes}</small> : null}</td><td><span className={`patient-visit-status status-${(item.status || 'scheduled').toLowerCase()}`}>{item.status || 'Scheduled'}</span></td></tr>)}</tbody></table></div> : <p>No visits have been recorded for this patient.</p>}</div>
      </section>
      <section className="patient-info-section patient-clinical-notes"><div className="patient-section-heading"><h2>Clinical Notes</h2><button onClick={() => setShowNote(true)}>Add note</button></div><div className="patient-detail-panel">{historyNotes.length ? historyNotes.map((note, index) => <article className="patient-note-entry" key={`${index}-${note}`}><small>{index ? 'Clinical note' : 'Patient note'} <time>{formatDate(patient.updatedAt || patient.createdAt)}</time></small><p>{note}</p><span>{patient.name} · {formatDate(patient.updatedAt || patient.createdAt)}</span></article>) : <div className="patient-detail-empty-inline">None Reported. Add a clinical note to keep this patient’s care record up to date.</div>}</div></section>
    </div>
    <aside className="patient-details-sidebar">
      <section className="patient-side-section"><h2>Upcoming Appointment</h2><div className="patient-side-card">{upcoming ? <><div className="patient-upcoming-row"><span className="patient-date-tile"><small>{dateValue(upcoming.date)?.toLocaleDateString(undefined, { month: 'short' })}</small><b>{dateValue(upcoming.date)?.getDate()}</b></span><div><b>{upcoming.service || 'Dental appointment'}</b><span className="patient-status-pill">{upcoming.status || 'Scheduled'}</span></div></div><div className="patient-upcoming-time"><PatientDetailsIcon name="clock"/>{upcoming.time ? formatAppointmentTime(upcoming.time) : 'Time not set'}{upcoming.duration ? ` · ${upcoming.duration} min` : ''}</div></> : <div className="patient-side-empty">No upcoming appointments</div>}</div></section>
      <section className="patient-side-section"><h2>Payment Status</h2><div className="patient-side-card patient-payment-card"><header><b>Payment Progress</b><span className={`patient-status-pill ${balance ? 'is-pending' : ''}`}>{balance ? 'Balance due' : billed ? 'On track' : 'No invoices'}</span></header><div className="patient-monthly-balance"><small>Outstanding balance</small><strong>{money(balance)}</strong><span>{nextDueDate ? `Next due · ${formatDate(nextDueDate)}` : `Across ${patientInvoices.length} ${patientInvoices.length === 1 ? 'invoice' : 'invoices'}`}</span></div><div className="patient-billing-progress"><div><span>Payment progress</span><b>{progress}%</b></div><span className="patient-progress-track"><i style={{ width: `${progress}%` }}/></span></div><div className="patient-side-money"><div><small>Amount paid</small><b>{money(paid)}</b></div><div><small>Total billed</small><b>{money(billed)}</b></div></div><button className="patient-side-primary" onClick={() => onNavigate('Billing')}><PatientDetailsIcon name="payment"/> Record Payment</button></div></section>
      <section className="patient-side-section"><h2>Recent Transactions</h2><div className="patient-side-card patient-transactions">{transactions.length ? <>{transactions.slice(0, 5).map(item => <div className="patient-transaction" key={item.key}><div><b>{item.invoice.treatment || item.receiptNumber || 'Treatment payment'}</b><small>{formatDate(item.date)}{item.paymentMethod ? ` · ${item.paymentMethod}` : ' · Payment recorded'}</small></div><strong>{money(item.amount)}</strong></div>)}<div className="patient-transaction-total"><span>Total billed</span><b>{money(billed)}</b></div></> : <div className="patient-side-empty">No payments recorded yet.</div>}</div></section>
      <section className="patient-side-section"><h2>Recent Activity</h2><div className="patient-side-card patient-activity-list">{activity.length ? activity.map((item, index) => <div className="patient-activity-item" key={`${item.title}-${item.date}-${index}`}><span><PatientDetailsIcon name={item.icon}/></span><div><b>{item.title}</b><small>{item.detail}</small><time>{formatDate(item.date)}</time></div></div>) : <div className="patient-side-empty">Patient activity will appear here.</div>}</div></section>
      <section className="patient-side-section"><h2>Quick Actions</h2><div className="patient-side-card patient-quick-actions"><button onClick={() => onNavigate('Schedule')}><PatientDetailsIcon name="calendar"/><span>Schedule Appointment</span><i>›</i></button><button onClick={() => onNavigate('Billing')}><PatientDetailsIcon name="payment"/><span>Record Payment</span><i>›</i></button><button onClick={() => setShowNote(true)}><PatientDetailsIcon name="note"/><span>Add Clinical Note</span><i>›</i></button><button onClick={openConversation}><PatientDetailsIcon name="message"/><span>Send Message</span><i>›</i></button><button onClick={() => document.querySelector('.patient-timeline-card')?.scrollIntoView({ behavior: 'smooth' })}><PatientDetailsIcon name="clock"/><span>View Treatment History</span><i>›</i></button></div></section>
    </aside></div>
    {showEdit && <FormModal title="Edit patient" description="Update this patient’s information." modalClassName="patient-edit-modal" fields={fields.map(field => ({ ...field, styledSelect: field.type === 'select', renderInput: field.name === 'dateOfBirth' ? ({ id, value, onChange, required, invalid }) => <PatientDatePicker id={id} value={value} max={todayISO()} onChange={onChange} required={required} invalid={invalid}/> : undefined, max: field.name === 'dateOfBirth' ? todayISO() : field.max, defaultValue: patient[field.name] ?? '' }))} submitLabel="Save changes" showCancel={false} onClose={() => setShowEdit(false)} onSubmit={setPendingChanges}/>}
    {showNote && <FormModal title="Add clinical note" description="Add a note to this patient’s care record." fields={noteFields} submitLabel="Save note" onClose={() => setShowNote(false)} onSubmit={saveNote}/>}
    {showVisitForm && <NewVisitModal patients={patients} initialPatient={patient} onClose={() => setShowVisitForm(false)} onSave={saveVisit}/>}
    {pendingChanges && <div className="modal-backdrop patient-save-confirm-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !savingChanges) setPendingChanges(null); }}><section className="form-modal patient-save-confirm" role="dialog" aria-modal="true" aria-labelledby="patient-save-confirm-title"><header className="patient-save-confirm-heading"><span className="patient-save-confirm-icon" aria-hidden="true">?</span><div><h2 id="patient-save-confirm-title">Save Changes?</h2><p>Are you sure you want to save these changes to the patient's profile?</p><p>Any updated information will immediately replace the previous patient details.</p></div></header>{changedFields.length > 0 && <div className="patient-save-summary"><h3>Updated Information</h3><dl>{changedFields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></div>}{saveError && <p className="form-error" role="alert">{saveError}</p>}<footer className="patient-save-confirm-actions"><button className="secondary-button" type="button" disabled={savingChanges} onClick={() => { setPendingChanges(null); setSaveError(''); }}>Continue Editing</button><button className="primary-button" type="button" disabled={savingChanges} onClick={savePatientChanges}>{savingChanges ? 'Saving…' : 'Save Changes'}</button></footer></section></div>}
    {showSavedToast && <div className="patient-save-toast" role="status" aria-live="polite"><span className="patient-save-toast-icon" aria-hidden="true">✓</span><div><b>Changes Saved</b><p>The patient's profile has been updated successfully.</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setShowSavedToast(false)}>×</button></div>}
    {showVisitToast && <div className="patient-save-toast new-visit-success-toast" role="status" aria-live="polite"><span className="patient-save-toast-icon" aria-hidden="true">✓</span><div><b>Visit Recorded Successfully</b><p>The patient visit has been added and reports have been updated.</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setShowVisitToast(false)}>×</button></div>}
  </div>;
}

export default function Patients({ patients, appointments = [], visits = [], invoices = [], onAdd, onUpdate, onAddVisit, onNavigate, onOpenConversation }) {
  const [query, setQuery] = useState('');
  const [savedFilters] = useState(readPatientFilters);
  const [patientFilter, setPatientFilter] = useState(savedFilters.patientFilter);
  const [visitFilter, setVisitFilter] = useState(savedFilters.visitFilter);
  const [advancedFilters, setAdvancedFilters] = useState(savedFilters.advanced);
  const [advancedDraft, setAdvancedDraft] = useState(savedFilters.advanced);
  const [sortBy, setSortBy] = useState('Recent');
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [showVisitToast, setShowVisitToast] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = todayISO();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const visitRecords = useMemo(() => [...appointments, ...visits.map(visit => ({ ...visit, service: visit.service || visit.treatmentType || 'Dental visit', status: 'Completed', visitSource: visit.visitSource || visit.visitType || 'Walk-In', visitType: visit.visitSource || visit.visitType || 'Walk-In', time: '' }))], [appointments, visits]);
  const visitsFor = patient => visitRecords.filter(item => isForPatient(item, patient));
  const lastVisitFor = patient => visitsFor(patient).filter(item => isCompletedVisit(item) && item.date <= today).sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`))[0] || (patient.lastVisitDate ? { date: patient.lastVisitDate, status: 'Completed' } : null);
  const treatmentFor = patient => lastVisitFor(patient)?.service || invoices.filter(item => (item.patientId ? item.patientId === patient.id : normalize(item.patient) === normalize(patient.name))).sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))[0]?.treatment || visitsFor(patient).sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`))[0]?.service || '—';

  useEffect(() => {
    try { localStorage.setItem(PATIENT_FILTERS_KEY, JSON.stringify({ patientFilter, visitFilter, advanced: advancedFilters })); }
    catch { /* Keep filter behavior available if browser storage is unavailable. */ }
  }, [patientFilter, visitFilter, advancedFilters]);
  useEffect(() => {
    if (!showVisitToast) return undefined;
    const timeout = window.setTimeout(() => setShowVisitToast(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [showVisitToast]);

  const filtered = useMemo(() => {
    const rows = patients.filter(patient => {
      const patientIndex = patients.indexOf(patient);
      const code = patientCode(patient, patientIndex);
      const matchSearch = [patient.name, code, patient.id, patient.phone, patient.email].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
      const created = dateValue(patient.createdAt);
      const validCreatedDate = created && !Number.isNaN(created.valueOf());
      const addedMonth = validCreatedDate && created >= monthStart;
      const addedYear = validCreatedDate && created >= startOfYear;
      const isActive = isPatientActive(patient);
      const completedVisits = visitsFor(patient).filter(item => isCompletedVisit(item) && item.date <= today);
      const lastVisit = completedVisits.sort((a, b) => `${b.date || ''} ${b.time || ''}`.localeCompare(`${a.date || ''} ${a.time || ''}`))[0];
      const hasUpcoming = visitsFor(patient).some(isUpcomingAppointment);
      const hasActiveTreatment = Boolean(patient.hasActiveTreatment === true || String(patient.treatmentPlan || '').trim() && normalize(patient.treatmentStatus || 'active') === 'active');
      const profileComplete = isProfileComplete(patient);
      const withinDays = days => {
        if (!lastVisit?.date) return false;
        const cutoff = new Date(`${today}T12:00:00`);
        cutoff.setDate(cutoff.getDate() - days);
        const cutoffISO = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
        return lastVisit.date >= cutoffISO && lastVisit.date <= today;
      };
      const matchPatientFilter = patientFilter === 'All Patients'
        || (patientFilter === 'Added This Month' && addedMonth)
        || (patientFilter === 'Active Patients' && isActive)
        || (patientFilter === 'Inactive Patients' && !isActive);
      const matchVisitFilter = visitFilter === 'All Visits'
        || (visitFilter === 'No Visit History' && completedVisits.length === 0)
        || (visitFilter === 'Visited Within 30 Days' && withinDays(30))
        || (visitFilter === 'Visited Within 90 Days' && withinDays(90))
        || (visitFilter === 'Visited Within 1 Year' && withinDays(365));
      const matchProfile = !advancedFilters.profile.length || advancedFilters.profile.some(value => value === (profileComplete ? 'complete' : 'incomplete'));
      const matchActivity = !advancedFilters.activity.length || advancedFilters.activity.some(value => value === (hasUpcoming ? 'upcoming' : 'no-upcoming'));
      const matchTreatment = !advancedFilters.treatment.length || advancedFilters.treatment.some(value => value === (hasActiveTreatment ? 'active-treatment' : 'no-active-treatment'));
      const matchRegistration = !advancedFilters.registration.length || advancedFilters.registration.some(value => value === 'this-month' ? addedMonth : addedYear);
      return matchSearch && matchPatientFilter && matchVisitFilter && matchProfile && matchActivity && matchTreatment && matchRegistration;
    });
    return rows.sort((a, b) => sortBy === 'Name A–Z' ? (a.name || '').localeCompare(b.name || '') : sortBy === 'Recent added' ? new Date(b.createdAt || 0) - new Date(a.createdAt || 0) : (lastVisitFor(b)?.date || '').localeCompare(lastVisitFor(a)?.date || ''));
  }, [patients, visitRecords, query, patientFilter, visitFilter, advancedFilters, sortBy, today, monthStart, startOfYear]);
  const selectedPatient = patients.find(patient => patient.id === selectedPatientId);
  const resetFilters = () => {
    setPatientFilter('All Patients');
    setVisitFilter('All Visits');
    setAdvancedDraft(emptyAdvancedFilters());
    setAdvancedFilters(emptyAdvancedFilters());
  };
  const clearFilters = () => { setQuery(''); resetFilters(); setSortBy('Recent'); setShowFilters(false); };
  const applyAdvancedFilters = () => { setAdvancedFilters(Object.fromEntries(Object.entries(advancedDraft).map(([group, values]) => [group, [...values]]))); setShowFilters(false); };
  const updateAdvancedDraft = (group, value) => setAdvancedDraft(current => ({ ...current, [group]: current[group][0] === value ? current[group] : [value] }));
  const activeFilterCount = Number(patientFilter !== 'All Patients') + Number(visitFilter !== 'All Visits') + Object.values(advancedFilters).reduce((count, values) => count + values.length, 0);
  if (selectedPatient) return <PatientDetails patient={selectedPatient} patientCode={`#${patientCode(selectedPatient, patients.indexOf(selectedPatient))}`} patients={patients} appointments={appointments} visits={visits} invoices={invoices} onBack={() => setSelectedPatientId(null)} onNavigate={onNavigate} onOpenConversation={onOpenConversation} onUpdate={onUpdate} onAddVisit={onAddVisit}/>;
  const save = values => onAdd(values);
  const saveVisit = async visit => {
    if (!onAddVisit) throw new Error('New visits are unavailable right now.');
    await onAddVisit(visit);
    setShowVisitForm(false);
    setShowVisitToast(true);
  };
  const viewPatientProfile = patient => { setSelectedPatientId(patient.id); setShowForm(false); };

  return <div className="content-page patients-page">
    <div className="patients-heading"><div><h1>Patients</h1><p>Find records, review care history, and add patients.</p></div><div className="patients-heading-actions"><button className="primary-button add-patient-button" onClick={() => setShowForm(true)}><PatientAddIcon/> Add Patient</button><button className="secondary-button new-visit-trigger" onClick={() => setShowVisitForm(true)}><PatientDetailsIcon name="calendar"/> New Visit</button></div></div>
    <div className="patients-toolbar">
      <label className="patient-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search by name, ID, or phone" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search patients"/></label>
      <PatientFilterDropdown value={patientFilter} options={PATIENT_FILTER_OPTIONS} onChange={setPatientFilter} label="Patient filter"/>
      <PatientFilterDropdown value={visitFilter} options={VISIT_FILTER_OPTIONS} onChange={setVisitFilter} label="Last visit filter"/>
      <button className={`patient-filter-button ${showFilters ? 'active' : ''} ${activeFilterCount ? 'has-filters' : ''}`} type="button" aria-label="Patient filters" aria-expanded={showFilters} aria-controls="patient-advanced-filters" onClick={() => { if (!showFilters) setAdvancedDraft(Object.fromEntries(Object.entries(advancedFilters).map(([group, values]) => [group, [...values]]))); setShowFilters(value => !value); }}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
        {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
      </button>
      {showFilters && <section className="patient-advanced-panel" id="patient-advanced-filters" aria-label="Patient filters">
        <header><div><h3>Patient Filters</h3><p>Combine profile, activity, treatment, and registration criteria.</p></div><button type="button" aria-label="Close patient filters" onClick={() => setShowFilters(false)}>×</button></header>
        <div className="patient-advanced-groups">
          {Object.entries(ADVANCED_FILTER_OPTIONS).map(([group, options]) => <fieldset className="patient-filter-group" key={group}><legend>{{ profile: 'Profile Completion', activity: 'Patient Activity', treatment: 'Treatment Status', registration: 'Registration Period' }[group]}</legend>{options.map(option => <label className={`patient-filter-choice${advancedDraft[group].includes(option.value) ? ' is-selected' : ''}`} key={option.value}><input type="radio" name={`patient-filter-${group}`} checked={advancedDraft[group].includes(option.value)} onChange={() => updateAdvancedDraft(group, option.value)}/><span className="patient-custom-radio" aria-hidden="true"/>{option.label}</label>)}</fieldset>)}
        </div>
        <footer><button className="secondary-button" type="button" onClick={resetFilters}>Reset Filters</button><button className="primary-button" type="button" onClick={applyAdvancedFilters}>Apply Filters</button></footer>
      </section>}
    </div>
    <div className="patients-list-heading"><h2>All patients <span>{filtered.length} {filtered.length === 1 ? 'record' : 'records'}</span></h2><div className="patients-sort-control"><span>Sort:</span><PatientFilterDropdown compact value={sortBy} options={['Recent', 'Recent added', 'Name A–Z']} onChange={setSortBy} label="Sort patients"/></div></div>
    {filtered.length ? <section className="patient-directory-results"><div className="patient-directory-head"><span>Patient</span><span>Phone</span><span>Last visit</span><span>Recent treatment</span><span>Status</span><span>Profile</span></div>{filtered.map(patient => {
      const lastVisit = lastVisitFor(patient);
      const code = `#${patientCode(patient, patients.indexOf(patient))}`;
      const active = isPatientActive(patient);
      return <article key={patient.id} className="patient-directory-row"><button className="patient-directory-person" onClick={() => setSelectedPatientId(patient.id)}><span className="patient-directory-avatar">{initials(patient.name)}</span><span><b>{patient.name}</b><small>{code}{ageOf(patient.dateOfBirth) !== null ? ` · Age ${ageOf(patient.dateOfBirth)}` : ''}</small></span></button><span className="patient-directory-phone">{patient.phone || '—'}</span><span className="patient-directory-visit">{lastVisit ? `${lastVisit.date === todayISO() ? 'Today' : formatDate(lastVisit.date)}${lastVisit.time ? ` · ${formatAppointmentTime(lastVisit.time)}` : ''}` : '—'}</span><span className="patient-directory-treatment">{treatmentFor(patient)}</span><span className={`patient-directory-status${active ? '' : ' is-inactive'}`}><i/> {active ? 'Active' : 'Inactive'}</span><button className="patient-open-profile" onClick={() => setSelectedPatientId(patient.id)}>Open Profile</button></article>;
    })}<div className="patients-list-footer">{filtered.length} patient {filtered.length === 1 ? 'record' : 'records'} shown</div></section> : <section className="patients-empty"><div className="patient-record-art"><PatientRecordIcon/></div><h2>{patients.length ? 'No Patients Found' : 'No Patient Records Found'}</h2><p>{patients.length ? 'No patient records match the selected filters.' : 'There are currently no patient records available. Start building your patient database by adding a new patient.'}</p><div className="patient-empty-actions"><button className="primary-button add-patient-button" onClick={() => setShowForm(true)}><PatientAddIcon/> Add Patient</button>{patients.length > 0 && <button className="secondary-button patient-clear-button" onClick={clearFilters}>Clear Filters</button>}</div></section>}
     {showForm && <AddPatientModal patients={patients} onClose={() => setShowForm(false)} onSubmit={save} onViewPatient={viewPatientProfile}/>}
     {showVisitForm && <NewVisitModal patients={patients} onClose={() => setShowVisitForm(false)} onSave={saveVisit}/>}
     {showVisitToast && <div className="patient-save-toast new-visit-success-toast" role="status" aria-live="polite"><span className="patient-save-toast-icon" aria-hidden="true">✓</span><div><b>Visit Recorded Successfully</b><p>The patient visit has been added and reports have been updated.</p></div><button type="button" aria-label="Dismiss notification" onClick={() => setShowVisitToast(false)}>×</button></div>}
  </div>;
}
