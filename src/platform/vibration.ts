export function vibrateForChange(enabled: boolean): boolean {
  if (!enabled || typeof navigator.vibrate !== "function") return false;
  return navigator.vibrate([160, 80, 160]);
}
