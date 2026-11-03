import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './UserSelect.css';

export default function UserSelect({ value = '', onChange, options = [], placeholder = 'Choose an option', label = 'Choose an option', name, required = false, disabled = false, className = '' }) {
  const id = useId();
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const groups = useMemo(() => options.map((item, index) => Array.isArray(item.options)
    ? { label: item.label, options: item.options.map(option => typeof option === 'string' ? { label: option, value: option } : option) }
    : { label: null, options: [typeof item === 'string' ? { label: item, value: item } : item] }).filter(group => group.options.length), [options]);
  const flatOptions = useMemo(() => groups.flatMap(group => group.options), [groups]);
  const selected = flatOptions.find(option => option.value === value);
  const listId = `${id}-list`;

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const closeEscape = event => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    optionRefs.current[activeIndex]?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open, activeIndex]);

  function choose(option) {
    onChange?.(option.value);
    setInvalid(false);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveActive(key) {
    if (!flatOptions.length) return;
    setActiveIndex(index => key === 'Home' ? 0 : key === 'End' ? flatOptions.length - 1 : (index + (key === 'ArrowDown' ? 1 : -1) + flatOptions.length) % flatOptions.length);
  }

  function onTriggerKeyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      const index = Math.max(0, flatOptions.findIndex(option => option.value === value));
      setActiveIndex(index);
      setOpen(true);
    }
  }

  function onOptionKeyDown(event) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); moveActive(event.key); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(flatOptions[activeIndex]); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
    else if (event.key === 'Tab') setOpen(false);
  }

  return <div className={`user-select${open ? ' is-open' : ''}${invalid ? ' is-invalid' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()} ref={rootRef}>
    <button ref={triggerRef} className="user-select-trigger" type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-required={required || undefined} aria-invalid={invalid || undefined} disabled={disabled} onClick={() => { if (!open) setActiveIndex(Math.max(0, flatOptions.findIndex(option => option.value === value))); setOpen(current => !current); }} onKeyDown={onTriggerKeyDown}>
      <span className={!selected ? 'is-placeholder' : ''}>{selected?.label || placeholder}</span>
      <svg className="user-select-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    {open && <div className="user-select-menu" id={listId} role="listbox" aria-label={label}>
      {groups.map(group => <div className="user-select-group" role={group.label ? 'group' : undefined} aria-label={group.label || undefined} key={group.label || group.options[0]?.value}>
        {group.label && <div className="user-select-group-label">{group.label}</div>}
        {group.options.map(option => {
          const index = flatOptions.indexOf(option);
          return <button className={`user-select-option${value === option.value ? ' is-selected' : ''}`} key={option.value} type="button" role="option" aria-selected={value === option.value} tabIndex={-1} ref={element => { optionRefs.current[index] = element; }} onKeyDown={onOptionKeyDown} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}>{option.label}{value === option.value && <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8.2 2.8 2.8 6.2-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}</button>;
        })}
      </div>)}
    </div>}
    {invalid && <span className="user-select-error" role="alert">Please choose {label.toLowerCase()}.</span>}
    {required && <input className="user-select-validation" tabIndex={-1} aria-hidden="true" type="text" name={name} value={value} onChange={() => {}} required onInvalid={event => { event.preventDefault(); setInvalid(true); setOpen(false); triggerRef.current?.focus(); }}/ >}
  </div>;
}
