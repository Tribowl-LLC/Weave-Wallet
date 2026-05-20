import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom doesn't ship a vibration API; tests assert haptic feedback by
// spying on this stub, so install it before every test rather than per-file.
beforeEach(() => {
  Object.defineProperty(navigator, "vibrate", {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });

  // jsdom returns true for `navigator.onLine` by default; make it
  // explicit and re-stubbable so offline tests can flip it.
  Object.defineProperty(navigator, "onLine", {
    value: true,
    writable: true,
    configurable: true,
  });

  // Anchor-based file downloads use these. jsdom implements createObjectURL
  // but it returns blob URLs that the test runner can't fetch — for our
  // purposes the calls just need to not throw.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock");
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn();
  }

  // localStorage is per-window in jsdom; clear it between tests so the
  // mock Fiber client's persisted balances don't leak across cases.
  localStorage.clear();

  // exportActivity creates a transient <a> and calls .click() to trigger
  // a download. jsdom doesn't implement navigation and logs noisy
  // "Not implemented: navigation" warnings — neutralise the click so
  // tests stay clean. The download itself is verified via the Blob.
  HTMLAnchorElement.prototype.click = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
