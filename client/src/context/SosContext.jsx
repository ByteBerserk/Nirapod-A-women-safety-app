import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sosApi, placeApi } from '../api/endpoints';
import { useAuth } from './AuthContext';
import { useSocketEvent } from './SocketContext';
import { useToast } from './ToastContext';
import useGeolocation from '../hooks/useGeolocation';

const SosContext = createContext(null);

const TRACKING_INTERVAL_MS = 10000;

const FIX_DEADLINE_MS = 4000;

const GEOFENCE_INTERVAL_MS = 120000;

export function SosProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const { getPositionFast, getPosition } = useGeolocation();

  const [activeSos, setActiveSos] = useState(null);
  const [trackingUrl, setTrackingUrl] = useState(null);
  const [activating, setActivating] = useState(false);

  const trackingTimer = useRef(null);
  const geofenceTimer = useRef(null);

  const pendingPoints = useRef([]);
  const activeSosRef = useRef(null);
  activeSosRef.current = activeSos;

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveSos(null);
      setTrackingUrl(null);
      return;
    }

    let cancelled = false;
    sosApi
      .getActive()
      .then((data) => {
        if (!cancelled && data?.sos) {
          setActiveSos(data.sos);

        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useSocketEvent('checkin:escalated', () => {
    sosApi
      .getActive()
      .then((data) => setActiveSos(data?.sos || null))
      .catch(() => {});
  });

  const pushLocation = useCallback(async () => {
    const sos = activeSosRef.current;
    if (!sos) return;

    try {
      const point = await getPosition({ enableHighAccuracy: true, maximumAge: 5000 });

      const queue = [...pendingPoints.current, point];
      pendingPoints.current = [];

      for (const entry of queue) {

        await sosApi.updateLocation(sos.id, {
          lat: entry.lat,
          lng: entry.lng,
          accuracy: entry.accuracy,
          speed: entry.speed,
          recordedAt: new Date(entry.timestamp).toISOString(),
        });
      }

      setActiveSos((current) =>
        current
          ? { ...current, currentLocation: { lat: point.lat, lng: point.lng, accuracy: point.accuracy } }
          : current
      );
    } catch (error) {

      if (error?.code === 'SOS_NOT_ACTIVE') {
        setActiveSos(null);
        return;
      }
      if (error?.isNetworkError) {

        pendingPoints.current = pendingPoints.current.slice(-20);
      }
    }
  }, [getPosition]);

  useEffect(() => {
    if (!activeSos || activeSos.status !== 'active') {
      if (trackingTimer.current) {
        clearInterval(trackingTimer.current);
        trackingTimer.current = null;
      }
      pendingPoints.current = [];
      return undefined;
    }

    pushLocation();
    trackingTimer.current = setInterval(pushLocation, TRACKING_INTERVAL_MS);

    return () => {
      if (trackingTimer.current) {
        clearInterval(trackingTimer.current);
        trackingTimer.current = null;
      }
    };
  }, [activeSos?.id, activeSos?.status, pushLocation]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const check = async () => {

      if (activeSosRef.current) return;

      try {
        const point = await getPosition({ enableHighAccuracy: false, maximumAge: 60000 });
        const result = await placeApi.checkLocation({
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
        });

        for (const transition of result?.transitions || []) {
          toast.info(
            transition.event === 'enter'
              ? `You have arrived at ${transition.placeLabel}.`
              : `You have left ${transition.placeLabel}.`
          );
        }
      } catch {

      }
    };

    const startup = setTimeout(check, 8000);
    geofenceTimer.current = setInterval(check, GEOFENCE_INTERVAL_MS);

    return () => {
      clearTimeout(startup);
      if (geofenceTimer.current) {
        clearInterval(geofenceTimer.current);
        geofenceTimer.current = null;
      }
    };

  }, [isAuthenticated]);

  const activateSos = useCallback(
    async ({ message = '', trigger = 'manual' } = {}) => {
      if (activating) return null;
      setActivating(true);

      try {

        let point = null;
        try {
          point = await Promise.race([
            getPositionFast(),

            new Promise((resolve) => setTimeout(resolve, FIX_DEADLINE_MS, null)),
          ]);
        } catch {

        }

        const response = await sosApi.activate({
          ...(point ? { lat: point.lat, lng: point.lng, accuracy: point.accuracy } : {}),
          message,
          trigger,
        });

        const data = response.data;
        setActiveSos(data.sos);
        if (data.trackingUrl) setTrackingUrl(data.trackingUrl);

        if (data.contactCount === 0 || !point) {
          toast.warning(response.message, { duration: 0 });
        } else {
          toast.success(response.message);
        }

        return data.sos;
      } catch (error) {
        toast.error(error.message || 'The alert could not be sent. Please try again.');
        return null;
      } finally {
        setActivating(false);
      }
    },
    [activating, getPositionFast, toast]
  );

  const resolveSos = useCallback(
    async ({ note = '', cancelled = false } = {}) => {
      const sos = activeSosRef.current;
      if (!sos) return null;

      try {
        const response = await sosApi.resolve(sos.id, { note, cancelled });
        setActiveSos(null);
        setTrackingUrl(null);
        pendingPoints.current = [];
        toast.success(response.message);
        return response.data?.sos || null;
      } catch (error) {
        toast.error(error.message || 'We could not close the alert. Please try again.');
        return null;
      }
    },
    [toast]
  );

  const value = useMemo(
    () => ({
      activeSos,
      trackingUrl,
      activating,
      hasActiveSos: Boolean(activeSos && activeSos.status === 'active'),
      activateSos,
      resolveSos,
      refreshActive: () =>
        sosApi
          .getActive()
          .then((data) => {
            setActiveSos(data?.sos || null);
            return data?.sos || null;
          })
          .catch(() => null),
    }),
    [activeSos, trackingUrl, activating, activateSos, resolveSos]
  );

  return <SosContext.Provider value={value}>{children}</SosContext.Provider>;
}

export function useSos() {
  const context = useContext(SosContext);
  if (!context) throw new Error('useSos must be used inside a SosProvider.');
  return context;
}
