import { useState } from 'react';

export default function FormModal({ title, description, fields, submitLabel = 'Save', onClose, onSubmit }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.name, field.defaultValue ?? ''])));
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    const missing = fields.find(field => field.required && !String(values[field.name] ?? '').trim());
    if (missing) { setError(`Please enter ${missing.label.toLowerCase()}.`); return; }
    onSubmit(values);
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-heading"><div><p className="eyebrow">CLINIC WORKSPACE</p><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="close-button" type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <form onSubmit={submit}><div className="form-grid">{fields.map(field => <label className={field.wide ? 'field wide' : 'field'} key={field.name}>{field.label}{field.type === 'select' ? <select required={field.required} value={values[field.name]} onChange={e => setValues({ ...values, [field.name]: e.target.value })}><option value="">{field.placeholder || 'Choose an option'}</option>{field.options?.map(option => <option key={option.value ?? option} value={option.value ?? option}>{option.label ?? option}</option>)}</select> : field.type === 'textarea' ? <textarea rows="3" placeholder={field.placeholder} required={field.required} value={values[field.name]} onChange={e => setValues({ ...values, [field.name]: e.target.value })} /> : <input type={field.type || 'text'} placeholder={field.placeholder} required={field.required} min={field.min} step={field.step} value={values[field.name]} onChange={e => setValues({ ...values, [field.name]: e.target.value })} />}</label>)}</div>{error && <p className="form-error" role="alert">{error}</p>}<footer className="form-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{submitLabel}</button></footer></form>
    </section>
  </div>;
}
