// Lightweight haptic helper. Uses the standard navigator.vibrate API,
// which is the only cross-browser web haptic primitive widely supported
// (Android Chrome/Firefox/Edge; iOS Safari ignores it silently, which
// is fine — the call is best-effort and a no-op on unsupported devices).
//
// Patterns are short and meant to *augment* visual feedback, never
// replace it. Anything stronger than ~200ms total can feel obnoxious
// inside a payment flow, so we keep these conservative.

type VibratePattern = number | number[];

function safeVibrate(pattern: VibratePattern): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // some browsers throw if vibration is gated by user-activation rules
  }
}

export const haptic = {
  // Light tap — primary button presses, asset switches
  tap: () => safeVibrate(8),
  // Success — two short pulses
  success: () => safeVibrate([15, 60, 25]),
  // Warning — single longer pulse (used for partial-failure states)
  warning: () => safeVibrate(50),
  // Error — two strong pulses
  error: () => safeVibrate([60, 80, 60]),
};
