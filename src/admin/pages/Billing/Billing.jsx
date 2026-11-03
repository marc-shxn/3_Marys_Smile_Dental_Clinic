import { useEffect, useMemo, useRef, useState } from 'react';
import AdminSelect from '../../components/AdminSelect.jsx';
import { clinicTreatmentOptions } from '../../../shared/data/dentalServices.js';
import './Billing.css';

const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};
function GoalDateInput({ id, value, onChange, min }) {
  const inputRef = useRef(null);
  const openPicker = () => {
    const input = inputRef.current;
    if (input?.showPicker) input.showPicker();
    else input?.focus();
  };
  return <span className="goal-date-input">
    <input ref={inputRef} id={id} type="date" min={min} value={value} onChange={onChange} required />
    <button className="goal-date-picker" type="button" aria-label={`Choose ${id.includes('start') ? 'start' : 'end'} date`} onClick={openPicker}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="16" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7.5 3.5v4M16.5 3.5v4M4 10h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="8" cy="14" r=".8" fill="currentColor"/><circle cx="12" cy="14" r=".8" fill="currentColor"/><circle cx="16" cy="14" r=".8" fill="currentColor"/><circle cx="8" cy="18" r=".8" fill="currentColor"/><circle cx="12" cy="18" r=".8" fill="currentColor"/><circle cx="16" cy="18" r=".8" fill="currentColor"/></svg>
    </button>
  </span>;
}

function BillingFilterDropdown({ kind, label, value, options, onChange, placeholder = '', required = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = `billing-${kind}-filter-options`;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    (menuRef.current?.querySelector('[aria-selected="true"]') || menuRef.current?.querySelector('[role="option"]'))?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const handleOptionKeyDown = (event, index) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + direction + options.length) % options.length;
    menuRef.current?.querySelectorAll('[role="option"]')[nextIndex]?.focus();
  };

  return <div ref={rootRef} className={`billing-filter-select billing-filter-select-${kind}`}>
    <button
      ref={triggerRef}
      type="button"
      className="billing-filter-trigger"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={menuId}
      aria-required={required || undefined}
      onClick={() => setOpen(current => !current)}
    >
      <span className={!value ? 'is-placeholder' : ''}>{value || placeholder}</span>
      <svg className="billing-filter-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    {open && <div ref={menuRef} className="billing-filter-menu" id={menuId} role="listbox" aria-label={label}>
      {options.map((option, index) => {
        const selected = option === value;
        const statusClass = kind === 'status' && option !== 'All Statuses'
          ? ` billing-filter-option-status-${option.toLowerCase().replace(/\s+/g, '-')}`
          : '';
        return <button
          key={option}
          type="button"
          role="option"
          aria-selected={selected}
          className={`billing-filter-option${selected ? ' is-selected' : ''}${statusClass}`}
          onClick={() => { onChange(option); setOpen(false); triggerRef.current?.focus(); }}
          onKeyDown={event => handleOptionKeyDown(event, index)}
        >
          {kind === 'status' && option !== 'All Statuses' && <i className="billing-filter-status-dot" aria-hidden="true"/>}
          {kind === 'date' && <svg className="billing-filter-calendar" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="3" y="4.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6.5 2.8v3.4m7-3.4v3.4M3.5 8h13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
          <span>{option}</span>
          {selected && <svg className="billing-filter-check" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8.2 2.8 2.8 6.2-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>;
      })}
    </div>}
  </div>;
}
const money = value => `₱${Number(value || 0).toLocaleString()}`;

function goalDateRange(period, basis = new Date()) {
  const date = new Date(`${basis.getFullYear()}-${String(basis.getMonth() + 1).padStart(2, '0')}-${String(basis.getDate()).padStart(2, '0')}T12:00:00`);
  let start;
  let end;
  if (period === 'Quarterly') {
    const firstMonth = Math.floor(date.getMonth() / 3) * 3;
    start = new Date(date.getFullYear(), firstMonth, 1);
    end = new Date(date.getFullYear(), firstMonth + 3, 0);
  } else if (period === 'Yearly') {
    start = new Date(date.getFullYear(), 0, 1);
    end = new Date(date.getFullYear(), 11, 31);
  } else {
    start = new Date(date.getFullYear(), date.getMonth(), 1);
    end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }
  return { startDate: todayFromDate(start), endDate: todayFromDate(end) };
}
const todayFromDate = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const showDate = value => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—';
const emptyAdvancedFilters = () => ({ treatmentType: '', paymentMethod: '', minimumAmount: '', maximumAmount: '', patientType: '' });
const treatmentTypes = clinicTreatmentOptions;
const statusOptions = ['All Statuses', 'Paid', 'Unpaid', 'Partial Payment'];
const dateRangeOptions = ['Today', 'This Week', 'This Month', 'Last Month', 'This Year', 'Custom Date Range'];
function readSavedBillingFilters() {
  const defaults = { query: '', status: 'All Statuses', dateRange: 'This Month', customStartDate: '', customEndDate: '', advancedFilters: emptyAdvancedFilters() };
  try {
    const saved = JSON.parse(localStorage.getItem('smile-clinic-billing-filters') || 'null');
    if (!saved) return defaults;
    const advancedFilters = { ...defaults.advancedFilters, ...(saved.advancedFilters || {}) };
    if (!treatmentTypes.includes(advancedFilters.treatmentType)) advancedFilters.treatmentType = '';
    return {
      query: typeof saved.query === 'string' ? saved.query : defaults.query,
      status: statusOptions.includes(saved.status) ? saved.status : defaults.status,
      dateRange: dateRangeOptions.includes(saved.dateRange) ? saved.dateRange : defaults.dateRange,
      customStartDate: typeof saved.customStartDate === 'string' ? saved.customStartDate : defaults.customStartDate,
      customEndDate: typeof saved.customEndDate === 'string' ? saved.customEndDate : defaults.customEndDate,
      advancedFilters,
    };
  } catch {
    return defaults;
  }
}
const invoiceStatus = invoice => {
  const status = normalizedText(invoice.status);
  if (status === 'paid') return 'Paid';
  if (status.includes('partial')) return 'Partial Payment';
  return 'Unpaid';
};
const invoiceDateKey = invoice => String(invoice.invoiceDate || invoice.dueDate || '').slice(0, 10);
const invoiceAmount = invoice => Number(String(invoice.totalAmount ?? invoice.amount ?? '').replace(/[^\d.-]/g, '')) || 0;
const normalizedText = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
const invoicePaymentAmount = invoice => invoice.amountPaid != null
  ? Number(String(invoice.amountPaid).replace(/[^\d.-]/g, '')) || 0
  : invoiceStatus(invoice) === 'Paid' ? invoiceAmount(invoice)
    : invoiceStatus(invoice) === 'Partial Payment' && invoice.remainingBalance != null
      ? Math.max(0, invoiceAmount(invoice) - (Number(String(invoice.remainingBalance).replace(/[^\d.-]/g, '')) || 0))
      : 0;
