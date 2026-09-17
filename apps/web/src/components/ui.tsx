import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertCircle, ArrowRight, Check, LoaderCircle, X } from 'lucide-react';

export function BrandLogo({ variant = 'header', decorative = false }: { variant?: 'header' | 'mark' | 'hero' | 'receipt'; decorative?: boolean }) {
  return <span className={`brand-logo brand-logo-${variant}`}><img src="/happy-cone-logo.jpeg" alt={decorative ? '' : 'Happy Cone Ice Cream'}/></span>;
}

export function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => { const dialog = ref.current; const previous = document.activeElement as HTMLElement | null; dialog?.showModal(); return () => { dialog?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} aria-labelledby={id} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) { const bounds = ref.current.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); } }}>
    <header className="modal-head"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={id}>{title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></header>{children}
  </dialog>;
}
export function ErrorMessage({ error }: { error: string }) { return error ? <div className="error-message" role="alert"><AlertCircle size={18}/><span>{error}</span></div> : null; }
export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) { return <div className="empty-state">{icon && <div className="empty-icon">{icon}</div>}<h3>{title}</h3><p>{children}</p></div>; }
export function SubmitButton({ busy, children, disabled = false }: { busy: boolean; children: ReactNode; disabled?: boolean }) { return <button className="button primary" type="submit" disabled={busy || disabled}>{busy ? <LoaderCircle className="spin" size={18}/> : null}{children}{!busy && <ArrowRight size={18}/>}</button>; }
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'orange' | 'red' }) { return <span className={`badge ${tone}`}>{tone === 'green' && <Check size={12}/>} {children}</span>; }
let displayTimezone = 'Africa/Lusaka';
export function configureTimezone(timezone: string) { displayTimezone = timezone || 'Africa/Lusaka'; }
export function timeOf(iso: string) { return new Date(iso).toLocaleTimeString('en-GB', { timeZone: displayTimezone, hour: '2-digit', minute: '2-digit' }); }
export function dateOf(iso: string) { return new Date(iso).toLocaleDateString('en-GB', { timeZone: displayTimezone, day: 'numeric', month: 'short', year: 'numeric' }); }
export function readable(value: string) { return value.toLowerCase().replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase()); }
