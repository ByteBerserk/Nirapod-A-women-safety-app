import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSos } from '../../context/SosContext';
import { Modal } from '../ui';

const HOLD_MS = 1200;

export function SosButton({ size = 'large', showLabel = true }) {
  const { activateSos, activating, hasActiveSos } = useSos();
  const navigate = useNavigate();

  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const holdStart = useRef(null);
  const frame = useRef(null);

  const stopHold = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    holdStart.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  const fire = useCallback(async () => {
    stopHold();

    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);

    const sos = await activateSos({ trigger: 'manual' });
    if (sos) navigate('/sos/active');
  }, [activateSos, navigate, stopHold]);

  const tick = useCallback(() => {
    if (holdStart.current === null) return;

    const elapsed = Date.now() - holdStart.current;
    const ratio = Math.min(1, elapsed / HOLD_MS);
    setProgress(ratio);

    if (ratio >= 1) {
      fire();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [fire]);

  const startHold = useCallback(() => {
    if (activating || hasActiveSos) return;
    holdStart.current = Date.now();
    setHolding(true);
    frame.current = requestAnimationFrame(tick);
  }, [activating, hasActiveSos, tick]);

  useEffect(() => stopHold, [stopHold]);

  if (hasActiveSos) {
    return (
      <button
        type="button"
        className={`sos-button sos-button-${size} sos-button-active`}
        onClick={() => navigate('/sos/active')}
      >
        <span className="sos-button-inner">
          <span className="sos-pulse" aria-hidden="true" />
          <span className="sos-text">LIVE</span>
        </span>
        {showLabel && <span className="sos-caption">Alert is running &mdash; tap to manage</span>}
      </button>
    );
  }

  return (
    <div className="sos-button-wrap">
      <button
        type="button"
        className={`sos-button sos-button-${size} ${holding ? 'is-holding' : ''}`}

        onPointerDown={startHold}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
            event.preventDefault();
            startHold();
          }
        }}
        onKeyUp={stopHold}
        onContextMenu={(event) => event.preventDefault()}
        disabled={activating}
        aria-label="Emergency SOS. Press and hold for about a second to alert your emergency contacts."
      >
        <span className="sos-button-inner">
          {activating ? (
            <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          ) : (
            <span className="sos-text">SOS</span>
          )}
        </span>

        {holding && (
          <svg className="sos-progress" viewBox="0 0 100 100" aria-hidden="true">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="#fff"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 46}
              strokeDashoffset={2 * Math.PI * 46 * (1 - progress)}
              transform="rotate(-90 50 50)"
            />
          </svg>
        )}
      </button>

      {showLabel && (
        <span className="sos-caption">
          {holding ? 'Keep holding...' : 'Press and hold to send an alert'}
        </span>
      )}
    </div>
  );
}

export function SosFab() {
  const { hasActiveSos } = useSos();
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  if (hasActiveSos) {
    return (
      <button
        type="button"
        className="sos-fab sos-fab-active"
        onClick={() => navigate('/sos/active')}
        aria-label="An emergency alert is running. Open it."
      >
        <span className="sos-pulse" aria-hidden="true" />
        LIVE
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="sos-fab"
        onClick={() => setExpanded(true)}
        aria-label="Open the emergency SOS panel"
      >
        SOS
      </button>

      <Modal open={expanded} onClose={() => setExpanded(false)} title="Emergency SOS" size="sm">
        <p className="small muted">
          Holding this button emails everyone on your emergency contact list with your live
          location, your blood group and your medical notes.
        </p>
        <div className="center" style={{ padding: '18px 0' }}>
          <SosButton size="large" />
        </div>
        <p className="tiny muted mb-0 center">
          In immediate danger, call your local emergency number as well.
        </p>
      </Modal>
    </>
  );
}

export default SosButton;
