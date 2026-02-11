import { afterEach, expect, beforeAll } from "bun:test";

// Only import React testing utilities if available
let cleanup: (() => void) | undefined;
try {
  const testingLibrary = await import("@testing-library/react");
  cleanup = testingLibrary.cleanup;
} catch {
  // @testing-library/react not needed for all tests
}

// Only extend with matchers if available
try {
  const matchers = await import("@testing-library/jest-dom/matchers");
  expect.extend(matchers);
} catch {
  // jest-dom matchers not needed for all tests
}

// Only register happy-dom for browser-like tests
try {
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
  beforeAll(() => {
    GlobalRegistrator.register();

    if (typeof document !== 'undefined' && !document.body) {
      document.body = document.createElement('body');
    }
  });
} catch {
  // happy-dom not needed for all tests
}

afterEach(() => {
  if (cleanup) {
    cleanup();
  }
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
