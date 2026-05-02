import { useState, useRef, useEffect } from 'react';
import { api } from '../lib/api';

/**
 * BarcodeScanner — works with USB/Bluetooth barcode scanners AND manual entry.
 *
 * Physical scanners behave like keyboards: they type the barcode value very
 * rapidly (< 50 ms between keystrokes) and then send Enter. This component
 * detects that pattern and auto-triggers the lookup so the operator just
 * needs to point and scan — no extra button press required.
 *
 * Props:
 *   onResult(result)  — called when a barcode is successfully matched.
 *                       result = { productId, productName, barcode, batchNo,
 *                                  location, quantity, expiryDate, unitPrice }
 *   onError(msg)      — called when barcode is not found (optional)
 *   autoFocus         — focus input on mount (default true)
 *   placeholder       — input placeholder text
 *   label             — label shown above the input
 *   style / className — passed to outer wrapper
 */
export default function BarcodeScanner({
  onResult,
  onError,
  autoFocus = true,
  placeholder = 'Scan barcode or type & press Enter…',
  label,
  style,
  className,
}) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('idle'); // idle | scanning | found | notfound
  const [msg, setMsg]     = useState('');
  const inputRef          = useRef(null);
  const lastKeyAt         = useRef(0);
  const scanTimer         = useRef(null);
  const resetTimer        = useRef(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  const resetStatus = () => {
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => { setStatus('idle'); setMsg(''); }, 2500);
  };

  const lookup = async (val) => {
    const trimmed = (val || '').trim();
    if (!trimmed) return;
    setStatus('scanning');
    setMsg('Looking up…');
    try {
      const res = await api.stock.barcode(trimmed);
      if (res && res.success !== false && (res.productName || res.productId)) {
        setStatus('found');
        setMsg(`✓ ${res.productName || 'Product found'}`);
        setCode('');
        onResult(res);
      } else {
        setStatus('notfound');
        setMsg('✗ Barcode not found');
        onError?.(`Barcode not found: ${trimmed}`);
      }
    } catch (e) {
      setStatus('notfound');
      setMsg(`✗ ${e.message || 'Lookup failed'}`);
      onError?.(e.message);
    }
    resetStatus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(scanTimer.current);
      lookup(code);
      return;
    }
    if (e.key.length !== 1) return;

    const now = Date.now();
    const gap = now - lastKeyAt.current;
    lastKeyAt.current = now;

    if (gap < 50) {
      clearTimeout(scanTimer.current);
      scanTimer.current = setTimeout(() => {
        setCode(prev => { lookup(prev); return prev; });
      }, 100);
    }
  };

  const stateStyle = {
    idle:     { border: '#d1d5db', bg: '#fff',      icon: '🔲', hint: '#6b7280' },
    scanning: { border: '#3b82f6', bg: '#eff6ff',   icon: '⏳', hint: '#1d4ed8' },
    found:    { border: '#16a34a', bg: '#f0fdf4',   icon: '✅', hint: '#166534' },
    notfound: { border: '#dc2626', bg: '#fff5f5',   icon: '❌', hint: '#c41e3a' },
  };
  const s = stateStyle[status] || stateStyle.idle;

  return (
    <div className={className} style={{ ...style }}>
      {label && (
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: '1rem' }}>🔲</span> {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', pointerEvents: 'none' }}>
            {s.icon}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            style={{
              width: '100%',
              padding: '9px 38px 9px 36px',
              border: `2px solid ${s.border}`,
              borderRadius: 9,
              fontSize: '0.88rem',
              fontFamily: 'monospace',
              fontWeight: 600,
              background: s.bg,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s, background 0.2s',
              letterSpacing: '0.05em',
            }}
          />
          {code && (
            <button
              type="button"
              onClick={() => { setCode(''); inputRef.current?.focus(); }}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1rem', lineHeight: 1, padding: 2 }}
              title="Clear"
            >×</button>
          )}
        </div>
        <button
          type="button"
          onClick={() => lookup(code)}
          disabled={status === 'scanning' || !code.trim()}
          style={{
            padding: '9px 16px',
            background: code.trim() ? '#c41e3a' : '#f1f5f9',
            color: code.trim() ? '#fff' : '#9ca3af',
            border: 'none',
            borderRadius: 9,
            cursor: code.trim() ? 'pointer' : 'default',
            fontWeight: 700,
            fontSize: '0.82rem',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
        >
          Search
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 5, fontSize: '0.8rem', fontWeight: 600, color: s.hint, minHeight: 18 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
