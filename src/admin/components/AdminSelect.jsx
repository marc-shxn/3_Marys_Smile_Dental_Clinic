import { createPortal } from 'react-dom';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './AdminSelect.css';

/** Branded, keyboard-accessible replacement for native select controls in the admin. */
export default function AdminSelect({ value = '', options = [], onChange, label, placeholder, className = '', disabled = false, required = false, invalid = false, compact = false, floating = false }) {
  const [open, setOpen] = useState(false);
  const [floatingStyle, setFloatingStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const id = useId();
  const normalized = options.map(option => typeof option === 'object' && option !== null
    ? { value: String(option.value ?? ''), label: String(option.label ?? option.value ?? '') }
    : { value: String(option), label: String(option) });
  const selected = normalized.find(option => option.value === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = event => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onEscape = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onOutside);
    window.addEventListener('keydown', onEscape);
    (menuRef.current?.querySelector('[aria-selected="true"]') || menuRef.current?.querySelector('[role="option"]'))?.focus();
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      window.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !floating) { setFloatingStyle(null); return undefined; }
    const placeMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const edge = 8;
      const width = Math.min(Math.max(rect.width, 190), window.innerWidth - edge * 2);
      const estimatedHeight = Math.min(280, normalized.length * (compact ? 34 : 38) + 10);
      const belowSpace = Math.max(0, window.innerHeight - rect.bottom - edge - 6);
      const aboveSpace = Math.max(0, rect.top - edge - 6);
      const openAbove = belowSpace < estimatedHeight && aboveSpace > belowSpace;
      const availableSpace = openAbove ? aboveSpace : belowSpace;
      const maxHeight = Math.max(80, Math.min(280, availableSpace));
      const top = openAbove ? Math.max(edge, rect.top - Math.min(estimatedHeight, maxHeight) - 6) : Math.min(window.innerHeight - edge - 40, rect.bottom + 6);
      const left = Math.min(Math.max(edge, rect.left), window.innerWidth - width - edge);
      setFloatingStyle({ position: 'fixed', top, left, width, maxHeight, zIndex: 2000 });
    };
    placeMenu();
    window.addEventListener('resize', placeMenu);
    window.addEventListener('scroll', placeMenu, true);
    return () => {
      window.removeEventListener('resize', placeMenu);
      window.removeEventListener('scroll', placeMenu, true);
    };
  }, [open, floating, normalized.length, compact]);

  const moveFocus = (event, index) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? normalized.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + normalized.length) % normalized.length;
    menuRef.current?.querySelectorAll('[role="option"]')[next]?.focus();
  };

  return <div className={`admin-select${compact ? ' is-compact' : ''}${open ? ' is-open' : ''}${invalid ? ' is-invalid' : ''} ${className}`.trim()} ref={rootRef}>
    <button ref={triggerRef} className="admin-select-trigger" type="button" disabled={disabled} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-required={required} aria-invalid={invalid} onClick={() => setOpen(current => !current)}>
      <span className={String(value) === '' ? 'is-placeholder' : ''}>{selected?.label || placeholder || 'Choose an option'}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
    </button>
    {open && (!floating || floatingStyle) && createPortal(<div className={`admin-select-menu${floating ? ' is-floating' : ''}`} style={floating ? floatingStyle : undefined} role="listbox" aria-label={label} id={id} ref={menuRef}>
      {normalized.map((option, index) => {
        const active = option.value === String(value);
        return <button key={`${option.value}-${index}`} className={`admin-select-option${active ? ' is-selected' : ''}`} type="button" role="option" aria-selected={active} onKeyDown={event => moveFocus(event, index)} onClick={() => { onChange?.(option.value); setOpen(false); triggerRef.current?.focus(); }}>
          <span>{option.label}</span><span className="admin-select-check" aria-hidden="true">{active && option.value !== '' ? '✓' : ''}</span>
        </button>;
      })}
    </div>, floating ? document.body : rootRef.current)}
  </div>;
}
