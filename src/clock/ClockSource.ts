/** Inject this boundary so timing logic never reads browser globals directly. */
export interface ClockSource {
  monotonicNowMs(): number;
  wallNowMs(): number;
}
