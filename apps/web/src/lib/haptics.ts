export function triggerHaptic(pattern: number | number[] = 10) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
    return;
  }

  navigator.vibrate(pattern);
}

export function triggerLightHaptic() {
  triggerHaptic(12);
}

export function triggerSuccessHaptic() {
  triggerHaptic([10, 40, 18]);
}
