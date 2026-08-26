import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../api/client';
import { metaApi, groupApi, notificationApi } from '../api/endpoints';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

/**
 * Realtime, with a polling fallback.
 *
 * Normally a socket. The server advertises whether its gateway is running via
 * /api/meta -> capabilities.realtime, and this provider either opens a socket
 * or, when the answer is no or /api/meta cannot be reached at all, falls back
 * to polling rather than sitting there reconnecting to nothing.
 *
 * Both paths deliver the *same events* to the same `subscribe()` API, so no
 * screen in the application knows or cares which one is active.
 */

/* Polling intervals. Chat is the only one a person watches in real time. */
const POLL_MESSAGES_MS = 4000;
const POLL_LOCATIONS_MS = 15000;
const POLL_NOTIFICATIONS_MS = 20000;

export function SocketProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  /** null until /api/meta answers, then true or false. */
  const [realtime, setRealtime] = useState(null);

  /*
   * Local subscriber registry. The socket path could use socket.on directly,
   * but routing both paths through one registry means `subscribe` behaves
   * identically whichever transport is live.
   */
  const listenersRef = useRef(new Map());

  const dispatch = useCallback((event, payload) => {
    const handlers = listenersRef.current.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch {
        /* one bad handler must not stop the others */
      }
    });
  }, []);

  const subscribe = useCallback((event, handler) => {
    const map = listenersRef.current;
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(handler);

    return () => {
      const handlers = map.get(event);
      if (!handlers) return;
      handlers.delete(handler);
      if (!handlers.size) map.delete(event);
    };
  }, []);

  /* ------------------------------------------------------ capability probe --- */

  useEffect(() => {
    let cancelled = false;

    metaApi
      .get()
      .then((data) => {
        if (!cancelled) setRealtime(Boolean(data?.capabilities?.realtime));
      })
      .catch(() => {
        // If /api/meta cannot be reached, assume no realtime and poll. Polling
        // works everywhere; a socket does not.
        if (!cancelled) setRealtime(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------- socket --- */

  useEffect(() => {
    if (!isAuthenticated || realtime !== true) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return undefined;
    }

    // Same origin as the page: Vite proxies /socket.io in development and the
    // API serves the client in production, so no URL is needed.
    const socket = io({
      auth: { token: getAccessToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    // Every server event is forwarded into the shared registry.
    socket.onAny((event, payload) => dispatch(event, payload));

    // On every reconnection attempt, hand over whatever token is current -
    // the old one may have been rotated while we were offline.
    socket.io.on('reconnect_attempt', () => {
      socket.auth = { token: getAccessToken() };
    });

    socketRef.current = socket;

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [isAuthenticated, user?.id, realtime, dispatch]);

  /* ------------------------------------------------------------ polling --- */

  /* Groups the user currently has open, driven by the group:join/leave emits. */
  const joinedGroupsRef = useRef(new Set());
  /* Ids already delivered, so a poll only reports what is genuinely new. */
  const seenRef = useRef({ messages: new Set(), notifications: new Set() });

  useEffect(() => {
    if (!isAuthenticated || realtime !== false) return undefined;

    let stopped = false;
    const seen = seenRef.current;

    /*
     * Notifications are primed on the first pass: the handler raises a toast,
     * and replaying the unread backlog would fire one per notification the
     * moment the app loads.
     */
    let notificationsPrimed = false;

    /*
     * Messages are deliberately not primed. The chat screen loads its own
     * backlog on mount and ignores any id it already holds, so re-sending one
     * costs nothing - whereas priming would swallow anything that arrived in
     * the gap between that load and the first poll. `seen` still stops the
     * same message being dispatched twice.
     */
    async function pollMessages() {
      for (const groupId of joinedGroupsRef.current) {
        try {
          /* eslint-disable no-await-in-loop */
          const result = await groupApi.messages(groupId, { limit: 30 });

          for (const message of result?.data?.messages || []) {
            if (seen.messages.has(message.id)) continue;
            seen.messages.add(message.id);
            dispatch('group:message', { ...message, groupId });
          }
        } catch {
          /* a failed poll is retried on the next tick */
        }
      }
    }

    async function pollLocations() {
      for (const groupId of joinedGroupsRef.current) {
        try {
          /* eslint-disable no-await-in-loop */
          const data = await groupApi.locations(groupId);
          for (const entry of data?.locations || []) {
            dispatch('group:location', { ...entry, groupId });
          }
        } catch {
          /* ignored */
        }
      }
    }

    async function pollNotifications() {
      try {
        const result = await notificationApi.list({ limit: 15 });
        const items = result?.data?.notifications || [];

        // Oldest first, so a burst arrives in the order it was created.
        for (const notification of [...items].reverse()) {
          if (seen.notifications.has(notification.id)) continue;
          seen.notifications.add(notification.id);
          if (notificationsPrimed && !notification.isRead) {
            dispatch('notification:new', notification);
          }
        }
        notificationsPrimed = true;
      } catch {
        /* ignored */
      }
    }

    // Run once straight away rather than waiting a full interval, which also
    // primes the notification set before the first toast could be raised.
    pollMessages();
    pollNotifications();

    const timers = [
      setInterval(() => !stopped && pollMessages(), POLL_MESSAGES_MS),
      setInterval(() => !stopped && pollLocations(), POLL_LOCATIONS_MS),
      setInterval(() => !stopped && pollNotifications(), POLL_NOTIFICATIONS_MS),
    ];

    // Polling is "connected" in the sense the UI cares about: updates arrive.
    setConnected(true);

    return () => {
      stopped = true;
      timers.forEach(clearInterval);
      setConnected(false);
      seen.messages.clear();
      seen.notifications.clear();
    };
  }, [isAuthenticated, user?.id, realtime, dispatch]);

  /* -------------------------------------------------------------- emit --- */

  const emit = useCallback(
    (event, payload, ack) => {
      if (socketRef.current) {
        socketRef.current.emit(event, payload, ack);
        return;
      }

      /*
       * Polling equivalents. Joining a group starts polling it; leaving stops.
       * Typing indicators have no polling equivalent and are dropped - they are
       * cosmetic, and faking them would be worse than their absence.
       */
      if (event === 'group:join' && payload?.groupId) {
        joinedGroupsRef.current.add(payload.groupId);
      } else if (event === 'group:leave' && payload?.groupId) {
        joinedGroupsRef.current.delete(payload.groupId);
      }
    },
    []
  );

  const value = useMemo(
    () => ({
      connected,
      /** "socket" or "polling" - shown in the connection indicator. */
      transport: realtime === false ? 'polling' : 'socket',
      subscribe,
      emit,
      socket: socketRef,
    }),
    [connected, realtime, subscribe, emit]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used inside a SocketProvider.');
  return context;
}

/** Convenience: subscribe to one event for the lifetime of a component. */
export function useSocketEvent(event, handler, deps = []) {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    // The ref indirection keeps the subscription stable even when the caller
    // passes an inline arrow function, which would otherwise resubscribe on
    // every render.
    return subscribe(event, (...args) => handlerRef.current?.(...args));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, event, ...deps]);
}
