/**
 * Platform / install-capability helpers for the install prompt (DAN-41).
 *
 * `beforeinstallprompt` is only fired by Chromium-based browsers
 * (Android Chrome, desktop Chrome/Edge). iOS Safari never fires it, so we fall
 * back to manual "Add to Home Screen" instructions there.
 */

export const isIOS = (userAgent?: string): boolean => {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  return /iPad|iPhone|iPod/.test(ua);
};
