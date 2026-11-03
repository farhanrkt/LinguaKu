import { registerSW } from 'virtual:pwa-register';

export type OfflineStatus = 'preparing' | 'ready' | 'unavailable';

/**
 * SPEC §5.4: fully functional offline after first load. The UI reports the
 * real state rather than assuming it — on a browser without service workers
 * (or a non-secure origin) we say so instead of lying.
 */
export const registerServiceWorker = (
  onStatus: (status: OfflineStatus) => void,
  /**
   * A new version is installed and waiting. `apply` swaps it in and reloads —
   * called only when the learner chooses, never in the middle of a card.
   */
  onUpdate?: (apply: () => void) => void,
): void => {
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
    // 'prompt' mode: the waiting worker is offered, not forced. Under
    // 'autoUpdate' a deploy reloaded every open page as soon as it activated,
    // and a learner mid-answer was put back on the home screen.
    onNeedRefresh: () => onUpdate?.(() => void updateSW(true)),
  });
};
