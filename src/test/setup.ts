import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: {
    ...globalThis.crypto,
    randomUUID: () => `test-${Math.random().toString(36).slice(2)}`,
  },
});