function invoicePayments(invoice, index = 0) {
  if (Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length) return invoice.paymentHistory;
  const amount = invoicePaymentAmount(invoice);
  if (amount <= 0) return [];
  return [{
    id: `legacy-${invoice.id || index}`,
    receiptNumber: invoice.receiptNumber || `RCP-${String(index + 1).padStart(4, '0')}`,
    amount,
    paymentMethod: invoice.paymentMethod || '',
    paymentDate: invoice.paymentDate || invoice.invoiceDate || invoice.dueDate || '',
  }];
}
function invoicePaymentKey(invoice, payment, invoiceIndex, paymentIndex) {
  const invoiceKey = invoice.id || invoice.invoiceNumber || invoice.number || ('invoice-' + invoiceIndex);
  const paymentKey = payment.id || payment.receiptNumber || [
    String(payment.paymentDate || '').slice(0, 10),
    Number(payment.amount) || 0,
    normalizedText(payment.paymentMethod),
    paymentIndex,
  ].join('-');
  return invoiceKey + '::' + paymentKey;
}
function getInvoicePaymentKeys(invoices) {
  return invoices.flatMap((invoice, invoiceIndex) => invoicePayments(invoice, invoiceIndex)
    .map((payment, paymentIndex) => invoicePaymentKey(invoice, payment, invoiceIndex, paymentIndex)));
}
function calculateGoalProgress(goal, invoices, useArchivedSnapshot = false) {
  const target = Number(String(goal?.targetAmount ?? '').replace(/[^\d.-]/g, '')) || 0;
  if (!goal || target <= 0) return null;
  const excludedPaymentKeys = new Set(Array.isArray(goal.excludedPaymentKeys) ? goal.excludedPaymentKeys : []);
  const dailyPayments = new Map();
  invoices.forEach((invoice, index) => invoicePayments(invoice, index).forEach((payment, paymentIndex) => {
    if (excludedPaymentKeys.has(invoicePaymentKey(invoice, payment, index, paymentIndex))) return;
    const date = String(payment.paymentDate || '').slice(0, 10);
    const amount = Number(payment.amount) || 0;
    if (!date || amount <= 0 || (goal.startDate && date < goal.startDate) || (goal.endDate && date > goal.endDate)) return;
    dailyPayments.set(date, (dailyPayments.get(date) || 0) + amount);
  }));
  let collected = 0;
  const calculatedHistory = [...dailyPayments.entries()].sort(([dateA], [dateB]) => dateA.localeCompare(dateB)).map(([date, paymentAmount]) => {
    collected = Math.round((collected + paymentAmount) * 100) / 100;
    return { date, paymentAmount, collected, percent: Math.min(100, Math.round((collected / target) * 100)) };
  });
  const history = useArchivedSnapshot && Array.isArray(goal.progressHistory) ? goal.progressHistory : calculatedHistory;
  const current = useArchivedSnapshot && goal.finalCollectedAmount != null
    ? Number(goal.finalCollectedAmount) || 0
    : history.at(-1)?.collected || 0;
  const achievementPercent = Math.min(100, Math.round((current / target) * 100));
  return { target, current, percent: achievementPercent, achievementPercent, history };
}
function nextReceiptNumber(invoices) {
  const highest = invoices.reduce((max, invoice, index) => invoicePayments(invoice, index).reduce((invoiceMax, payment) => {
    const match = String(payment.receiptNumber || '').match(/(\d+)$/);
    return match ? Math.max(invoiceMax, Number(match[1])) : invoiceMax;
  }, max), 0);
  return `RCP-${String(highest + 1).padStart(4, '0')}`;
}
function nextInvoiceNumber(invoices) {
  const highest = invoices.reduce((max, invoice, index) => {
    const fallback = `INV-${String(Math.max(1, index + 1)).padStart(4, '0')}`;
    const match = String(invoice.invoiceNumber || invoice.number || fallback).match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `INV-${String(highest + 1).padStart(4, '0')}`;
}
function patientCode(patient, index) {
  return patient.patientNumber || patient.patientCode || patient.code || `PT-${String(index + 1).padStart(4, '0')}`;
}
function invoiceMatchesTreatment(invoice, selectedType) {
  if (!selectedType) return true;
  const treatment = normalizedText(invoice.treatment);
  const aliases = {
    'Oral Prophylaxis': ['oral prophylaxis', 'routine cleaning', 'cleaning', 'prophylaxis'],
    'Simple Tooth Extraction': ['simple tooth extraction', 'tooth extraction', 'extraction'],
    'Restoration / Filling': ['restoration filling', 'restoration', 'filling'],
    'Metal Braces': ['metal braces', 'braces treatment', 'braces adjustment', 'orthodontic'],
    'Ceramic Braces': ['ceramic braces', 'braces treatment', 'braces adjustment', 'orthodontic'],
    'Self-Ligating Braces': ['self ligating braces', 'braces treatment', 'braces adjustment', 'orthodontic'],
    'Fixed Dentures': ['fixed dentures', 'crown bridge', 'dentures', 'denture'],
    'Removable Dentures': ['removable dentures', 'crown bridge', 'dentures', 'denture'],
    'Teeth Whitening / Bleaching': ['teeth whitening bleaching', 'teeth whitening', 'whitening'],
    'Root Canal Treatment': ['root canal treatment', 'root canal therapy', 'root canal'],
    'Deep Cleaning and Root Planing': ['deep cleaning and root planing', 'deep cleaning', 'root planing'],
    Odontectomy: ['odontectomy'],
  }[selectedType] || [normalizedText(selectedType)];
  return aliases.some(alias => treatment.includes(alias));
}
function getInvoiceDateBounds(range, customStart, customEnd, now = new Date()) {
  if (range === 'Custom Date Range') return { start: customStart, end: customEnd };
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'Today') {
    const key = todayFromDate(todayDate);
    return { start: key, end: key };
  }
  if (range === 'This Week') {
    const start = new Date(todayDate);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: todayFromDate(start), end: todayFromDate(end) };
  }
  if (range === 'Last Month') return {
    start: todayFromDate(new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1)),
    end: todayFromDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), 0)),
  };
  if (range === 'This Year') return {
    start: todayFromDate(new Date(todayDate.getFullYear(), 0, 1)),
    end: todayFromDate(new Date(todayDate.getFullYear(), 11, 31)),
  };
  return {
    start: todayFromDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)),
    end: todayFromDate(new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0)),
  };
}
function getInvoicePatientType(invoice, invoices, patients) {
  const patient = patients.find(row => normalizedText(row.name) === normalizedText(invoice.patient));
  const explicitType = invoice.patientType || patient?.patientType || patient?.type;
  if (explicitType) {
    const normalized = normalizedText(explicitType);
    if (normalized.includes('return')) return 'Returning Patient';
    if (normalized.includes('new')) return 'New Patient';
  }
  const patientKey = normalizedText(invoice.patient);
  if (!patientKey) return 'New Patient';
  const patientInvoices = invoices
    .filter(row => normalizedText(row.patient) === patientKey)
    .sort((left, right) => invoiceDateKey(left).localeCompare(invoiceDateKey(right)) || invoices.indexOf(left) - invoices.indexOf(right));
  return patientInvoices[0] === invoice ? 'New Patient' : 'Returning Patient';
}

