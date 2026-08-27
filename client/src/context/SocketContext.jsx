import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken } from '../api/client';
import { metaApi, groupApi, notificationApi } from '../api/endpoints';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

const POLL_MESSAGES_MS = 4000;
const POLL_LOCATIONS_MS = 15000;
const POLL_NOTIFICATIONS_MS = 20000;

export function SocketProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  const [realtime, setRealtime] = useState(null);

  const listenersRef = useRef(new Map());

  const dispatch = useCallback((event, payload) => {
    const handlers = listenersRef.current.get(event);
    if (!handlers) return;
    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch {

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

  useEffect(() => {
    let cancelled = false;

    metaApi
      .get()
      .then((data) => {
        if (!cancelled) setRealtime(Boolean(data?.capabilities?.realtime));
      })
      .catch(() => {

        if (!cancelled) setRealtime(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || realtime !== true) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return undefined;
    }

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

    socket.onAny((event, payload) => dispatch(event, payload));

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

  const joinedGroupsRef = useRef(new Set());

  const seenRef = useRef({ messages: new Set(), notifications: new Set() });

  useEffect(() => {
    if (!isAuthenticated || realtime !== false) return undefined;

    let stopped = false;
    const seen = seenRef.current;

    let notificationsPrimed = false;

    async function pollMessages() {
      for (const groupId of joinedGroupsRef.current) {
        try {

          const result = await groupApi.messages(groupId, { limit: 30 });

          for (const message of result?.data?.messages || []) {
            if (seen.messages.has(message.id)) continue;
            seen.messages.add(message.id);
            dispatch('group:message', { ...message, groupId });
          }
        } catch {

        }
      }
    }

    async function pollLocations() {
      for (const groupId of joinedGroupsRef.current) {
        try {

          const data = await groupApi.locations(groupId);
          for (const entry of data?.locations || []) {
            dispatch('group:location', { ...entry, groupId });
          }
        } catch {

        }
      }
    }

    async function pollNotifications() {
      try {
        const result = await notificationApi.list({ limit: 15 });
        const items = result?.data?.notifications || [];

        for (const notification of [...items].reverse()) {
          if (seen.notifications.has(notification.id)) continue;
          seen.notifications.add(notification.id);
          if (notificationsPrimed && !notification.isRead) {
            dispatch('notification:new', notification);
          }
        }
        notificationsPrimed = true;
      } catch {

      }
    }

    pollMessages();
    pollNotifications();

    const timers = [
      setInterval(() => !stopped && pollMessages(), POLL_MESSAGES_MS),
      setInterval(() => !stopped && pollLocations(), POLL_LOCATIONS_MS),
      setInterval(() => !stopped && pollNotifications(), POLL_NOTIFICATIONS_MS),
    ];

    setConnected(true);

    return () => {
      stopped = true;
      timers.forEach(clearInterval);
      setConnected(false);
      seen.messages.clear();
      seen.notifications.clear();
    };
  }, [isAuthenticated, user?.id, realtime, dispatch]);

  const emit = useCallback(
    (event, payload, ack) => {
      if (socketRef.current) {
        socketRef.current.emit(event, payload, ack);
        return;
      }

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

export function useSocketEvent(event, handler, deps = []) {
  const { subscribe } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {

    return subscribe(event, (...args) => handlerRef.current?.(...args));

  }, [subscribe, event, ...deps]);
}
