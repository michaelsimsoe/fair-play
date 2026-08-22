import type { ClockSource } from "../clock";

export const browserClockSource: ClockSource = {
  monotonicNowMs: () => performance.now(),
  wallNowMs: () => Date.now(),
};
