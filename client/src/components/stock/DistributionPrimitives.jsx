import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { statusDisplay } from './distributionModel';

export function StatusBadge({ status }) {
  const { label, tone } = statusDisplay(status);
  return <span className={`sp-status ${tone ? `sp-status-${tone}` : ''}`}>{label}</span>;
}
export function Pagination({ page, pageSize, total, onChange, label }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="sp-pagination">
    <span aria-live="polite">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} ${label}` : `0 ${label}`}</span>
    <div className="sp-pagination-actions">
      <button type="button" className="sp-btn sp-btn-icon" aria-label={`Previous ${label} page`} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15} /></button>
      <span>Page {page} of {pages}</span>
      <button type="button" className="sp-btn sp-btn-icon" aria-label={`Next ${label} page`} disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={15} /></button>
    </div>
  </div>;
}
export function Skeleton({ label }) {
  return <div role="status" aria-label={label} style={{ padding: '8px 0 16px' }}>{[1, 2, 3, 4, 5].map(key => <div key={key} className="sp-skeleton" />)}<span className="sr-only">{label}</span></div>;
}
export function Overlay({ title, children, footer, onClose, drawer = false, busy = false }) {
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = event => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const nodes = dialog.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]');
      if (!nodes?.length) { event.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus?.(); };
  }, []);
  return <div className={`sp-overlay ${drawer ? 'sp-overlay-drawer' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} className={`sp-dialog ${drawer ? 'sp-drawer' : ''}`}>
      <div className="sp-panel-head"><h2>{title}</h2><button className="sp-btn sp-btn-icon" type="button" disabled={busy} onClick={onClose} aria-label={`Close ${title}`}><X size={18} /></button></div>
      {children}
      {footer && <div className="sp-dialog-footer">{footer}</div>}
    </section>
  </div>;
}
