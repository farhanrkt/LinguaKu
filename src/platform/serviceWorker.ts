import { registerSW } from 'virtual:pwa-register';

export type OfflineStatus = 'preparing' | 'ready' | 'unavailable';

/**
 * SPEC §5.4: fully functional offline after first load. The UI reports the
 * real state rather than assuming it — on a browser without service workers
 * (or a non-secure origin) we say so instead of lying.
 */
export const registerServiceWorker = (onStatus: (status: OfflineStatus) => void): void => {
  if (!('serviceWorker' in navigator)) {
    onStatus('unavailable');
    return;
  }

  const updateSW = registerSW({
    immediate: true,
    onOfflineReady: () => onStatus('ready'),
    onRegisteredSW: (_url, registration) => {
      if (registration?.active) onStatus('ready');
    },
    onRegisterError: () => onStatus('unavailable'),
  });

  // autoUpdate: take the new worker as soon as it is waiting. Nothing in the
  // app depends on a stable bundle across a session.
  void updateSW;
};
