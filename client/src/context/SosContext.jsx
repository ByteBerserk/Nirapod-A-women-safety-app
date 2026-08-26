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

/** How often a live alert reports its position (FR-3). */
const TRACKING_INTERVAL_MS = 10000;
/** The longest an SOS will wait for a location fix before going out without one. */
const FIX_DEADLINE_MS = 4000;
/** How often idle geofences are evaluated (FR-20). Much less often - battery. */
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
  /*
   * Points that could not be sent because the connection dropped. They are
   * replayed on the next successful tick, so a tunnel does not create a hole in
   * the trail the contacts are watching (NFR-3).
   */
  const pendingPoints = useRef([]);
  const activeSosRef = useRef(null);
  activeSosRef.current = activeSos;

  /* ------------------------------------------------- restore on page load --- */

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
          // The tracking token is only ever returned once, at activation, so a
          // reload cannot recover the shareable URL - only the alert itself.
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  /*
   * An SOS can start without this browser asking for it.
   *
   * A missed safety check-in escalates on the server (FR-26), so the first this
   * tab hears of it is the socket. Without picking that up, `activeSos` stays
   * null: no banner, and - the part that matters - the ten-second ticker below
   * never starts, so the tracking link the contacts just received shows a
   * position frozen at wherever the check-in began.
   */
  useSocketEvent('checkin:escalated', () => {
    sosApi
      .getActive()
      .then((data) => setActiveSos(data?.sos || null))
      .catch(() => {});
  });

  /* ------------------------------------------------------ FR-3: live trail --- */

  const pushLocation = useCallback(async () => {
    const sos = activeSosRef.current;
    if (!sos) return;

    try {
      const point = await getPosition({ enableHighAccuracy: true, maximumAge: 5000 });

      const queue = [...pendingPoints.current, point];
      pendingPoints.current = [];

      for (const entry of queue) {
        /* eslint-disable no-await-in-loop */
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
      // Hold the point and try again next tick, unless the alert is simply
      // over - in which case there is nothing to retry.
      if (error?.code === 'SOS_NOT_ACTIVE') {
        setActiveSos(null);
        return;
      }
      if (error?.isNetworkError) {
        // Cap the buffer: a phone offline for an hour should not hold 360
        // points and then flood the server on reconnect.
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

  /* ------------------------------------------------------ FR-20: geofences --- */

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const check = async () => {
      // Skip while an alert is running - the SOS ticker is already reporting
      // position far more often, and doubling up wastes battery.
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
        // Location denied, or offline. Nothing worth interrupting the user for.
      }
    };

    // A short initial delay keeps the permission prompt away from page load,
    // where it is most likely to be dismissed reflexively.
    const startup = setTimeout(check, 8000);
    geofenceTimer.current = setInterval(check, GEOFENCE_INTERVAL_MS);

    return () => {
      clearTimeout(startup);
      if (geofenceTimer.current) {
        clearInterval(geofenceTimer.current);
        geofenceTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  /* ---------------------------------------------------------- FR-4: fire --- */

  const activateSos = useCallback(
    async ({ message = '', trigger = 'manual' } = {}) => {
      if (activating) return null;
      setActivating(true);

      try {
        /*
         * A failed fix must never swallow the alert.
         *
         * This used to stop here and show an error, which meant a phone with
         * location switched off, or indoors with no signal, could not call for
         * help at all - the people who needed to know heard nothing. The alert
         * now goes out regardless and simply says the location is unknown; the
         * trail starts the moment the ten-second ticker gets a fix.
         */
        let point = null;
        try {
          point = await Promise.race([
            getPositionFast(),
            /*
             * A hard deadline on the whole attempt. getPositionFast falls back
             * from a cached fix to a precise one, which can add up to twenty
             * seconds on a device struggling for signal - far outside the five
             * seconds NFR-1 allows an alert. Whatever has not arrived by now is
             * not worth waiting for: the ten-second ticker below will send the
             * position as soon as the device produces one.
             */
            new Promise((resolve) => setTimeout(resolve, FIX_DEADLINE_MS, null)),
          ]);
        } catch {
          // Reported through the server's own reply below, so the user is told
          // once rather than twice.
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
