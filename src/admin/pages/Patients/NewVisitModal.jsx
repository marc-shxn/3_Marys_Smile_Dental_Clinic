import { useEffect, useMemo, useRef, useState } from 'react';
import AdminSelect from '../../components/AdminSelect.jsx';
import './NewVisitModal.css';

const TREATMENTS = [
  'Consultation',
  'Routine Cleaning',
  'Tooth Extraction',
  'Root Canal Therapy',
  'Teeth Whitening',
  'Braces Adjustment',
  'Crown & Bridge',
  'Dentures',
  'Other',
];

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseVisitDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function visitDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function VisitDatePicker({ id, value, max, invalid, onChange }) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const initial = parseVisitDate(value) || parseVisitDate(max) || new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);
  const maxDate = parseVisitDate(max) || new Date();
  const maxKey = visitDateKey(maxDate);
  const selectedDate = parseVisitDate(value);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = Array.from({ length: 42 }, (_, index) => new Date(year, month, index - firstWeekday + 1));
  const nextMonth = new Date(year, month + 1, 1);
  const canAdvance = nextMonth <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

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
    const key = visitDateKey(date);
    if (key > maxKey) return;
    onChange(key);
    setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setOpen(false);
  };

  return <div className={`new-visit-date-picker${open ? ' is-open' : ''}`} ref={pickerRef}>
    <button id={id} ref={triggerRef} type="button" className={`new-visit-date-trigger${invalid ? ' is-invalid' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-required="true" aria-invalid={Boolean(invalid)} aria-label={`Visit date, ${selectedDate?.toLocaleDateString() || 'not selected'}`} onClick={() => {
      if (!open) {
        const initial = selectedDate || maxDate;
        setViewMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
      }
      setOpen(value => !value);
    }}>
      <span>{selectedDate ? selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose a visit date'}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.3"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01"/></svg>
    </button>
    {open && <div className="new-visit-calendar" role="dialog" aria-label="Choose visit date">
      <div className="new-visit-calendar-header"><button type="button" aria-label="Previous month" onClick={() => setViewMonth(new Date(year, month - 1, 1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg></button><b>{monthLabel}</b><button type="button" aria-label="Next month" disabled={!canAdvance} onClick={() => setViewMonth(new Date(year, month + 1, 1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg></button></div>
      <div className="new-visit-calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="new-visit-calendar-grid" role="grid" aria-label={monthLabel}>{days.map((date, index) => {
        const key = visitDateKey(date);
        const isOutside = date.getMonth() !== month;
        const isToday = key === maxKey;
        const isSelected = key === value;
        return <button key={`${key}-${index}`} type="button" role="gridcell" className={`${isOutside ? 'is-outside ' : ''}${isToday ? 'is-today ' : ''}${isSelected ? 'is-selected' : ''}`} disabled={key > maxKey} aria-label={date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} aria-selected={isSelected} onClick={() => chooseDate(date)}>{date.getDate()}</button>;
      })}</div>
      <div className="new-visit-calendar-footer"><span>Future dates are unavailable</span><button type="button" onClick={() => chooseDate(maxDate)}>Today</button></div>
    </div>}
  </div>;
}

function patientIdentifier(patient, index = 0) {
  return patient.patientNumber || patient.patientCode || patient.code || `PT-${String(index + 1).padStart(4, '0')}`;
}

export default function NewVisitModal({ patients = [], initialPatient = null, onClose, onSave }) {
  const patientIsLocked = Boolean(initialPatient?.id);
  const [selectedPatient, setSelectedPatient] = useState(initialPatient);
  const [patientQuery, setPatientQuery] = useState(initialPatient?.name || '');
  const [showResults, setShowResults] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const [service, setService] = useState('');
  const [visitDate, setVisitDate] = useState(localToday);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const patientInputRef = useRef(null);
  const today = localToday();

  useEffect(() => {
    setSelectedPatient(initialPatient || null);
    setPatientQuery(initialPatient?.name || '');
  }, [initialPatient]);

  const matches = useMemo(() => {
    const query = patientQuery.trim().toLocaleLowerCase();
    if (!query) return patients.slice(0, 8);
    return patients.filter((patient, index) => `${patient.name || ''} ${patientIdentifier(patient, index)}`.toLocaleLowerCase().includes(query)).slice(0, 8);
  }, [patients, patientQuery]);

  const choosePatient = patient => {
    setSelectedPatient(patient);
    setPatientQuery(patient.name || '');
    setShowResults(false);
    setActiveResult(-1);
    setError('');
  };

  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    if (!selectedPatient) {
      setError('Select an existing patient.');
      patientInputRef.current?.focus();
      setShowResults(true);
      return;
    }
    if (!service) { setError('Select a treatment or service.'); return; }
    if (!visitDate) { setError('Enter a visit date.'); return; }
    if (visitDate > today) { setError('Visit date cannot be in the future.'); return; }

    setSaving(true);
    setError('');
    try {
      await onSave({
        patientId: selectedPatient.id,
        patient: selectedPatient.name,
        service,
        visitDate,
        clinicalNotes: clinicalNotes.trim(),
        visitSource: 'Walk-In',
      });
    } catch (saveError) {
      setError(saveError.message || 'The visit could not be saved.');
      setSaving(false);
    }
  };

  const onPatientKeyDown = event => {
    if (event.key === 'ArrowDown' && matches.length) {
      event.preventDefault();
      setShowResults(true);
      setActiveResult(index => (index + 1) % matches.length);
    } else if (event.key === 'ArrowUp' && matches.length) {
      event.preventDefault();
      setShowResults(true);
      setActiveResult(index => index < 0 ? matches.length - 1 : (index - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter' && showResults && matches[activeResult < 0 ? 0 : activeResult]) {
      event.preventDefault();
      choosePatient(matches[activeResult < 0 ? 0 : activeResult]);
    } else if (event.key === 'Escape') {
      setShowResults(false);
    }
  };

  return <div className="modal-backdrop new-visit-backdrop">
    <section className="form-modal new-visit-modal" role="dialog" aria-modal="true" aria-labelledby="new-visit-title">
      <header className="modal-heading">
        <div><p className="eyebrow">CLINIC WORKSPACE</p><h2 id="new-visit-title">New Visit</h2><p>Record a visit for an existing patient.</p></div>
        <button className="close-button" type="button" aria-label="Close New Visit" onClick={onClose} disabled={saving}>×</button>
      </header>
      <form onSubmit={submit} noValidate>
        <div className="new-visit-fields">
          <div className="field new-visit-patient-field">
            <label htmlFor="new-visit-patient">Patient <span>*</span></label>
            <div className="new-visit-autocomplete">
              <input
                ref={patientInputRef}
                id="new-visit-patient"
                type={patientIsLocked ? 'text' : 'search'}
                className={patientIsLocked ? 'is-locked' : undefined}
                role={patientIsLocked ? undefined : 'combobox'}
                aria-autocomplete={patientIsLocked ? undefined : 'list'}
                aria-expanded={patientIsLocked ? false : showResults}
                aria-controls={patientIsLocked ? undefined : 'new-visit-patient-results'}
                aria-activedescendant={!patientIsLocked && showResults && matches.length ? `new-visit-patient-option-${activeResult < 0 ? 0 : activeResult}` : undefined}
                aria-readonly={patientIsLocked}
                aria-invalid={error === 'Select an existing patient.'}
                placeholder={patientIsLocked ? '' : 'Search patient by name or Patient ID'}
                value={patientQuery}
                autoComplete="off"
                readOnly={patientIsLocked}
                onFocus={() => { if (!patientIsLocked) setShowResults(true); }}
                onBlur={() => { if (!patientIsLocked) window.setTimeout(() => setShowResults(false), 120); }}
                onKeyDown={patientIsLocked ? undefined : onPatientKeyDown}
                onChange={patientIsLocked ? undefined : event => {
                  setPatientQuery(event.target.value);
                  setSelectedPatient(null);
                  setActiveResult(-1);
                  setShowResults(true);
                  setError('');
                }}
              />
              {!patientIsLocked && showResults && <div className="new-visit-patient-results" id="new-visit-patient-results" role="listbox" aria-label="Matching patients">
                {matches.length ? matches.map((patient, index) => <button
                  key={patient.id}
                  id={`new-visit-patient-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedPatient?.id === patient.id || activeResult === index}
                  className={selectedPatient?.id === patient.id || activeResult === index ? 'is-active' : ''}
                  onMouseEnter={() => setActiveResult(index)}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => choosePatient(patient)}
                ><span><b>{patient.name || 'Unnamed patient'}</b><small>Patient ID · {patientIdentifier(patient, patients.indexOf(patient))}</small></span><i aria-hidden="true">{selectedPatient?.id === patient.id ? '✓' : ''}</i></button>)
                  : <p>{patients.length ? 'No matching patients found.' : 'Add a patient record before recording a visit.'}</p>}
              </div>}
            </div>
            {selectedPatient && <small className="new-visit-selected-hint">Linked to Patient ID {patientIdentifier(selectedPatient, patients.indexOf(selectedPatient))}.</small>}
          </div>

          <div className="new-visit-two-column">
            <div className="field">
              <span className="new-visit-label">Treatment / Service <i>*</i></span>
              <AdminSelect className="new-visit-service-select" value={service} options={TREATMENTS} onChange={value => { setService(value); setError(''); }} placeholder="Select a treatment or service" required invalid={error === 'Select a treatment or service.'} label="Treatment or service"/>
            </div>
            <div className="field new-visit-date-field">
              <label className="new-visit-label" htmlFor="new-visit-date">Visit Date <i>*</i></label>
              <VisitDatePicker id="new-visit-date" value={visitDate} max={today} invalid={error === 'Enter a visit date.' || error === 'Visit date cannot be in the future.'} onChange={value => { setVisitDate(value); setError(''); }}/>
            </div>
          </div>

          <label className="field" htmlFor="new-visit-notes">Clinical Notes <small>(Optional)</small>
            <textarea id="new-visit-notes" rows="4" placeholder="Add visit observations or remarks." value={clinicalNotes} onChange={event => setClinicalNotes(event.target.value)}/>
          </label>
        </div>
        {error && <p className="form-error new-visit-error" role="alert">{error}</p>}
        <footer className="form-actions"><button className="primary-button new-visit-save" type="submit" disabled={saving || !patients.length}>{saving ? 'Saving…' : 'Save Visit'}</button></footer>
      </form>
    </section>
  </div>;
}