function CreateInvoiceModal({ patients, invoices, onClose, onSave }) {
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientListOpen, setPatientListOpen] = useState(false);
  const [treatmentType, setTreatmentType] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [treatmentFee, setTreatmentFee] = useState('');
  const [additionalCharges, setAdditionalCharges] = useState('');
  const [status, setStatus] = useState('Unpaid');
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const patientPickerRef = useRef(null);
  const selectedPatient = patients.find(patient => patient.id === selectedPatientId);
  const selectedPatientIndex = patients.findIndex(patient => patient.id === selectedPatientId);
  const matchingPatients = patients.filter(patient => [patient.name, patient.phone, patient.email, patient.id].join(' ').toLowerCase().includes(patientSearch.trim().toLowerCase()));
  const fee = Number(treatmentFee) || 0;
  const charges = Number(additionalCharges) || 0;
  const total = fee + charges;
  const paid = status === 'Paid' ? total : status === 'Partial Payment' ? Number(amountPaid) || 0 : 0;
  const remaining = Math.max(0, total - paid);
  const invoiceNumber = nextInvoiceNumber(invoices);
  const resolvedTreatment = treatmentType;

  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    const closePatientList = event => { if (!patientPickerRef.current?.contains(event.target)) setPatientListOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    document.addEventListener('mousedown', closePatientList);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('mousedown', closePatientList);
    };
  }, [onClose]);

  const choosePatient = patient => {
    setSelectedPatientId(patient.id);
    setPatientSearch('');
    setPatientListOpen(false);
    setError('');
  };
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    if (!selectedPatient) { setError('Select a patient to continue.'); return; }
    if (!resolvedTreatment) { setError('Choose a treatment or enter the other service.'); return; }
    if (fee <= 0) { setError('Enter a treatment fee greater than zero.'); return; }
    if (charges < 0) { setError('Additional charges cannot be negative.'); return; }
    if (!invoiceDate || !dueDate || dueDate < invoiceDate) { setError('Choose a due date on or after the invoice date.'); return; }
    if (status === 'Partial Payment' && (paid <= 0 || paid >= total)) { setError('For a partial payment, enter an amount greater than zero and less than the total.'); return; }
    const previousInvoices = invoices.filter(invoice => invoice.patientId === selectedPatient.id || normalizedText(invoice.patient) === normalizedText(selectedPatient.name));
    const initialPayment = paid > 0 ? {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      receiptNumber: nextReceiptNumber(invoices),
      amount: paid,
      paymentMethod,
      paymentDate: today(),
      createdAt: new Date().toISOString(),
    } : null;
    setSaving(true);
    setError('');
    try {
      await onSave({
      patient: selectedPatient.name,
      patientId: selectedPatient.id,
      patientNumber: patientCode(selectedPatient, selectedPatientIndex),
      patientType: previousInvoices.length ? 'Returning Patient' : 'New Patient',
      invoiceNumber,
      invoiceDate,
      dueDate,
      treatment: resolvedTreatment,
      treatmentFee: fee,
      additionalCharges: charges,
      totalAmount: total,
      amount: total,
      status,
      amountPaid: paid,
      remainingBalance: remaining,
      paymentMethod,
      paymentDate: paid > 0 ? today() : '',
      paymentHistory: initialPayment ? [initialPayment] : [],
      receiptNumber: initialPayment?.receiptNumber || '',
        notes: notes.trim(),
      });
    } catch (saveError) {
      setError(saveError.message || 'The invoice could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-backdrop invoice-create-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="form-modal invoice-create-modal" role="dialog" aria-modal="true" aria-labelledby="invoice-create-title">
      <header className="modal-heading"><div><p className="eyebrow">BILLING</p><h2 id="invoice-create-title">Create Invoice</h2><p>Add a treatment charge and record any payment received.</p></div><button className="close-button" type="button" aria-label="Close create invoice form" onClick={onClose}>×</button></header>
      <form onSubmit={submit}>
        <section className="invoice-form-section">
          <h3>Patient Information</h3>
          {selectedPatient ? <div className="invoice-selected-patient"><span className="invoice-patient-avatar">{String(selectedPatient.name || '?').trim().charAt(0).toUpperCase()}</span><span><b>{selectedPatient.name}</b><small>{patientCode(selectedPatient, selectedPatientIndex)}</small></span><button className="invoice-change-patient" type="button" onClick={() => { setSelectedPatientId(''); setPatientListOpen(true); }}>Change</button></div> : <div className="invoice-patient-picker" ref={patientPickerRef}>
            <label className="field">Search / Select Patient<input type="search" value={patientSearch} placeholder={patients.length ? 'Search by name, phone, or email' : 'No patient records available'} disabled={!patients.length} onFocus={() => setPatientListOpen(true)} onChange={event => { setPatientSearch(event.target.value); setPatientListOpen(true); }} aria-label="Search patients for invoice" aria-expanded={patientListOpen} aria-controls="invoice-patient-options" /></label>
            {patientListOpen && patients.length > 0 && <div className="invoice-patient-options" id="invoice-patient-options" role="listbox" aria-label="Patients">{matchingPatients.length ? matchingPatients.slice(0, 8).map(patient => <button key={patient.id} type="button" role="option" aria-selected="false" onClick={() => choosePatient(patient)}><span><b>{patient.name}</b><small>{patient.phone || patient.email || 'Patient record'}</small></span><small>{patientCode(patient, patients.indexOf(patient))}</small></button>) : <p>No matching patients found.</p>}</div>}
            {!patients.length && <small className="invoice-no-patients">Add a patient record before creating an invoice.</small>}
          </div>}
        </section>

        <section className="invoice-form-section">
          <h3>Treatment Information</h3>
          <div className="invoice-form-grid invoice-treatment-fields"><div className="field"><span>Treatment Type</span><BillingFilterDropdown kind="treatment" label="Treatment type" value={treatmentType} options={treatmentTypes} placeholder="Select a treatment" required onChange={value => { setTreatmentType(value); setError(''); }}/></div></div>
        </section>

        <section className="invoice-form-section">
          <h3>Invoice Details</h3>
          <div className="invoice-form-grid invoice-detail-fields"><label className="field">Invoice Number<input value={invoiceNumber} readOnly /></label><label className="field">Invoice Date<input type="date" value={invoiceDate} onChange={event => setInvoiceDate(event.target.value)} required /></label><label className="field">Due Date<input type="date" min={invoiceDate} value={dueDate} onChange={event => setDueDate(event.target.value)} required /></label></div>
        </section>

        <section className="invoice-form-section">
          <h3>Billing Information</h3>
          <div className="invoice-form-grid invoice-billing-fields"><label className="field">Treatment Fee<input type="number" min="0.01" step="0.01" placeholder="0.00" value={treatmentFee} onChange={event => setTreatmentFee(event.target.value)} required /></label><label className="field">Additional Charges <span className="invoice-optional">(Optional)</span><input type="number" min="0" step="0.01" placeholder="0.00" value={additionalCharges} onChange={event => setAdditionalCharges(event.target.value)} /></label><div className="invoice-total"><span>Total Amount</span><strong>{money(total)}</strong></div></div>
        </section>

        <section className="invoice-form-section">
          <h3>Payment Information</h3>
          <div className={`invoice-form-grid invoice-payment-fields ${status === 'Partial Payment' ? 'is-partial-payment' : ''}`}><label className="field">Payment Status<AdminSelect label="Payment status" value={status} options={['Paid', 'Unpaid', 'Partial Payment']} onChange={setStatus}/></label>{status === 'Partial Payment' && <><label className="field">Amount Paid<input type="number" min="0.01" max={Math.max(0, total - 0.01)} step="0.01" placeholder="Amount received" value={amountPaid} onChange={event => setAmountPaid(event.target.value)} required /></label><div className="invoice-total invoice-balance"><span>Remaining Balance</span><strong>{money(remaining)}</strong></div></>}<label className="field">Payment Method<AdminSelect label="Payment method" value={paymentMethod} options={['Cash', 'Online Payment']} onChange={setPaymentMethod}/></label></div>
          {status === 'Paid' && <small className="invoice-payment-note">The full invoice amount will be recorded as received.</small>}
        </section>

        <section className="invoice-form-section invoice-notes-section"><h3>Notes <span className="invoice-optional">(Optional)</span></h3><label className="field"><span className="visually-hidden">Invoice notes</span><textarea rows="3" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Add billing remarks or invoice notes..." /></label></section>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Invoice'}</button></footer>
      </form>
    </section>
  </div>;
}

function CollectionGoalModal({ initialDetails, onClose, onSave }) {
  const currentRange = goalDateRange('Monthly');
  const [amountFocused, setAmountFocused] = useState(false);
  const [form, setForm] = useState(() => ({
    goalName: initialDetails?.goalName || '',
    targetAmount: initialDetails?.targetAmount || '',
    period: initialDetails?.period || 'Monthly',
    startDate: initialDetails?.startDate || currentRange.startDate,
    endDate: initialDetails?.endDate || currentRange.endDate,
    description: initialDetails?.description || '',
    notifications: initialDetails?.notifications ?? true,
    status: initialDetails?.status || 'Active',
  }));
  const [periodOpen, setPeriodOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const periodRef = useRef(null);
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    if (!periodOpen) return undefined;
    const closePeriodMenu = event => { if (!periodRef.current?.contains(event.target)) setPeriodOpen(false); };
    document.addEventListener('mousedown', closePeriodMenu);
    return () => document.removeEventListener('mousedown', closePeriodMenu);
  }, [periodOpen]);
  const target = Number(form.targetAmount) || 0;
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const selectPeriod = period => {
    setForm(current => ({ ...current, period, ...(period === 'Custom Date Range' ? {} : goalDateRange(period)) }));
    setPeriodOpen(false);
  };
  const previewRange = form.startDate && form.endDate
    ? `${showDate(form.startDate).replace(/, \d{4}$/, '')} - ${showDate(form.endDate)}`
    : 'Choose a start and end date';
  const periods = ['Monthly', 'Quarterly', 'Yearly', 'Custom Date Range'];
  return <div className="modal-backdrop goal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="goal-modal" role="dialog" aria-modal="true" aria-labelledby="goal-modal-title">
      <header className="goal-modal-heading">
        <div className="goal-title-icon" aria-hidden="true">◎</div>
        <div className="goal-title-copy"><p className="eyebrow">COLLECTION MANAGEMENT</p><h2 id="goal-modal-title">Set Collection Goal</h2><p>Define a collection target for your clinic and choose when to be notified.</p></div>
        <button className="close-button" type="button" aria-label="Close collection goal dialog" onClick={onClose}>×</button>
      </header>
      <form className="collection-goal-form" onSubmit={async event => {
        event.preventDefault();
        if (saving || target <= 0) return;
        setSaving(true);
        setError('');
        try { await onSave({ ...form, targetAmount: target }); }
        catch (saveError) { setError(saveError.message || 'The collection goal could not be saved. Please try again.'); }
        finally { setSaving(false); }
      }}>
        <div className="collection-goal-fields">
          <label className="goal-field"><span>Goal Name</span><input value={form.goalName} onChange={event => update('goalName', event.target.value)} placeholder="e.g., October Revenue Goal" required /></label>
          <label className="goal-field"><span>Target Amount</span><span className="goal-money-input"><span>₱</span><input type="text" inputMode="decimal" value={amountFocused ? form.targetAmount : (form.targetAmount ? Number(form.targetAmount).toLocaleString('en-US') : '')} onFocus={() => setAmountFocused(true)} onBlur={() => setAmountFocused(false)} onChange={event => update('targetAmount', event.target.value.replace(/[^\d.]/g, ''))} placeholder="50,000" required /></span></label>

          <div className="goal-field goal-period-field" ref={periodRef}><span>Goal Period</span><button type="button" className={`goal-period-select ${periodOpen ? 'is-open' : ''}`} aria-haspopup="listbox" aria-expanded={periodOpen} onClick={() => setPeriodOpen(open => !open)}>{form.period}<span className="goal-period-chevron" aria-hidden="true" /></button>{periodOpen && <div className="goal-period-options" role="listbox" aria-label="Goal period">{periods.map(period => <button type="button" role="option" aria-selected={form.period === period} className={form.period === period ? 'selected' : ''} key={period} onClick={() => selectPeriod(period)}>{period}<span>{form.period === period ? '✓' : ''}</span></button>)}</div>}</div>
          <div className="goal-field goal-date-field"><label htmlFor="goal-start-date">Start Date</label><GoalDateInput id="goal-start-date" value={form.startDate} onChange={event => update('startDate', event.target.value)} /></div>

          <div className="goal-field goal-end-date-field"><label htmlFor="goal-end-date">End Date</label><GoalDateInput id="goal-end-date" min={form.startDate} value={form.endDate} onChange={event => update('endDate', event.target.value)} /><small>Your goal covers the selected {form.period.toLowerCase()} period.</small></div>
          <label className="goal-field goal-description-field"><span>Description (Optional)</span><textarea rows="3" value={form.description} onChange={event => update('description', event.target.value)} placeholder="Add details about this collection goal..." /></label>

          <div className="goal-notifications"><b>Notifications</b><div className="goal-notification-control"><span>Notify me when goal reaches 50%, 75%, and 100%.</span><button type="button" role="switch" aria-checked={form.notifications} className={`goal-toggle ${form.notifications ? 'on' : ''}`} onClick={() => update('notifications', !form.notifications)} aria-label="Toggle goal notifications"><i/></button></div></div>
          <section className="goal-preview-card" aria-label="Goal preview"><b><span>▣</span> Preview</b><small>Review your goal before saving.</small><div>Goal Name: <strong>{form.goalName || '—'}</strong></div><div>Target Amount: <strong>{target ? money(target) : '—'}</strong></div><div>Period: <strong>{previewRange}</strong></div></section>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="goal-modal-actions"><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Goal'}</button></footer>
      </form>
    </section>
  </div>;
}

