const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;

function ensureGlobalResizeObserver() {
  if (typeof globalThis.ResizeObserver !== 'undefined') return;

  class ResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      const entry = {
        target,
        contentRect: {
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
          top: 0,
          left: 0,
          right: DEFAULT_WIDTH,
          bottom: DEFAULT_HEIGHT,
          x: 0,
          y: 0,
          toJSON() {
            return this;
          }
        }
      } as ResizeObserverEntry;

      this.callback([entry], this as unknown as ResizeObserver);
    }

    unobserve() {
      return undefined;
    }

    disconnect() {
      return undefined;
    }
  }

  globalThis.ResizeObserver = ResizeObserver;
}

function ensureElementSizing() {
  if (typeof HTMLElement === 'undefined') return;

  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return DEFAULT_WIDTH;
    }
  });

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return DEFAULT_HEIGHT;
    }
  });

  if (!HTMLElement.prototype.getBoundingClientRect) {
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        top: 0,
        left: 0,
        right: DEFAULT_WIDTH,
        bottom: DEFAULT_HEIGHT,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        }
      } as DOMRect;
    };
  }
}

ensureGlobalResizeObserver();
ensureElementSizing();
