import { useState } from 'react';
import AdminSelect from './AdminSelect.jsx';

const ageFrom = value => {
  if (!value) return null;
  const birthDate = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birthDate.valueOf())) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  if (now.getMonth() < birthDate.getMonth() || (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate())) age--;
  return age >= 0 ? age : null;
};

export default function FormModal({ title, description, fields, submitLabel = 'Save', showCancel = true, modalClassName = '', onClose, onSubmit }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.filter(field => field.type !== 'age').map(field => [field.name, field.defaultValue ?? ''])));
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [saving, setSaving] = useState(false);
  const visibleFields = fields.filter(field => !field.visibleWhen || field.visibleWhen(values));
  const isRequired = field => typeof field.requiredWhen === 'function' ? field.requiredWhen(values) : Boolean(field.required);

  const update = (name, value) => {
    setValues(current => ({ ...current, [name]: value }));
    setError('');
    setInvalidField('');
  };

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const missing = visibleFields.find(field => isRequired(field) && !String(values[field.name] ?? '').trim());
    if (missing) {
      setError(`Please enter ${missing.label.replace(/\s*\*$/, '').toLowerCase()}.`);
      setInvalidField(missing.name);
      return;
    }
    const invalid = visibleFields.find(field => typeof field.validate === 'function' && !field.validate(values[field.name], values));
    if (invalid) {
      setError(invalid.validationMessage || `Please check ${invalid.label.replace(/\s*\*$/, '').toLowerCase()}.`);
      setInvalidField(invalid.name);
      return;
    }
    setInvalidField('');
    setSaving(true);
    try { await onSubmit(values); }
    catch (saveError) { setError(saveError.message || 'The information could not be saved.'); }
    finally { setSaving(false); }
  }

  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`form-modal${modalClassName ? ` ${modalClassName}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header className="modal-heading"><div><p className="eyebrow">CLINIC WORKSPACE</p><h2 id="modal-title">{title}</h2>{description && <p>{description}</p>}</div><button className="close-button" type="button" aria-label="Close" onClick={onClose}>×</button></header>
      <form onSubmit={submit}>
        <div className="form-grid">
          {visibleFields.map(field => {
            const required = isRequired(field);
            const fieldLabel = required
              ? (/\*$/.test(field.label) ? field.label : `${field.label} *`)
              : typeof field.optionalWhen === 'function' && field.optionalWhen(values) && !/\(optional\)$/i.test(field.label)
                ? `${field.label} (Optional)`
                : field.label;
            return <div className={field.wide ? 'field wide' : 'field'} key={field.name}>
            {field.type === 'age' ? <span>{fieldLabel}</span> : <label htmlFor={`form-${field.name}`}>{fieldLabel}</label>}
            {field.renderInput ? field.renderInput({ id: `form-${field.name}`, value: values[field.name], onChange: value => update(field.name, value), required, invalid: invalidField === field.name })
              : field.type === 'select' ? <AdminSelect className="form-modal-select" compact value={values[field.name]} options={[{ value: '', label: field.placeholder || 'Choose an option' }, ...(field.options || []).map(option => ({ value: option.value ?? option, label: option.label ?? option })), ...(values[field.name] && !field.options?.some(option => (option.value ?? option) === values[field.name]) ? [{ value: values[field.name], label: values[field.name] }] : [])]} onChange={value => update(field.name, value)} required={required} invalid={invalidField === field.name} label={fieldLabel}/>
            : field.type === 'age' ? <><output className="form-readonly-output">{(() => { const age = ageFrom(values[field.source]); return age === null ? 'Select date of birth' : `${age} ${age === 1 ? 'year' : 'years'} old`; })()}</output><small className="form-readonly-hint">Updates automatically from date of birth</small></> : field.type === 'textarea' ? <textarea id={`form-${field.name}`} rows="3" placeholder={field.placeholder} required={required} value={values[field.name]} onChange={event => update(field.name, event.target.value)} /> : field.type === 'numberOrNone' ? <div className="form-number-none">
              <input id={`form-${field.name}`} type="number" min={field.min ?? '0'} step={field.step ?? 'any'} placeholder={field.placeholder || `Enter ${field.label}`} disabled={values[field.name] === 'None'} value={values[field.name] === 'None' ? '' : values[field.name]} onChange={event => update(field.name, event.target.value)} />
              <label className="form-none-option"><input type="checkbox" checked={values[field.name] === 'None'} onChange={event => update(field.name, event.target.checked ? 'None' : '')} /><span>None</span></label>
            </div> : <input id={`form-${field.name}`} type={field.type || 'text'} placeholder={field.placeholder} required={required} min={field.min} max={field.max} step={field.step} value={values[field.name]} onChange={event => update(field.name, event.target.value)} />}
          </div>;
          })}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="form-actions">{showCancel && <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button></footer>
      </form>
    </section>
  </div>;
}