function pdfText(value) {
  return String(value ?? '—').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[\\()]/g, character => `\\${character}`);
}
function downloadReceiptPdf(receipt, invoice, code, payment) {
  const lines = [
    "3 Mary's Smile Dental Clinic",
    'Dental clinic workspace',
    'PAYMENT RECEIPT',
    `Receipt Number: ${receipt}`,
    `Invoice Number: ${code}`,
    `Patient: ${invoice.patient || '—'}`,
    `Patient ID: ${invoice.patientNumber || invoice.patientId || '—'}`,
    `Treatment: ${invoice.treatment || '—'}`,
    `Amount Paid: PHP ${Number(payment.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Payment Method: ${payment.paymentMethod || '—'}`,
    `Payment Date: ${payment.paymentDate ? showDate(payment.paymentDate) : '—'}`,
  ];
  const stream = lines.map((line, index) => `BT /F1 ${index === 0 ? 16 : 11} Tf 52 ${770 - index * 28} Td (${pdfText(line)}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const blob = new Blob([body], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${receipt.replace(/[^a-z0-9-]/gi, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function InvoiceDetailsModal({ invoice, code, initialView = 'details', invoiceIndex, invoices, onRecordPayment, onClose }) {
  const [view, setView] = useState(initialView);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const status = invoiceStatus(invoice);
  const paymentHistory = invoicePayments(invoice, invoiceIndex);
  const paid = invoicePaymentAmount(invoice);
  const outstanding = Math.max(0, invoiceAmount(invoice) - paid);
  const latestPayment = paymentHistory[paymentHistory.length - 1];
  const currentPayment = latestPayment || {
    receiptNumber: invoice.receiptNumber || nextReceiptNumber(invoices),
    amount: paid,
    paymentMethod: invoice.paymentMethod || '',
    paymentDate: invoice.paymentDate || invoiceDateKey(invoice),
  };
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    setView(initialView);
    setAmount('');
    setMethod('');
    setPaymentDate('');
    setErrors({});
    setNotice(null);
  }, [invoice.id, initialView]);
  const clearError = field => setErrors(current => ({ ...current, [field]: undefined, form: undefined }));
  const beginPayment = () => {
    if (status === 'Paid') {
      setNotice({ type: 'error', text: 'This invoice has already been fully paid.' });
      setView('details');
      return;
    }
    setErrors({});
    setNotice(null);
    setAmount('');
    setMethod('');
    setPaymentDate('');
    setView('payment');
  };
  const submitPayment = async event => {
    event.preventDefault();
    const nextErrors = {};
    const received = Number(amount);
    if (status === 'Paid') {
      setErrors({ form: 'This invoice has already been fully paid.' });
      return;
    }
    if (!amount.trim()) nextErrors.amount = 'Please enter an amount.';
    else if (received <= 0 || !Number.isFinite(received)) nextErrors.amount = 'Amount must be greater than ₱0.';
    else if (received > outstanding) nextErrors.amount = status === 'Unpaid' ? 'Payment amount exceeds the outstanding balance.' : 'Amount exceeds the remaining balance.';
    if (!method) nextErrors.method = 'Please select a payment method.';
    if (!paymentDate) nextErrors.paymentDate = 'Please select a payment date.';
    else if (invoiceDateKey(invoice) && paymentDate < invoiceDateKey(invoice)) nextErrors.paymentDate = 'Payment date cannot be before the invoice date.';
    if (Object.keys(nextErrors).length) {
      setErrors({ ...nextErrors, form: 'Please review the highlighted fields.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    const payment = {
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      receiptNumber: nextReceiptNumber(invoices),
      amount: received,
      paymentMethod: method,
      paymentDate,
      createdAt: new Date().toISOString(),
    };
    try {
      const result = await onRecordPayment?.(invoice.id, payment);
      if (!result?.ok) {
        setNotice({ type: 'error', text: result?.alreadyPaid ? 'This invoice has already been fully paid.' : result?.saveFailed ? 'Failed to save invoice changes.' : 'Unable to process your request. Please try again.' });
        setBusy(false);
        return;
      }
      setNotice({ type: 'success', text: result.status === 'Paid'
        ? 'Invoice has been fully paid. Receipt generated successfully.'
        : result.statusUpdated ? 'Payment recorded successfully. Invoice status updated.' : 'Payment recorded successfully.' });
      setAmount('');
      setMethod('');
      setPaymentDate('');
      setErrors({});
      setView('details');
    } catch {
      setNotice({ type: 'error', text: 'Unable to process your request. Please try again.' });
    } finally {
      setBusy(false);
    }
  };
  const handleDownload = () => {
    try {
      downloadReceiptPdf(currentPayment.receiptNumber, invoice, code, currentPayment);
      setNotice({ type: 'success', text: 'Receipt downloaded successfully.' });
    } catch {
      setNotice({ type: 'error', text: 'Unable to process your request. Please try again.' });
    }
  };
  const receiptView = view === 'receipt';
  const paymentView = view === 'payment';
  const modalTitle = receiptView ? 'Receipt' : paymentView ? 'Record Payment' : 'Invoice Details';
  return <div className="modal-backdrop invoice-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`invoice-detail-modal ${receiptView ? 'is-receipt' : ''}`} role="dialog" aria-modal="true" aria-labelledby="invoice-detail-title">
      <header><div><p className="eyebrow">{receiptView ? 'PAYMENT RECEIPT' : paymentView ? 'BILLING' : 'INVOICE DETAILS'}</p><h2 id="invoice-detail-title">{modalTitle}</h2><span>{receiptView ? currentPayment.receiptNumber : code}</span></div><button className="close-button" type="button" aria-label="Close invoice details" onClick={onClose}>×</button></header>
      {notice && <p className={`invoice-feedback is-${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
      {receiptView ? <>
        <div className="invoice-receipt-sheet">
          <div className="invoice-receipt-clinic"><b>3 Mary's Smile Dental Clinic</b><span>Dental clinic workspace</span></div>
          <div className="invoice-receipt-number"><span>Receipt Number</span><strong>{currentPayment.receiptNumber}</strong></div>
          <dl><div><dt>Invoice Number</dt><dd>{code}</dd></div><div><dt>Patient</dt><dd>{invoice.patient || '—'}</dd></div><div><dt>Patient ID</dt><dd>{invoice.patientNumber || invoice.patientId || '—'}</dd></div><div><dt>Treatment</dt><dd>{invoice.treatment || '—'}</dd></div><div><dt>Amount Paid</dt><dd>{money(currentPayment.amount)}</dd></div><div><dt>Payment Method</dt><dd>{currentPayment.paymentMethod || '—'}</dd></div><div><dt>Payment Date</dt><dd>{currentPayment.paymentDate ? showDate(currentPayment.paymentDate) : '—'}</dd></div></dl>
        </div>
        <footer className="invoice-receipt-actions"><button className="secondary-button" type="button" onClick={handleDownload}>Download PDF</button><button className="primary-button" type="button" onClick={() => window.print()}>Print Receipt</button></footer>
      </> : paymentView ? <form className="invoice-payment-form" onSubmit={submitPayment} noValidate>
        {errors.form && <p className="invoice-validation-summary" role="alert">{errors.form}</p>}
        <label className="field">{status === 'Unpaid' ? 'Outstanding Amount' : 'Remaining Balance'}<input value={money(outstanding)} readOnly aria-readonly="true" /></label>
        <label className={`field ${errors.amount ? 'has-error' : ''}`}>Amount Received<input type="number" inputMode="decimal" min="0.01" max={outstanding} step="0.01" placeholder="Enter amount" value={amount} onChange={event => { setAmount(event.target.value); clearError('amount'); }} aria-invalid={Boolean(errors.amount)} aria-describedby={errors.amount ? 'invoice-payment-amount-error' : undefined} />{errors.amount && <small id="invoice-payment-amount-error" className="invoice-field-error">{errors.amount}</small>}</label>
        <label className={`field ${errors.method ? 'has-error' : ''}`}>Payment Method<AdminSelect label="Payment method" value={method} options={[{ value: '', label: 'Select payment method' }, 'Cash', 'Online Payment']} onChange={value => { setMethod(value); clearError('method'); }} required invalid={Boolean(errors.method)}/>{errors.method && <small id="invoice-payment-method-error" className="invoice-field-error">{errors.method}</small>}</label>
        <label className={`field ${errors.paymentDate ? 'has-error' : ''}`}>Payment Date<input type="date" min={invoiceDateKey(invoice) || undefined} value={paymentDate} onChange={event => { setPaymentDate(event.target.value); clearError('paymentDate'); }} aria-invalid={Boolean(errors.paymentDate)} aria-describedby={errors.paymentDate ? 'invoice-payment-date-error' : undefined} />{errors.paymentDate && <small id="invoice-payment-date-error" className="invoice-field-error">{errors.paymentDate}</small>}</label>
        <footer><button className="secondary-button" type="button" onClick={() => { setView('details'); setErrors({}); }}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record Payment'}</button></footer>
      </form> : <>
        <dl className="invoice-detail-grid"><div><dt>Patient Name</dt><dd>{invoice.patient || '—'}</dd></div><div><dt>Patient ID</dt><dd>{invoice.patientNumber || invoice.patientId || '—'}</dd></div><div><dt>Treatment</dt><dd>{invoice.treatment || '—'}</dd></div><div><dt>Invoice Date</dt><dd>{invoiceDateKey(invoice) ? showDate(invoiceDateKey(invoice)) : '—'}</dd></div><div><dt>Due Date</dt><dd>{invoice.dueDate ? showDate(invoice.dueDate) : '—'}</dd></div><div><dt>Total Amount</dt><dd>{money(invoiceAmount(invoice))}</dd></div><div><dt>Payment Status</dt><dd><span className={`billing-status ${status === 'Paid' ? 'is-paid' : status === 'Partial Payment' ? 'is-partial' : 'is-unpaid'}`}>{status}</span></dd></div><div><dt>Payment Method</dt><dd>{invoice.paymentMethod || latestPayment?.paymentMethod || '—'}</dd></div><div><dt>Notes</dt><dd>{invoice.notes || '—'}</dd></div></dl>
        {status !== 'Unpaid' && <section className="invoice-payment-summary"><div><span>Total Amount</span><b>{money(invoiceAmount(invoice))}</b></div><div><span>Amount Paid</span><b>{money(paid)}</b></div><div><span>Remaining Balance</span><b>{money(outstanding)}</b></div></section>}
        {paymentHistory.length > 0 && <section className="invoice-payment-history"><h3>Payment History</h3><div className="invoice-history-list">{paymentHistory.map((payment, index) => <article key={payment.id || payment.receiptNumber || index}><div><b>{payment.receiptNumber || 'Payment'}</b><small>{payment.paymentDate ? showDate(payment.paymentDate) : '—'} · {payment.paymentMethod || '—'}</small></div><strong>{money(payment.amount)}</strong></article>)}</div></section>}
        <footer><button className="primary-button" type="button" onClick={() => status === 'Paid' ? setView('receipt') : beginPayment()}>{status === 'Paid' ? 'View Receipt' : 'Record Payment'}</button></footer>
      </>}
    </section>
  </div>;
}
function ArchivedGoalsPanel({ goals, invoices, onView, onDelete, onViewActive, onCreateGoal }) {
  const rows = [...goals]
    .sort((a, b) => String(b.archivedAt || b.completionDate || b.startDate || '').localeCompare(String(a.archivedAt || a.completionDate || a.startDate || '')))
    .map(goal => {
      const savedProgress = calculateGoalProgress(goal, invoices, true);
      const target = Number(String(goal.targetAmount ?? '').replace(/[^\d.-]/g, '')) || 0;
      const current = Number(goal.finalCollectedAmount) || 0;
      const achievementPercent = Number(goal.achievementPercent) || (target > 0 ? Math.min(100, Math.round(current / target * 100)) : 0);
      return { goal, progress: savedProgress || { target, current, percent: achievementPercent, achievementPercent, history: [] } };
    });
  return <section className="panel billing-archived-goals-panel">
    <header><div><h2>Archived Goals</h2><p>Review collection goal results and preserved history.</p></div><span className="count-pill">{goals.length} {goals.length === 1 ? 'goal' : 'goals'}</span></header>
    {goals.length ? <div className="billing-archived-goals-list">{rows.map(({ goal, progress }) => <article className="billing-archived-goal" key={goal.id}>
      <div className="billing-archived-goal-heading"><div><h3>{goal.goalName || 'Collection Goal'}</h3><span className={`billing-archived-status ${goal.status === 'Completed' ? 'is-completed' : ''}`}><i aria-hidden="true"/>{goal.status || 'Active'}</span></div><small>Archived {showDate(goal.archivedAt)}</small></div>
      <div className="billing-archived-goal-values"><div><small>Final collected</small><strong>{money(progress.current)} <span>/ {money(progress.target)}</span></strong></div><div><small>Achievement</small><strong>{progress.percent}%</strong></div><div><small>Completed on</small><strong>{goal.completionDate ? showDate(goal.completionDate) : '—'}</strong></div></div>
      <footer><button className="secondary-button" type="button" onClick={() => onView(goal)}>View Details</button><button className="billing-archived-delete" type="button" onClick={() => onDelete(goal)}>Delete Permanently</button></footer>
    </article>)}</div> : <div className="billing-archived-empty-state">
      <div className="billing-archived-empty-message">
        <svg className="billing-archived-empty-illustration" viewBox="0 0 180 150" fill="none" aria-hidden="true">
          <circle cx="90" cy="78" r="67" fill="#EAF8F0"/><circle cx="17" cy="49" r="4" fill="#69DF95"/><circle cx="157" cy="105" r="4" fill="#69DF95"/>
          <rect x="54" y="18" width="72" height="70" rx="9" fill="#fff" stroke="#A8DCC3" strokeWidth="2"/><path d="M69 38h42M69 50h32M69 62h25" stroke="#D5E9DF" strokeWidth="6" strokeLinecap="round"/>
          <path d="M42 76h96v15H42z" fill="#D8F3E4" stroke="#8FD5B4" strokeWidth="2" strokeLinejoin="round"/><path d="m50 91 6 34h68l6-34" fill="#fff" stroke="#A8DCC3" strokeWidth="2" strokeLinejoin="round"/><path d="M78 91v17m0 0-7-7m7 7 7-7" stroke="#16845F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <h3>No Archived Goals Found</h3>
        <p>Archived collection goals will appear here once they have been completed and archived.</p>
        <p className="billing-archived-empty-secondary">Review past collection targets, final amounts collected, and performance history in one place.</p>
        <div className="billing-archived-empty-actions">
          <button className="primary-button" type="button" onClick={onViewActive}>View Active Goals</button>
          {onCreateGoal && <button className="secondary-button" type="button" onClick={onCreateGoal}>Create Collection Goal</button>}
        </div>
      </div>
      <aside className="billing-archived-data-note">Archived goals help track previous collection performance and maintain historical records for future reference.</aside>
    </div>}
  </section>;
}

function CollectionGoalDetails({ goal, progress, onBack, onEdit, onArchive, onDelete, isArchived = false }) {
  const remaining = Math.max(0, progress.target - progress.current);
  const notificationItems = [
    ['Goal reached', 'Notify when collections reach 100%.'],
    ['Weekly progress summary', 'Receive a collection update every Monday.'],
    ['Goal ending reminder', 'Notify 3 days before the end date.'],
  ];
  return <div className="content-page billing-page billing-goal-details-page">
    <button className="goal-details-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> Back to Billing</button>
    <div className="page-title-row goal-details-title-row">
      <div><h1>Collection Goal Details</h1><p>Review progress and manage your clinic's collection goal.</p></div>
      {!isArchived && goal.status !== 'Completed' && <button className="primary-button goal-details-edit" type="button" onClick={onEdit}><span aria-hidden="true">↗</span> Edit Goal</button>}
    </div>

    <section className="goal-details-progress" aria-label="Collection goal progress">
      <div className="goal-details-progress-heading"><div><h2>{goal.goalName || 'Collection Goal'}</h2><p><span aria-hidden="true">▦</span> Goal Period: {showDate(goal.startDate)} – {showDate(goal.endDate)}</p></div><span className={`goal-details-status ${goal.status === 'Completed' ? 'is-completed' : ''}`}><i/>{goal.status || 'Active'}</span></div>
      <div className="goal-details-progress-values"><div><small>Current Collected Amount</small><strong>{money(progress.current)}</strong></div><div className="goal-details-target"><small>Target Amount</small><strong>{money(progress.target)}</strong></div></div>
      <div className="goal-details-progress-meta"><span>{progress.achievementPercent}% {goal.status === 'Completed' ? 'achievement' : 'collected'}</span><span>{goal.completionDate ? `Completed on ${showDate(goal.completionDate)}` : `${money(remaining)} remaining to reach your target`}</span></div>
      <div className="goal-details-progress-track" role="progressbar" aria-label="Collection goal progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress.percent}><span style={{ width: `${progress.percent}%` }}/></div>
    </section>

    <div className="goal-details-info-grid">
      <section className="panel goal-details-card goal-details-description">
        <h2>Goal details</h2>
        <b>Description</b><p>{goal.description || 'No description provided.'}</p>
        <div className={`goal-details-dates ${goal.completionDate || isArchived ? 'has-completion-date' : ''}`}><div><small>Start Date</small><strong><span aria-hidden="true">▦</span> {showDate(goal.startDate)}</strong></div><div><small>End Date</small><strong><span aria-hidden="true">▦</span> {showDate(goal.endDate)}</strong></div>{goal.completionDate && <div><small>Completed On</small><strong>{showDate(goal.completionDate)}</strong></div>}{isArchived && <div><small>Archived On</small><strong>{showDate(goal.archivedAt)}</strong></div>}</div>
      </section>
      <section className="panel goal-details-card goal-details-notifications">
        <header><h2>Notification Settings</h2><span className="goal-details-bell" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span></header><p>In-app notifications for clinic administrators.</p>
        <ul>{notificationItems.map(([title, description]) => <li className={goal.notifications ? '' : 'is-disabled'} key={title}><span className="goal-details-check" aria-hidden="true">{goal.notifications ? '✓' : '–'}</span><span><b>{title}</b><small>{description}</small></span></li>)}</ul>
      </section>
    </div>

    <section className="panel goal-details-history">
      <header><div><h2>Progress History</h2><p>Collection payments recorded during this goal period.</p></div><span>{progress.history.length} {progress.history.length === 1 ? 'entry' : 'entries'}</span></header>
      {progress.history.length ? <ol>{progress.history.map((entry, index) => <li key={`${entry.date}-${index}`}><time>{showDate(entry.date)}</time><span>Collected {money(entry.paymentAmount)}</span><span>Total {money(entry.collected)}</span><b>{entry.percent}%</b></li>)}</ol> : <div className="goal-details-history-empty">No collection payments have been recorded during this goal period.</div>}
    </section>

    <section className="goal-details-manage">
      <h2>Manage goal</h2>
      <div className={`goal-details-manage-grid ${isArchived ? 'is-archived' : ''}`}>
        {!isArchived && <article className="panel goal-details-action-card"><h3><span aria-hidden="true">▣</span> Archive this goal</h3><p>Move to Archived Goals and remove from the active Billing dashboard. All historical data will be preserved.</p><button className="secondary-button" type="button" onClick={onArchive}><span aria-hidden="true">▣</span> Archive Goal</button></article>}
        <article className="panel goal-details-action-card is-danger"><h3><span aria-hidden="true">♜</span> {isArchived ? 'Delete permanently' : 'Delete this goal'}</h3><p>Permanently remove this collection goal and all its tracking history. This action cannot be undone.</p><button className="secondary-button" type="button" onClick={onDelete}><span aria-hidden="true">♜</span> {isArchived ? 'Delete Permanently' : 'Delete Goal'}</button></article>
      </div>
    </section>
  </div>;
}

function GoalDeleteDialog({ goal, onClose, onConfirm, error = '', busy = false }) {
  const archived = Boolean(goal?.archivedAt);
  return <div className="modal-backdrop goal-delete-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="goal-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="goal-delete-title">
    <span className="goal-delete-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
    <h2 id="goal-delete-title">{archived ? 'Delete Archived Collection Goal?' : 'Delete Collection Goal?'}</h2>
    <p>{archived ? 'This will permanently delete the archived collection goal and its preserved tracking history. This action cannot be undone.' : 'Are you sure you want to permanently delete this collection goal? This action cannot be undone.'}</p>
    <div className="goal-delete-summary"><b>{goal?.goalName || 'Collection Goal'}</b><span>The goal and all tracking history will be deleted.</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer><button className="secondary-button" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="goal-delete-confirm" type="button" disabled={busy} onClick={onConfirm}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg> {busy ? 'Deleting…' : archived ? 'Delete Permanently' : 'Delete Goal'}</button></footer>
  </section></div>;
}

function ArchiveGoalDialog({ goal, progress, onKeepActive, onConfirm, error = '', busy = false }) {
  return <div className="modal-backdrop goal-archive-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onKeepActive(); }}><section className="goal-archive-dialog" role="dialog" aria-modal="true" aria-labelledby="goal-archive-title">
    <span className="goal-archive-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 4.5h16v4H4zM5.5 8.5v10.2A1.8 1.8 0 0 0 7.3 20.5h9.4a1.8 1.8 0 0 0 1.8-1.8V8.5M9 12.5h6m-3-3v7m0 0-2.5-2.5m2.5 2.5 2.5-2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
    <h2 id="goal-archive-title">Archive Collection Goal?</h2>
    <p>Are you sure you want to archive this collection goal?</p>
    <p className="goal-archive-description">Archived goals will be removed from the active Billing Dashboard and moved to the Archived Goals tab. Historical performance data will be preserved and can still be viewed later.</p>
    <dl className="goal-archive-summary">
      <div><dt>Goal Name</dt><dd>{goal?.goalName || 'Collection Goal'}</dd></div>
      <div><dt>Status</dt><dd><span className={goal?.status === 'Completed' ? 'is-completed' : ''}>{goal?.status || 'Active'}</span></dd></div>
      <div><dt>Collected</dt><dd>{money(progress?.current || 0)}</dd></div>
      <div><dt>Target</dt><dd>{money(progress?.target || goal?.targetAmount || 0)}</dd></div>
      <div><dt>Achievement</dt><dd>{progress?.achievementPercent || 0}%</dd></div>
    </dl>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer><button className="secondary-button" type="button" disabled={busy} onClick={onKeepActive}>Keep Active</button><button className="primary-button" type="button" disabled={busy} onClick={onConfirm}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 4.5h16v4H4zM5.5 8.5v10.2A1.8 1.8 0 0 0 7.3 20.5h9.4a1.8 1.8 0 0 0 1.8-1.8V8.5m-9-2v3m5-3v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg> {busy ? 'Saving…' : 'Archive Goal'}</button></footer>
  </section></div>;
}

export default function Billing({ invoices = [], appointments = [], onAdd, patients = [], goals = [], onRecordPayment, onSaveGoal, onDeleteGoal, onNavigate, onBreadcrumbChange, onGoalCompleted }) {
  const [initialFilters] = useState(readSavedBillingFilters);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState(initialFilters.query);
  const [filter, setFilter] = useState(initialFilters.status);
  const [dateFilter, setDateFilter] = useState(initialFilters.dateRange);
  const [customStartDate, setCustomStartDate] = useState(initialFilters.customStartDate);
  const [customEndDate, setCustomEndDate] = useState(initialFilters.customEndDate);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedDraft, setAdvancedDraft] = useState(() => ({ ...initialFilters.advancedFilters }));
  const [advancedFilters, setAdvancedFilters] = useState(() => ({ ...initialFilters.advancedFilters }));
  const [showAll, setShowAll] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceView, setInvoiceView] = useState('details');
  const [goalDetails, setGoalDetails] = useState(() => goals.find(goal => !goal.archivedAt && goal.status !== 'Archived') || null);
  const [archivedGoals, setArchivedGoals] = useState(() => goals.filter(goal => Boolean(goal.archivedAt) || goal.status === 'Archived'));
  const [showGoal, setShowGoal] = useState(false);
  const [showGoalDetails, setShowGoalDetails] = useState(false);
  const [viewingArchivedGoalId, setViewingArchivedGoalId] = useState(null);
  const [showArchivedGoalsTab, setShowArchivedGoalsTab] = useState(() => {
    try { return localStorage.getItem('smile-clinic-billing-tab') === 'archived'; }
    catch { return false; }
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [confirmGoalDelete, setConfirmGoalDelete] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState(null);
  const [goalToArchive, setGoalToArchive] = useState(null);
  const [showArchiveToast, setShowArchiveToast] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [goalBusy, setGoalBusy] = useState(false);
  const controlsRef = useRef(null);
  useEffect(() => { onBreadcrumbChange?.(showGoalDetails ? 'Collection Goal Details' : ''); }, [showGoalDetails, onBreadcrumbChange]);
  useEffect(() => {
    if (!showArchiveToast) return undefined;
    const timeout = window.setTimeout(() => setShowArchiveToast(false), 8000);
    return () => window.clearTimeout(timeout);
  }, [showArchiveToast]);
  useEffect(() => {
    setGoalDetails(goals.find(goal => !goal.archivedAt && goal.status !== 'Archived') || null);
    setArchivedGoals(goals.filter(goal => Boolean(goal.archivedAt) || goal.status === 'Archived'));
  }, [goals]);
  useEffect(() => {
    try { localStorage.setItem('smile-clinic-billing-tab', showArchivedGoalsTab ? 'archived' : 'invoices'); }
    catch { /* The selected tab still works for this visit if storage is unavailable. */ }
  }, [showArchivedGoalsTab]);
  useEffect(() => {
    try {
      localStorage.setItem('smile-clinic-billing-filters', JSON.stringify({ query, status: filter, dateRange: dateFilter, customStartDate, customEndDate, advancedFilters }));
    } catch { /* Storage can be unavailable in private browsing. */ }
  }, [query, filter, dateFilter, customStartDate, customEndDate, advancedFilters]);
  const monthKey = today().slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  const dateBounds = useMemo(() => getInvoiceDateBounds(dateFilter, customStartDate, customEndDate), [dateFilter, customStartDate, customEndDate]);
  useEffect(() => {
    if (!showAdvancedFilters) return undefined;
    const closeOnOutside = event => { if (!controlsRef.current?.contains(event.target)) setShowAdvancedFilters(false); };
    const closeOnEscape = event => { if (event.key === 'Escape') setShowAdvancedFilters(false); };
    document.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [showAdvancedFilters]);
  const filtered = useMemo(() => invoices.filter(invoice => {
    const statusMatches = filter === 'All Statuses' || invoiceStatus(invoice) === filter;
    const queryMatches = !query || [invoice.patient, invoice.treatment, invoice.id, invoice.invoiceNumber, invoice.number].join(' ').toLowerCase().includes(query.toLowerCase());
    const invoiceDate = invoiceDateKey(invoice);
    const dateMatches = dateFilter === 'Custom Date Range'
      ? Boolean(dateBounds.start && dateBounds.end && invoiceDate && invoiceDate >= dateBounds.start && invoiceDate <= dateBounds.end)
      : Boolean(invoiceDate && (!dateBounds.start || invoiceDate >= dateBounds.start) && (!dateBounds.end || invoiceDate <= dateBounds.end));
    const amount = invoiceAmount(invoice);
    const minimum = advancedFilters.minimumAmount === '' ? null : Number(advancedFilters.minimumAmount);
    const maximum = advancedFilters.maximumAmount === '' ? null : Number(advancedFilters.maximumAmount);
    const amountMatches = (minimum === null || amount >= minimum) && (maximum === null || amount <= maximum);
    const paymentMatches = !advancedFilters.paymentMethod || normalizedText(invoice.paymentMethod) === normalizedText(advancedFilters.paymentMethod);
    const patientTypeMatches = !advancedFilters.patientType || getInvoicePatientType(invoice, invoices, patients) === advancedFilters.patientType;
    return statusMatches && queryMatches && dateMatches && amountMatches && paymentMatches && patientTypeMatches && invoiceMatchesTreatment(invoice, advancedFilters.treatmentType);
  }).sort((a, b) => invoiceDateKey(b).localeCompare(invoiceDateKey(a))), [invoices, patients, filter, query, dateBounds, advancedFilters]);

  const collected = invoices.reduce((sum, invoice) => sum + invoicePaymentAmount(invoice), 0);
  const recentPayments = invoices.reduce((sum, invoice, index) => sum + invoicePayments(invoice, index)
    .filter(payment => String(payment.paymentDate || '').startsWith(monthKey))
    .reduce((paymentTotal, payment) => paymentTotal + (Number(payment.amount) || 0), 0), 0);
  const collectionGoalProgress = useMemo(() => calculateGoalProgress(goalDetails, invoices), [invoices, goalDetails]);
  const persistGoalDetails = async details => {
    const isNewGoalAfterArchive = !goalDetails && !details.id && archivedGoals.length > 0;
    const saved = {
      ...(goalDetails || {}),
      ...details,
      id: details.id || goalDetails?.id || `goal-${Date.now()}`,
      status: details.status || goalDetails?.status || 'Active',
      excludedPaymentKeys: details.excludedPaymentKeys || goalDetails?.excludedPaymentKeys || (isNewGoalAfterArchive ? getInvoicePaymentKeys(invoices) : []),
      createdAt: details.createdAt || goalDetails?.createdAt || new Date().toISOString(),
    };
    await onSaveGoal?.(saved);
    setGoalDetails(saved);
    setGoalError('');
    return saved;
  };
  useEffect(() => {
    if (!goalDetails || !collectionGoalProgress || collectionGoalProgress.current < collectionGoalProgress.target) return;
    const transitioningToCompleted = goalDetails.status !== 'Completed';
    const crossedTarget = collectionGoalProgress.history.find(entry => entry.collected >= collectionGoalProgress.target)?.date;
    const completionDate = goalDetails.completionDate || crossedTarget || today();
    const notificationAlreadySent = Boolean(goalDetails.completionNotificationSentAt);
    const shouldNotify = transitioningToCompleted && Boolean(goalDetails.notifications) && !notificationAlreadySent;
    if (!transitioningToCompleted && goalDetails.completionDate && (!shouldNotify || notificationAlreadySent)) return;
    const notificationSentAt = shouldNotify ? new Date().toISOString() : goalDetails.completionNotificationSentAt;
    void (async () => {
      try {
        const completed = await persistGoalDetails({
          ...goalDetails,
          status: 'Completed',
          completionDate,
          progressHistory: collectionGoalProgress.history,
          ...(notificationSentAt ? { completionNotificationSentAt: notificationSentAt } : {}),
        });
        if (shouldNotify) await onGoalCompleted?.({
          id: `goal-completed-${completed.id}`,
          title: 'Collection Goal Completed',
          message: 'Congratulations! Your collection goal has reached its target amount.',
          createdAt: notificationSentAt,
        });
      } catch (error) {
        setGoalError(error.message || 'The collection goal could not be updated. Please try again.');
      }
    })();
  }, [goalDetails, collectionGoalProgress, onGoalCompleted]);
  const goalManagerLabel = goalDetails ? 'View Goal' : archivedGoals.length ? 'New Goal' : 'Manage Goal';
  const openGoalManager = () => {
    setEditingGoal(false);
    if (goalDetails && collectionGoalProgress) setShowGoalDetails(true);
    else setShowGoal(true);
  };
  const openArchivedGoalsTab = () => {
    try { localStorage.setItem('smile-clinic-billing-tab', 'archived'); }
    catch { /* Keep the in-memory tab selection when storage is unavailable. */ }
    setShowArchivedGoalsTab(true);
  };
  const openInvoicesTab = () => {
    try { localStorage.setItem('smile-clinic-billing-tab', 'invoices'); }
    catch { /* Keep the in-memory tab selection when storage is unavailable. */ }
    setShowArchivedGoalsTab(false);
  };
  const archiveGoal = async goal => {
    if (!goal || goalBusy) return false;
    const progress = calculateGoalProgress(goal, invoices);
    const archived = {
      ...goal,
      status: goal.status || 'Active',
      archivedAt: today(),
      finalCollectedAmount: progress?.current || 0,
      achievementPercent: progress?.percent || 0,
      progressHistory: progress?.history || [],
    };
    setGoalBusy(true);
    setGoalError('');
    try { await onSaveGoal?.(archived); }
    catch (error) {
      setGoalError(error.message || 'The collection goal could not be archived. Please try again.');
      return false;
    } finally { setGoalBusy(false); }
    setArchivedGoals(current => [archived, ...current.filter(item => item.id !== archived.id)]);
    if (goalDetails?.id === goal.id) {
      setGoalDetails(null);
    }
    setShowGoalDetails(false);
    setViewingArchivedGoalId(null);
    openArchivedGoalsTab();
    return true;
  };
  const deleteGoalPermanently = async () => {
    if (!goalToDelete || goalBusy) return;
    setGoalBusy(true);
    setGoalError('');
    try { await onDeleteGoal?.(goalToDelete.id); }
    catch (error) {
      setGoalError(error.message || 'The collection goal could not be deleted. Please try again.');
      setGoalBusy(false);
      return;
    }
    setGoalBusy(false);
    if (goalToDelete.archivedAt) {
      setArchivedGoals(current => current.filter(goal => goal.id !== goalToDelete.id));
      setShowArchivedGoalsTab(true);
    } else if (!goalDetails || goalDetails.id === goalToDelete.id) {
      setGoalDetails(null);
      setShowArchivedGoalsTab(false);
    }
    setConfirmGoalDelete(false);
    setGoalToDelete(null);
    setShowGoalDetails(false);
    setViewingArchivedGoalId(null);
  };
  const viewedArchivedGoal = viewingArchivedGoalId ? archivedGoals.find(goal => goal.id === viewingArchivedGoalId) : null;
  const detailsGoal = viewedArchivedGoal || goalDetails;
  const detailsProgress = detailsGoal ? calculateGoalProgress(detailsGoal, invoices, Boolean(viewedArchivedGoal)) : null;
  const appointmentsCompleted = appointments.filter(appointment => appointment.status === 'Completed' && appointment.date?.startsWith(monthKey)).length;
  const visibleInvoices = showAll ? filtered : filtered.slice(0, 3);
  const invoiceCode = invoice => invoice.invoiceNumber || invoice.number || `INV-${String(Math.max(1, invoices.indexOf(invoice) + 1)).padStart(4, '0')}`;
  const currentSelectedInvoice = selectedInvoice ? invoices.find(invoice => invoice.id === selectedInvoice.id) || selectedInvoice : null;
  const openInvoice = (invoice, view = 'details') => { setSelectedInvoice(invoice); setInvoiceView(view); };
  const clearFilters = () => {
    setQuery('');
    setFilter('All Statuses');
    setDateFilter('This Month');
    setCustomStartDate('');
    setCustomEndDate('');
    setAdvancedDraft(emptyAdvancedFilters());
    setAdvancedFilters(emptyAdvancedFilters());
    setShowAll(false);
    setShowAdvancedFilters(false);
  };
  const updateAdvancedDraft = (field, value) => setAdvancedDraft(current => ({ ...current, [field]: value }));
  const resetAdvancedFilters = () => {
    setAdvancedDraft(emptyAdvancedFilters());
    setAdvancedFilters(emptyAdvancedFilters());
    setShowAll(false);
  };
  const applyAdvancedFilters = () => { setAdvancedFilters({ ...advancedDraft }); setShowAll(false); setShowAdvancedFilters(false); };
  if (showGoalDetails && detailsProgress && detailsGoal) return <>
    {goalError && <p className="form-error" role="alert">{goalError}</p>}
    <CollectionGoalDetails
      goal={detailsGoal}
      progress={detailsProgress}
      isArchived={Boolean(viewedArchivedGoal)}
      onBack={() => { setShowGoalDetails(false); setViewingArchivedGoalId(null); }}
      onEdit={() => { setEditingGoal(true); setShowGoal(true); }}
      onArchive={() => setGoalToArchive(detailsGoal)}
      onDelete={() => { setGoalToDelete(detailsGoal); setConfirmGoalDelete(true); }}
    />
    {showGoal && <CollectionGoalModal initialDetails={editingGoal ? goalDetails : null} onClose={() => { setShowGoal(false); setEditingGoal(false); }} onSave={async details => { await persistGoalDetails(details); setShowGoal(false); setEditingGoal(false); }} />}
    {goalToArchive && <ArchiveGoalDialog goal={goalToArchive} progress={calculateGoalProgress(goalToArchive, invoices)} error={goalError} busy={goalBusy} onKeepActive={() => { setGoalToArchive(null); setGoalError(''); }} onConfirm={async () => { if (await archiveGoal(goalToArchive)) { setGoalToArchive(null); setShowArchiveToast(true); } }} />}
    {confirmGoalDelete && <GoalDeleteDialog goal={goalToDelete} error={goalError} busy={goalBusy} onClose={() => { setConfirmGoalDelete(false); setGoalToDelete(null); setGoalError(''); }} onConfirm={deleteGoalPermanently} />}
    {currentSelectedInvoice && <InvoiceDetailsModal invoice={currentSelectedInvoice} code={invoiceCode(currentSelectedInvoice)} initialView={invoiceView} invoiceIndex={invoices.indexOf(currentSelectedInvoice)} invoices={invoices} onRecordPayment={onRecordPayment} onClose={() => setSelectedInvoice(null)} />}
  </>;
  return <div className="content-page billing-page">
    {goalError && <p className="form-error" role="alert">{goalError}</p>}
    <div className="page-title-row">
      <div><h1>Billing</h1><p>Track invoices, insurance claims, and payments.</p></div>
      <div className="page-toolbar">
        <button className="primary-button billing-create-invoice" onClick={() => setShowForm(true)}><span aria-hidden="true">＋</span> Invoice</button>
      </div>
    </div>

    <section className="billing-metrics" aria-label="Billing summary">
      <article className="billing-metric"><div className="billing-metric-label">Collected<span className="billing-metric-icon billing-collection-icon" aria-hidden="true">₱</span></div><strong>{money(collected)}</strong><small>Payments recorded</small></article>
      <article className="billing-metric"><div className="billing-metric-label">Recent Payments<span className="billing-metric-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M9 3v3m6-3v3M8 10h8m-8 4h8m-8 4h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span></div><strong>{money(recentPayments)}</strong><small>{monthLabel}</small></article>
      <article className="billing-metric"><div className="billing-metric-label">Appointments Completed<span className="billing-metric-icon blue"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 8 3v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="m8.5 11.5 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span></div><strong>{appointmentsCompleted}</strong><small>This month</small></article>
      <article className="billing-metric"><div className="billing-metric-label">Active Patients<span className="billing-metric-icon amber"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M16 5.5a3 3 0 0 1 0 5.8m2 2a4 4 0 0 1 2.5 3.7v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></span></div><strong>{patients.length}</strong><small>Patient records</small></article>
    </section>

    <div className="billing-controls" ref={controlsRef}>
      <div className="billing-search-row">
        <label className="billing-search"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2" stroke="currentColor" strokeWidth="1.8"/><path d="m16.2 16.2 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><input type="search" aria-label="Search invoices or patients" placeholder="Search invoices or patients" value={query} onChange={event => { setQuery(event.target.value); setShowAll(false); }} /></label>
        <BillingFilterDropdown kind="status" label="Filter by invoice status" value={filter} options={statusOptions} onChange={value => { setFilter(value); setShowAll(false); }} />
        <BillingFilterDropdown kind="date" label="Filter invoices by date range" value={dateFilter} options={dateRangeOptions} onChange={value => { setDateFilter(value); setShowAll(false); }} />
        <button className={`billing-filter-reset ${showAdvancedFilters ? 'is-open' : ''} ${Object.values(advancedFilters).some(Boolean) ? 'has-active-filters' : ''}`} type="button" aria-label="Advanced filters" title="Advanced filters" aria-expanded={showAdvancedFilters} aria-controls="billing-advanced-filters" onClick={() => setShowAdvancedFilters(open => !open)}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg></button>
      </div>

      {dateFilter === 'Custom Date Range' && <div className="billing-custom-range">
        <label>Start date<input type="date" value={customStartDate} max={customEndDate || undefined} onChange={event => { setCustomStartDate(event.target.value); setShowAll(false); }} /></label>
        <label>End date<input type="date" value={customEndDate} min={customStartDate || undefined} onChange={event => { setCustomEndDate(event.target.value); setShowAll(false); }} /></label>
        <span>Choose a start and end date to filter invoices.</span>
      </div>}

      {showAdvancedFilters && <section className="billing-advanced-panel" id="billing-advanced-filters" aria-label="Advanced invoice filters">
        <header><div><h3>Advanced Filters</h3><p>Combine these with the status and date range above.</p></div><button type="button" className="billing-filter-close" aria-label="Close advanced filters" onClick={() => setShowAdvancedFilters(false)}>×</button></header>
        <div className="billing-advanced-grid">
          <div className="billing-advanced-field"><span>Treatment Type</span><BillingFilterDropdown kind="treatment" label="Filter by treatment type" value={advancedDraft.treatmentType || 'All treatment types'} options={['All treatment types', ...treatmentTypes]} onChange={value => updateAdvancedDraft('treatmentType', value === 'All treatment types' ? '' : value)}/></div>
          <label className="billing-advanced-field">Payment Method<AdminSelect label="Filter by payment method" value={advancedDraft.paymentMethod} options={[{ value: '', label: 'All payment methods' }, 'Cash', 'Online Payment']} onChange={value => updateAdvancedDraft('paymentMethod', value)}/></label>
          <label className="billing-advanced-field">Minimum Amount<input type="number" min="0" step="0.01" placeholder="No minimum" value={advancedDraft.minimumAmount} onChange={event => updateAdvancedDraft('minimumAmount', event.target.value)} /></label>
          <label className="billing-advanced-field">Maximum Amount<input type="number" min="0" step="0.01" placeholder="No maximum" value={advancedDraft.maximumAmount} onChange={event => updateAdvancedDraft('maximumAmount', event.target.value)} /></label>
          <label className="billing-advanced-field">Patient Type<AdminSelect label="Filter by patient type" value={advancedDraft.patientType} options={[{ value: '', label: 'All patient types' }, 'New Patient', 'Returning Patient']} onChange={value => updateAdvancedDraft('patientType', value)}/></label>
        </div>
        <footer><button className="secondary-button" type="button" onClick={resetAdvancedFilters}>Reset Filters</button><button className="primary-button" type="button" onClick={applyAdvancedFilters}>Apply Filters</button></footer>
      </section>}
    </div>

    <section className={`panel billing-invoices-panel billing-recent-panel ${visibleInvoices.length ? '' : 'is-empty'}`}>
      <div className="billing-table-toolbar">
        <div><div className="billing-section-title"><h2>Recent invoices</h2><span className="count-pill">{filtered.length} {filtered.length === 1 ? 'record' : 'records'}</span></div></div>
        {visibleInvoices.length > 0 && <button className="billing-view-all" type="button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show recent' : 'View all'}</button>}
      </div>

      {visibleInvoices.length ? <div className="billing-recent-scroll"><table className="billing-recent-table">
        <thead><tr><th>Patient / Invoice</th><th>Date</th><th>Treatment</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>{visibleInvoices.map(invoice => {
          const code = invoiceCode(invoice);
          return <tr key={invoice.id}>
            <td><b>{invoice.patient || '—'}</b><small>{code}</small></td><td>{invoiceDateKey(invoice) ? showDate(invoiceDateKey(invoice)) : '—'}</td><td>{invoice.treatment || '—'}</td><td className="billing-amount">{money(invoiceAmount(invoice))}</td>
            <td><span className={`billing-status ${invoiceStatus(invoice) === 'Paid' ? 'is-paid' : invoiceStatus(invoice) === 'Partial Payment' ? 'is-partial' : 'is-unpaid'}`}><i/>{invoiceStatus(invoice)}</span></td>
            <td className="billing-row-actions"><button className="billing-view-invoice" type="button" onClick={() => openInvoice(invoice)}>View invoice</button>{invoiceStatus(invoice) === 'Paid' ? <button className="billing-receipt-action" type="button" onClick={() => openInvoice(invoice, 'receipt')}>Receipt</button> : <button className="billing-record-payment" type="button" onClick={() => openInvoice(invoice, 'payment')}>Record payment</button>}</td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="billing-invoices-empty-state">
        <svg className="billing-empty-illustration" viewBox="0 0 180 150" fill="none" aria-hidden="true">
          <circle cx="90" cy="78" r="67" fill="#EAF8F0"/><circle cx="17" cy="49" r="4" fill="#69DF95"/><circle cx="157" cy="105" r="4" fill="#69DF95"/>
          <path d="M51 13h76a9 9 0 0 1 9 9v104l-12-8-12 8-12-8-12 8-12-8-12 8-12-8-12 8V22a9 9 0 0 1 9-9Z" fill="#fff" stroke="#A8DCC3" strokeWidth="2"/>
          <rect x="75" y="28" width="31" height="31" rx="10" fill="#EAF8F0"/><path d="M90.5 36v15m-7.5-7.5h15" stroke="#16845F" strokeWidth="5" strokeLinecap="round"/>
          <path d="M68 78h49M68 91h32M68 104h21" stroke="#D5E9DF" strokeWidth="6" strokeLinecap="round"/>
          <circle cx="139" cy="121" r="21" fill="#69DF95" stroke="#fff" strokeWidth="3"/><path d="M131 115h11a4 4 0 0 1 0 8h-11m0-4h9m-9 9h11m-15-18v20" stroke="#16845F" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        <h3>{invoices.length ? 'No Matching Invoices Found' : 'No Invoice Records Found'}</h3>
        <p>{invoices.length ? 'Try adjusting your filters or date range to view more billing records.' : 'No billing records have been created yet. Generate your first invoice to begin tracking payments and clinic revenue.'}</p>
        <div className="billing-empty-actions">
          {invoices.length > 0 ? <button className="secondary-button" onClick={clearFilters}>Reset Filters</button> : <button className="primary-button billing-create-invoice" onClick={() => setShowForm(true)}><span aria-hidden="true">＋</span> Create Invoice</button>}
        </div>
      </div>}
    </section>


    {showForm && <CreateInvoiceModal patients={patients} invoices={invoices} onClose={() => setShowForm(false)} onSave={async record => { await onAdd(record); setShowForm(false); }} />}
    {currentSelectedInvoice && <InvoiceDetailsModal invoice={currentSelectedInvoice} code={invoiceCode(currentSelectedInvoice)} initialView={invoiceView} invoiceIndex={invoices.indexOf(currentSelectedInvoice)} invoices={invoices} onRecordPayment={onRecordPayment} onClose={() => setSelectedInvoice(null)} />}
  </div>;
}
