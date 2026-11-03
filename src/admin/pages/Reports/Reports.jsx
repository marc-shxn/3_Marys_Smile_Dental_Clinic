import { useEffect, useMemo, useRef, useState } from 'react';
import './Reports.css';

const money = value => `₱${(Number(value) || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
const compactMoney = value => {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000) return `₱${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (amount >= 10_000) return `₱${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return money(amount);
};
const numericAmount = value => Number(String(value ?? '').replace(/[^\d.-]/g, '')) || 0;
const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const dateKey = value => {
  if (!value) return '';
  const text = String(value);
  const direct = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (direct) return direct[0];
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const localDateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = key => {
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = date => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const dateLabel = key => {
  const date = parseDate(key);
  return date ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date) : '—';
};
const isWithinRange = (key, start, end) => !start && !end ? true : !!key && (!start || key >= start) && (!end || key <= end);
const buildTrendBuckets = (rangeType, rangeStart, rangeEnd, now, invoices) => {
  const datedInvoices = invoices.map(invoice => invoiceDate(invoice)).filter(Boolean).sort();
  const start = parseDate(rangeStart) || parseDate(datedInvoices[0]) || startOfMonth(now);
  const end = parseDate(rangeEnd) || parseDate(datedInvoices.at(-1)) || now;
  const rangeDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const unit = rangeType === 'All Time' && rangeDays > 550 ? 'year' : rangeType === 'This Year' || rangeDays > 75 ? 'month' : rangeDays > 14 ? 'week' : 'day';
  const buckets = [];

  if (unit === 'day') {
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      buckets.push({ start: localDateKey(cursor), end: localDateKey(cursor), label: new Intl.DateTimeFormat('en', { weekday: 'short' }).format(cursor) });
    }
  } else if (unit === 'week') {
    let week = 1;
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 7), week += 1) {
      const bucketEnd = new Date(Math.min(addDays(cursor, 6).getTime(), end.getTime()));
      const startLabel = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(cursor);
      const endLabel = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(bucketEnd);
      buckets.push({ start: localDateKey(cursor), end: localDateKey(bucketEnd), label: `${startLabel}–${endLabel}`, period: `Week ${week}` });
    }
  } else if (unit === 'month') {
    for (let cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
      const bucketStart = new Date(Math.max(cursor.getTime(), start.getTime()));
      const bucketEnd = new Date(Math.min(endOfMonth(cursor).getTime(), end.getTime()));
      buckets.push({ start: localDateKey(bucketStart), end: localDateKey(bucketEnd), label: new Intl.DateTimeFormat('en', { month: 'short' }).format(cursor) });
    }
  } else {
    for (let cursor = new Date(start.getFullYear(), 0, 1); cursor <= end; cursor = new Date(cursor.getFullYear() + 1, 0, 1)) {
      const bucketStart = new Date(Math.max(cursor.getTime(), start.getTime()));
      const bucketEnd = new Date(Math.min(new Date(cursor.getFullYear(), 11, 31).getTime(), end.getTime()));
      buckets.push({ start: localDateKey(bucketStart), end: localDateKey(bucketEnd), label: String(cursor.getFullYear()) });
    }
  }

  return { unit, buckets };
};
const invoiceAmount = invoice => numericAmount(invoice.totalAmount ?? invoice.amount);
const invoiceDate = invoice => dateKey(invoice.invoiceDate || invoice.createdAt || invoice.dueDate);
const paymentEntries = invoice => {
  if (Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length) {
    return invoice.paymentHistory.map(payment => ({ amount: numericAmount(payment.amount), date: dateKey(payment.paymentDate || payment.createdAt || invoice.invoiceDate || invoice.createdAt) }));
  }
  const paid = numericAmount(invoice.amountPaid) || (invoice.status === 'Paid' ? invoiceAmount(invoice) : 0);
  return paid ? [{ amount: paid, date: dateKey(invoice.paymentDate || invoice.invoiceDate || invoice.createdAt) }] : [];
};
const escapeCsv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const downloadCsv = (filename, rows) => {
  const csv = rows.map(row => row.map(escapeCsv).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

function ReportIcon({ name }) {
  const shared = { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    revenue: <><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/><path d="M16 7h3v3"/></>,
    payment: <><circle cx="12" cy="12" r="9"/><path d="M8 10h8M8 14h8"/><path d="M10 7v10"/></>,
    appointment: <><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16M9 14h2m2 0h2m-6 3h2"/></>,
    patients: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20z"/><path d="M16 5.5a3 3 0 0 1 0 5.8m1.5 3a4.5 4.5 0 0 1 3 4.2V20h-3"/></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 10h16"/><path d="M8 14h2m4 0h2m-8 3h2"/></>,
    export: <><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></>,
    report: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    patientsReport: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20z"/><path d="M16 8h5m-2.5-2.5v5"/></>,
    treatment: <><path d="M8 3c-2.4 0-4 1.8-4 4.2 0 3.4 2.2 4.1 2.4 7.6.1 2 1 5.2 2.7 5.2 1.2 0 1.2-3 2.9-3s1.7 3 2.9 3c1.7 0 2.6-3.2 2.7-5.2.2-3.5 2.4-4.2 2.4-7.6C20 4.8 18.4 3 16 3c-1.8 0-2.8 1-4 1S9.8 3 8 3z"/></>,
  };
  return <svg {...shared}>{paths[name] || paths.report}</svg>;
}

function getRange(type, now, customStart, customEnd) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (type === 'Today') return [localDateKey(today), localDateKey(today)];
  if (type === 'This Week') {
    const start = mondayOf(today);
    return [localDateKey(start), localDateKey(addDays(start, 5))];
  }
  if (type === 'This Month') return [localDateKey(startOfMonth(today)), localDateKey(endOfMonth(today))];
  if (type === 'Last Month') { const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1); return [localDateKey(previous), localDateKey(endOfMonth(previous))]; }
  if (type === 'This Year') return [`${today.getFullYear()}-01-01`, `${today.getFullYear()}-12-31`];
  if (type === 'Custom Range') return [customStart || localDateKey(startOfMonth(today)), customEnd || localDateKey(today)];
  return ['', ''];
}

export default function Reports({ appointments = [], visits = [], patients = [], invoices = [], onSaveReport }) {
  const [now] = useState(() => new Date());
  const [rangeType, setRangeType] = useState('This Month');
  const [customStart, setCustomStart] = useState(localDateKey(startOfMonth(now)));
  const [customEnd, setCustomEnd] = useState(localDateKey(now));
  const [openPanel, setOpenPanel] = useState(null);
  const [notice, setNotice] = useState('');
  const toolbarRef = useRef(null);
  const periodMenuRef = useRef(null);
  const periodTriggerRef = useRef(null);

  const [rangeStart, rangeEnd] = getRange(rangeType, now, customStart, customEnd);
  const visitRecords = useMemo(() => [
    ...appointments.map(appointment => ({ ...appointment, visitSource: 'Appointment', visitType: 'Appointment', type: 'Appointment' })),
    ...visits.map(visit => {
      const source = visit.visitSource || visit.visit_source || visit.visitType || visit.visit_type || 'Walk-In';
      return { ...visit, service: visit.service || visit.treatmentType || 'Other', status: 'Completed', visitSource: source, visitType: source, type: source };
    }),
  ], [appointments, visits]);
  const visibleAppointments = useMemo(() => appointments.filter(item => isWithinRange(dateKey(item.date), rangeStart, rangeEnd)), [appointments, rangeStart, rangeEnd]);
  const visibleVisits = useMemo(() => visits.filter(item => isWithinRange(dateKey(item.date), rangeStart, rangeEnd)), [visits, rangeStart, rangeEnd]);
  const visibleVisitRecords = useMemo(() => visitRecords.filter(item => isWithinRange(dateKey(item.date), rangeStart, rangeEnd)), [visitRecords, rangeStart, rangeEnd]);
  const totalVisitCount = visibleVisitRecords.length;
  const visibleInvoices = useMemo(() => invoices.filter(invoice => isWithinRange(invoiceDate(invoice), rangeStart, rangeEnd)), [invoices, rangeStart, rangeEnd]);
  const visiblePatients = useMemo(() => patients.filter(patient => isWithinRange(dateKey(patient.createdAt), rangeStart, rangeEnd)), [patients, rangeStart, rangeEnd]);
  const collectedPayments = useMemo(() => visibleInvoices.flatMap(paymentEntries).filter(payment => isWithinRange(payment.date, rangeStart, rangeEnd)), [visibleInvoices, rangeStart, rangeEnd]);
  const revenue = visibleInvoices.reduce((sum, invoice) => sum + invoiceAmount(invoice), 0);
  const collected = collectedPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const completedVisits = visibleVisitRecords.filter(item => String(item.status || '').toLowerCase() === 'completed').length;
  const completedRate = totalVisitCount ? Math.round(completedVisits / totalVisitCount * 100) : 0;
  const collectionRate = revenue ? Math.min(100, Math.round(collected / revenue * 100)) : 0;

  const trend = useMemo(() => buildTrendBuckets(rangeType, rangeStart, rangeEnd, now, invoices), [rangeType, rangeStart, rangeEnd, now, invoices]);
  const trendValues = trend.buckets.map(bucket => ({
    ...bucket,
    amount: visibleInvoices.filter(invoice => invoiceDate(invoice) >= bucket.start && invoiceDate(invoice) <= bucket.end).reduce((sum, invoice) => sum + invoiceAmount(invoice), 0),
  }));
  const trendMax = Math.max(1, ...trendValues.map(item => item.amount));
  const trendTotal = revenue;

  const visitTypes = useMemo(() => {
    const sourceFor = item => String(item.visitSource || item.visit_source || item.visitType || item.visit_type || item.type || '').trim().toLowerCase();
    const walkIns = visibleVisitRecords.filter(item => /walk[ -]?in/.test(sourceFor(item))).length;
    const scheduled = visibleVisitRecords.filter(item => /appointment/.test(sourceFor(item))).length;
    return [{ label: 'Walk-ins', count: walkIns, color: 'orange' }, { label: 'Scheduled Appointments', count: scheduled, color: 'green' }];
  }, [visibleVisitRecords]);
  const visitTotal = visitTypes.reduce((sum, item) => sum + item.count, 0);
  const exportVisitTypes = () => {
    downloadCsv('patient-visit-types.csv', [
    ['Visit type', 'Visits', 'Share'],
    ...visitTypes.map(item => [item.label, item.count, `${visitTotal ? Math.round(item.count / visitTotal * 100) : 0}%`]),
      ['Total Visits', visitTotal, '100%'],
    ]);
    recordReport('Patient visit types', 'visit-types', { rangeStart, rangeEnd, visitTypes, visitTotal });
  };
  const treatments = useMemo(() => {
    const totals = new Map();
    visibleInvoices.forEach(invoice => {
      const name = invoice.treatment || 'Other treatment';
      const current = totals.get(name) || { amount: 0, visits: 0 };
      current.amount += invoiceAmount(invoice);
      totals.set(name, current);
    });
    visibleVisitRecords.filter(item => String(item.status || '').toLowerCase() === 'completed').forEach(visit => {
      const name = visit.service || 'Other treatment';
      const current = totals.get(name) || { amount: 0, visits: 0 };
      current.visits += 1;
      totals.set(name, current);
    });
    return [...totals.entries()].sort((a, b) => b[1].visits - a[1].visits || b[1].amount - a[1].amount).slice(0, 4).map(([name, totalsForTreatment]) => ({ name, ...totalsForTreatment }));
  }, [visibleInvoices, visibleVisitRecords]);
  const treatmentMax = Math.max(1, ...treatments.map(item => item.amount));
  const treatmentVolumeMax = Math.max(1, ...treatments.map(item => item.visits));
  const recordReport = (reportName, reportType, data) => {
    Promise.resolve(onSaveReport?.({ reportName, reportType, generatedBy: 'Clinic staff', generatedDate: new Date().toISOString(), data }))
      .catch(error => setNotice(error.message || 'The report was exported, but its history could not be saved.'));
  };

  const periodLabel = rangeType === 'Custom Range'
    ? `${dateLabel(rangeStart)} – ${dateLabel(rangeEnd)}`
    : rangeType === 'All Time'
      ? 'All time'
      : (() => {
        const start = parseDate(rangeStart);
        const end = parseDate(rangeEnd);
        if (!start || !end) return 'Select a date range';
        const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(start);
        return `${month} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
      })();

  const exportFinancial = () => {
    downloadCsv('monthly-financial-summary.csv', [
    ['Metric', 'Value'], ['Period', periodLabel], ['Revenue generated', revenue], ['Collected payment', collected], ['Collection rate', `${collectionRate}%`],
    [], ['Invoice', 'Patient', 'Treatment', 'Date', 'Status', 'Amount'],
      ...visibleInvoices.map(invoice => [invoice.invoiceNumber || invoice.id, invoice.patient || invoice.patientName, invoice.treatment, invoiceDate(invoice), invoice.status, invoiceAmount(invoice)]),
    ]);
    recordReport('Monthly financial summary', 'financial-summary', { period: periodLabel, revenue, collected, collectionRate, invoiceCount: visibleInvoices.length });
  };
  const exportRetention = () => {
    const completedRecords = visitRecords.filter(visit => String(visit.status || '').toLowerCase() === 'completed');
    const retentionRows = patients.map(patient => {
      const patientVisits = completedRecords.filter(visit => visit.patientId === patient.id || (!visit.patientId && normalize(visit.patient) === normalize(patient.name))).sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
      return { patient, visits: patientVisits, type: patientVisits.length > 1 ? 'Returning' : 'New' };
    });
    const returningPatients = retentionRows.filter(row => row.type === 'Returning').length;
    const newPatients = retentionRows.length - returningPatients;
    downloadCsv('patient-retention-report.csv', [['Patient ID', 'Patient', 'Patient type', 'Visit count', 'Last visit'], ...retentionRows.map(({ patient, visits: patientVisits, type }) => [patient.patientNumber || patient.id, patient.name, type, patientVisits.length, dateKey(patientVisits[0]?.date) || patient.lastVisitDate || ''])]);
    recordReport('Patient retention report', 'patient-retention', { rangeStart, rangeEnd, patientCount: patients.length, visitCount: completedRecords.length, newPatients, returningPatients });
  };
  const exportTreatments = () => {
    downloadCsv('treatment-completion-report.csv', [['Patient', 'Treatment', 'Date', 'Visit source', 'Status'], ...visibleVisitRecords.map(appointment => [appointment.patient, appointment.service, dateKey(appointment.date), appointment.visitSource || appointment.visitType || 'Appointment', appointment.status || 'Scheduled'])]);
    recordReport('Treatment Completion Report', 'treatment-completion', { rangeStart, rangeEnd, appointments: visibleAppointments.length, visits: visibleVisits.length, completedVisits });
  };
  const quickReports = [
    { title: 'Monthly financial summary', detail: 'Updated for selected date range', icon: 'report', onClick: exportFinancial },
    { title: 'Patient retention report', detail: 'Patient visits and activity', icon: 'patientsReport', onClick: exportRetention },
    { title: 'Treatment Completion Report', detail: 'Appointment and walk-in treatment outcomes', icon: 'treatment', onClick: exportTreatments },
  ];

  useEffect(() => {
    if (!openPanel) return undefined;
    const closeOnOutsidePointer = event => {
      if (!toolbarRef.current?.contains(event.target)) setOpenPanel(null);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        setOpenPanel(null);
        periodTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    if (openPanel === 'period') periodMenuRef.current?.querySelector('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openPanel]);

  const handleExport = () => {
    downloadCsv('smile-clinic-report.csv', [
      ['Report', 'Value'], ['Period', periodLabel], ['Revenue generated', revenue], ['Collected payment', collected], ['Appointments', visibleAppointments.length], ['Completed appointments', completedVisits], ['New patients', visiblePatients.length],
      [], ['Date', 'Revenue'], ...trendValues.map(item => [item.key, item.amount]),
      [], ['Patient', 'Treatment', 'Date', 'Status', 'Amount'], ...visibleInvoices.map(invoice => [invoice.patient || invoice.patientName, invoice.treatment, invoiceDate(invoice), invoice.status, invoiceAmount(invoice)]),
    ]);
    recordReport('Clinic performance report', 'clinic-performance', { period: periodLabel, revenue, collected, appointments: visibleAppointments.length, completedAppointments: completedVisits, newPatients: visiblePatients.length, trend: trendValues });
    setNotice('Report exported as a CSV file.');
    window.setTimeout(() => setNotice(''), 3500);
  };

  return <div className="content-page reports-page">
    <div className="reports-heading">
      <div><h1>Reports</h1><p>Understand clinic performance and patient care trends.</p></div>
      <button className="reports-export" type="button" onClick={handleExport}><ReportIcon name="export"/>Export</button>
    </div>

    <div className="reports-toolbar-wrap" ref={toolbarRef}>
      <div className="reports-toolbar">
        <div className="reports-period-picker">
          <button ref={periodTriggerRef} className={`reports-period-trigger${openPanel === 'period' ? ' is-open' : ''}`} type="button" aria-label="Choose report date range" aria-haspopup="listbox" aria-expanded={openPanel === 'period'} aria-controls="reports-period-options" onClick={() => setOpenPanel(current => current === 'period' ? null : 'period')}>
            <span>{rangeType}</span><i aria-hidden="true"/>
          </button>
          {openPanel === 'period' && <div ref={periodMenuRef} className="reports-period-menu" id="reports-period-options" role="listbox" aria-label="Report date ranges">
            {['Today', 'This Week', 'This Month', 'Last Month', 'This Year', 'All Time', 'Custom Range'].map(option => <button key={option} type="button" role="option" aria-selected={rangeType === option} className={`reports-period-option${rangeType === option ? ' is-selected' : ''}`} onClick={() => { setRangeType(option); setOpenPanel(option === 'Custom Range' ? 'custom' : null); periodTriggerRef.current?.focus(); }}>
              <span>{option}</span>{rangeType === option && <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8.2 2.8 2.8 6.2-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>)}
          </div>}
        </div>
        <button className={`reports-calendar-button${openPanel === 'custom' ? ' is-open' : ''}`} type="button" aria-label="Choose custom date range" aria-haspopup="dialog" aria-expanded={openPanel === 'custom'} aria-controls="reports-custom-range" onClick={() => { setRangeType('Custom Range'); setOpenPanel(current => current === 'custom' ? null : 'custom'); }}><ReportIcon name="calendar"/></button>
        <span className="reports-period-label">{periodLabel}</span>
      </div>
      {openPanel === 'custom' && <div className="reports-custom-range" id="reports-custom-range" role="group" aria-label="Custom report date range"><label>From<input type="date" value={customStart} max={customEnd || undefined} onChange={event => setCustomStart(event.target.value)}/></label><span>to</span><label>To<input type="date" value={customEnd} min={customStart || undefined} onChange={event => setCustomEnd(event.target.value)}/></label></div>}
    </div>

    {notice && <div className="reports-notice" role="status">✓ {notice}</div>}

    <section className="reports-kpis" aria-label="Clinic performance summary">
      <article className="reports-kpi"><div className="reports-kpi-heading">Revenue Generated<span className="reports-icon-green"><ReportIcon name="revenue"/></span></div><strong>{compactMoney(revenue)}</strong><small>{visibleInvoices.length} invoice{visibleInvoices.length === 1 ? '' : 's'} in range</small></article>
      <article className="reports-kpi"><div className="reports-kpi-heading">Collected Payment<span className="reports-icon-blue"><ReportIcon name="payment"/></span></div><strong>{compactMoney(collected)}</strong><small>{collectionRate}% collection rate</small></article>
      <article className="reports-kpi"><div className="reports-kpi-heading">Total Visits<span className="reports-icon-purple"><ReportIcon name="appointment"/></span></div><strong>{totalVisitCount.toLocaleString()}</strong><small>{completedRate}% completed</small></article>
      <article className="reports-kpi"><div className="reports-kpi-heading">New patients<span className="reports-icon-orange"><ReportIcon name="patients"/></span></div><strong>{visiblePatients.length.toLocaleString()}</strong><small>Added in selected period</small></article>
    </section>

    <section className="reports-section">
      <div className="reports-section-title"><div><h2>Revenue Trend</h2><p>Gross production by {trend.unit} · {periodLabel}</p></div><span>{trend.unit === 'month' ? 'Monthly' : trend.unit === 'year' ? 'Yearly' : trend.unit === 'week' ? 'Weekly' : 'Daily'}</span></div>
      <div className="reports-trend-card"><div className="reports-trend-summary"><div><small>Total production</small><strong>{money(trendTotal)}</strong></div><small>{trendValues.length} {trend.unit}{trendValues.length === 1 ? '' : 's'} view</small></div><div className="reports-chart" role="img" aria-label={`Revenue trend, total ${money(trendTotal)}`}>
        <div className="reports-chart-grid"><i/><i/><i/></div>
        <div className="reports-chart-bars" style={{ gridTemplateColumns: `repeat(${Math.max(1, trendValues.length)}, minmax(0, 1fr))` }}>{trendValues.map((item, index) => <div className="reports-chart-column" key={item.start}><small>{money(item.amount)}</small><div className="reports-chart-bar-wrap"><i className={index === trendValues.findIndex(value => value.amount === trendMax) && item.amount > 0 ? 'is-highlighted' : ''} style={{ height: `${item.amount ? Math.max(10, item.amount / trendMax * 100) : 0}%` }}/></div><span>{item.label}</span></div>)}</div>
      </div></div>
    </section>

    <div className="reports-insights-grid">
      <section className="reports-section">
        <div className="reports-section-title"><div><h2>Patient Visit Types</h2></div><button type="button" onClick={exportVisitTypes}>Details</button></div>
        <div className="reports-insight-card reports-visits-card">
          <div className="reports-visit-stack" aria-label={`${visitTotal} total visits`}>{visitTotal > 0 ? visitTypes.map(item => <i key={item.label} className={`is-${item.color}`} style={{ width: `${item.count / visitTotal * 100}%` }} />) : <i className="is-empty"/>}</div>
          {visitTypes.map(item => <div className="reports-visit-row" key={item.label}><span><i className={`is-${item.color}`}/>{item.label}</span><b>{item.count} Visits <small>{visitTotal ? Math.round(item.count / visitTotal * 100) : 0}%</small></b></div>)}
          <footer><span>Total Visits</span><b>{visitTotal} Visits</b></footer>
        </div>
      </section>

      <section className="reports-section">
        <div className="reports-section-title"><div><h2>Top Treatments</h2><p>By visit volume and production in selected period</p></div></div>
        <div className="reports-insight-card reports-treatment-card">{treatments.length ? treatments.map(item => <div className="reports-treatment-row" key={item.name}><div><span>{item.name}</span><b>{money(item.amount)}<small>{item.visits} completed {item.visits === 1 ? 'visit' : 'visits'}</small></b></div><i><span style={{ width: item.visits ? `${Math.max(4, item.visits / treatmentVolumeMax * 100)}%` : `${Math.max(4, item.amount / treatmentMax * 100)}%` }}/></i></div>) : <div className="reports-inline-empty">Treatment activity will appear here when visits or invoices are added.</div>}</div>
      </section>
    </div>

    <section className="reports-section reports-quick-section">
      <div className="reports-section-title"><div><h2>Quick Reports</h2></div></div>
      <div className="reports-quick-card">{quickReports.map(item => <button type="button" className="reports-quick-link" key={item.title} onClick={item.onClick}><span className="reports-quick-icon"><ReportIcon name={item.icon}/></span><span className="reports-quick-copy"><b>{item.title}</b><small>{item.detail}</small></span><i aria-hidden="true">›</i></button>)}</div>
    </section>
  </div>;
}

function mondayOf(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}
