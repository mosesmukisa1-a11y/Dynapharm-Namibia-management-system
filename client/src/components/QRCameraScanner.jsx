import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { api } from '../lib/api';

/**
 * QRCameraScanner — opens the device back camera and continuously decodes
 * QR codes. When a QR value is found it calls api.stock.barcode() to look
 * up the product and fires onResult / onError exactly like BarcodeScanner.
 *
 * Props:
 *   onResult(result)  — called when a barcode is successfully matched
 *   onError(msg)      — called when QR is read but product not found
 *   onClose()         — called when the user closes the camera view
 */
export default function QRCameraScanner({ onResult, onError, onClose }) {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);
  const rafRef     = useRef(null);
  const cooldownRef = useRef(false);

  const [status, setStatus]     = useState('starting'); // starting | scanning | found | error | notfound
  const [statusMsg, setStatusMsg] = useState('Starting camera…');
  const [lastCode, setLastCode]   = useState('');

  useEffect(() => {
    let cancelled = false;

    const startCamera = async () => {
      try {
        const constraints = {
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus('scanning');
          setStatusMsg('Point camera at a product QR code…');
          startScanning();
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setStatusMsg(err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access.'
            : 'Could not start camera. Try a different browser or device.');
        }
      }
    };

    const startScanning = () => {
      const tick = () => {
        if (cancelled) return;
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (decoded && decoded.data && !cooldownRef.current) {
          handleDecoded(decoded.data);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    startCamera();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleDecoded = async (value) => {
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setLastCode(value);
    setStatus('scanning');
    setStatusMsg(`Reading: ${value}`);

    try {
      const res = await api.stock.barcode(value.trim());
      if (res && res.success !== false && (res.productName || res.productId)) {
        setStatus('found');
        setStatusMsg(`✓ ${res.productName || 'Product found'} — added to cart`);
        onResult(res);
        setTimeout(() => {
          setStatus('scanning');
          setStatusMsg('Point camera at next QR code…');
          cooldownRef.current = false;
        }, 1800);
      } else {
        setStatus('notfound');
        setStatusMsg(`✗ No product for: ${value}`);
        onError?.(`Barcode not found: ${value}`);
        setTimeout(() => {
          setStatus('scanning');
          setStatusMsg('Point camera at a product QR code…');
          cooldownRef.current = false;
        }, 2000);
      }
    } catch (e) {
      setStatus('notfound');
      setStatusMsg(`✗ Lookup failed: ${e.message || 'unknown error'}`);
      setTimeout(() => {
        setStatus('scanning');
        setStatusMsg('Point camera at a product QR code…');
        cooldownRef.current = false;
      }, 2000);
    }
  };

  const statusColors = {
    starting:  { bar: '#3b82f6', text: '#1d4ed8' },
    scanning:  { bar: '#c41e3a', text: '#c41e3a' },
    found:     { bar: '#16a34a', text: '#166534' },
    notfound:  { bar: '#dc2626', text: '#dc2626' },
    error:     { bar: '#f59e0b', text: '#92400e' },
  };
  const sc = statusColors[status] || statusColors.scanning;

  return (
    <div style={{
      position: 'relative', background: '#000', borderRadius: 12,
      overflow: 'hidden', aspectRatio: '4/3', width: '100%', maxWidth: 420,
      margin: '0 auto', boxShadow: '0 4px 24px rgba(0,0,0,.4)',
    }}>
      {/* Live camera feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Scan reticle overlay */}
      {status === 'scanning' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 200, height: 200, position: 'relative',
          }}>
            {/* Corner brackets */}
            {[
              { top: 0,    left: 0,    borderTop: '3px solid #fff', borderLeft:  '3px solid #fff' },
              { top: 0,    right: 0,   borderTop: '3px solid #fff', borderRight: '3px solid #fff' },
              { bottom: 0, left: 0,    borderBottom: '3px solid #fff', borderLeft: '3px solid #fff' },
              { bottom: 0, right: 0,   borderBottom: '3px solid #fff', borderRight: '3px solid #fff' },
            ].map((style, i) => (
              <div key={i} style={{ position: 'absolute', width: 32, height: 32, ...style }} />
            ))}
            {/* Animated scan line */}
            <div style={{
              position: 'absolute', left: 4, right: 4, height: 2,
              background: sc.bar, opacity: 0.85,
              animation: 'qrScanLine 1.6s ease-in-out infinite',
              top: '50%',
            }} />
          </div>
        </div>
      )}

      {/* Status bar at bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'rgba(0,0,0,.72)', padding: '10px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: status === 'found' ? '#4ade80' : status === 'notfound' ? '#f87171' : '#fff', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {statusMsg}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{ flexShrink: 0, padding: '5px 14px', background: '#374151', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
        >
          Close
        </button>
      </div>

      {/* Error / no camera state */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.85)',
          padding: 24, gap: 12,
        }}>
          <div style={{ fontSize: '2.5rem' }}>📵</div>
          <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.92rem', textAlign: 'center' }}>{statusMsg}</div>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '8px 22px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      )}

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes qrScanLine {
          0%   { top: 12%; }
          50%  { top: 82%; }
          100% { top: 12%; }
        }
      `}</style>
    </div>
  );
}
