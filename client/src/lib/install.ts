// Home-screen install support. Chrome/Android fire `beforeinstallprompt` once,
// usually right after load, so main.tsx starts listening before React mounts
// and the event is kept here (in memory only) until the member taps Install.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function listenForInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we offer our own Install button instead of the mini-infobar
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

export function canPromptInstall() {
  return deferredPrompt !== null;
}

export function onInstallPromptChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall() {
  if (!deferredPrompt) return;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  await prompt.userChoice;
  listeners.forEach((l) => l());
}

export function isRunningAsApp() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isPhoneOrTablet() {
  return isIOS() || /Android|Mobi/i.test(navigator.userAgent);
}

// Closing the install banner is remembered per device for 30 days in a
// __Host- cookie (browser storage isn't allowed in this app; see theme.tsx).
const BANNER_COOKIE = "__Host-install-banner";
const THIRTY_DAYS_S = 60 * 60 * 24 * 30;

export function installBannerDismissed() {
  return /(?:^|;\s*)__Host-install-banner=dismissed/.test(document.cookie);
}

export function dismissInstallBanner() {
  document.cookie = `${BANNER_COOKIE}=dismissed; Path=/; Secure; SameSite=Lax; Max-Age=${THIRTY_DAYS_S}`;
}

export function isIOS() {
  // iPadOS reports itself as a Mac, so also check for touch.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
}
