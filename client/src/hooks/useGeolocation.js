import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 30000,
};

function toPoint(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    speed: position.coords.speed,
    heading: position.coords.heading,
    timestamp: position.timestamp,
  };
}

function describeError(error) {
  switch (error?.code) {
    case 1:
      return 'Location access was denied. Please allow it in your browser settings so alerts can include where you are.';
    case 2:
      return 'Your location is unavailable right now. Try moving somewhere with a clearer view of the sky.';
    case 3:
      return 'Finding your location took too long. Please try again.';
    default:
      return 'We could not read your location.';
  }
}

export function useGeolocation({ watch = false, options = {} } = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const watchIdRef = useRef(null);

  const supported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const getPosition = useCallback(
    (overrides = {}) =>
      new Promise((resolve, reject) => {
        if (!supported) {
          const message = 'This browser cannot share your location.';
          setError(message);
          reject(new Error(message));
          return;
        }

        setLoading(true);
        navigator.geolocation.getCurrentPosition(
          (raw) => {
            const point = toPoint(raw);
            setPosition(point);
            setError(null);
            setLoading(false);
            resolve(point);
          },
          (err) => {
            const message = describeError(err);
            setError(message);
            setLoading(false);
            reject(new Error(message));
          },
          { ...DEFAULT_OPTIONS, ...options, ...overrides }
        );
      }),

    [supported]
  );

  const getPositionFast = useCallback(async () => {
    try {
      return await getPosition({
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 120000,
      });
    } catch {
      return getPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }
  }, [getPosition]);

  useEffect(() => {
    if (!watch || !supported) return undefined;

    setLoading(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (raw) => {
        setPosition(toPoint(raw));
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(describeError(err));
        setLoading(false);
      },
      { ...DEFAULT_OPTIONS, ...options }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

  }, [watch, supported]);

  return { position, error, loading, supported, getPosition, getPositionFast };
}

export default useGeolocation;
