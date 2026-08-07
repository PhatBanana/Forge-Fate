// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The update path, which is the whole risk of caching an app.
 *
 * Getting "works offline" right is easy: cache everything, serve it back. What
 * is not easy is that the same code, slightly wrong, serves last month's rules
 * tables forever with no way for a reader to tell. So these tests are about
 * *when* a new version takes over, not about caching.
 *
 * The browser's own service worker machinery is stubbed rather than mocked
 * through a library, because what is being asserted is a sequence of events -
 * `updatefound`, then `statechange` to `installed`, then `controllerchange` -
 * and a stub that emits them in order is clearer than a mock that pretends to.
 */

/** A worker that can be told to change state. */
class FakeWorker extends EventTarget {
  state = 'installing';
  posted: unknown[] = [];
  postMessage(message: unknown) {
    this.posted.push(message);
  }
  becomes(state: string) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  /** An update arriving: a new worker installs while the old one serves. */
  updateFound(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event('updatefound'));
    return worker;
  }
}

function stubServiceWorker({ controlled }: { controlled: boolean }) {
  const registration = new FakeRegistration();
  const container = new EventTarget() as EventTarget & {
    controller: object | null;
    register: (url: string, options?: object) => Promise<FakeRegistration>;
  };
  container.controller = controlled ? {} : null;
  container.register = vi.fn(() => Promise.resolve(registration));
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  });
  return { registration, container };
}

/** Re-imported per test, because the module holds the waiting worker. */
async function load() {
  vi.resetModules();
  return import('./serviceWorker');
}

const reload = vi.fn();

beforeEach(() => {
  reload.mockClear();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload, href: 'https://example.test/repo/' },
    configurable: true,
  });
  document.head.innerHTML = '<base href="https://example.test/repo/">';
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('registering', () => {
  it('registers sw.js beside the page, not at the domain root', async () => {
    // GitHub Pages serves this from /<repo>/, so an absolute '/sw.js' would
    // register a worker whose scope does not cover the app - and fail quietly.
    const { container } = stubServiceWorker({ controlled: false });
    const { registerServiceWorker } = await load();
    registerServiceWorker({ onWaiting: () => {} });
    await Promise.resolve();

    expect(container.register).toHaveBeenCalledWith('https://example.test/repo/sw.js', {
      scope: 'https://example.test/repo/',
    });
  });

  it('does nothing at all where service workers are unavailable', async () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    const { registerServiceWorker } = await load();
    expect(() => registerServiceWorker({ onWaiting: () => {} })).not.toThrow();
  });

  it('swallows a registration that is refused', async () => {
    // Insecure origins, some private windows, and enterprise policy all refuse.
    // Offline is an enhancement; there is nothing to report.
    const { container } = stubServiceWorker({ controlled: false });
    container.register = vi.fn(() => Promise.reject(new Error('denied')));
    const onWaiting = vi.fn();
    const { registerServiceWorker } = await load();
    registerServiceWorker({ onWaiting });
    await Promise.resolve();
    await Promise.resolve();
    expect(onWaiting).not.toHaveBeenCalled();
  });
});

describe('noticing a new version', () => {
  it('says nothing on a first install', async () => {
    // Nobody arriving for the first time wants to be told there is "a new
    // version" of the thing they have never seen.
    const { registration } = stubServiceWorker({ controlled: false });
    const onWaiting = vi.fn();
    const { registerServiceWorker } = await load();
    registerServiceWorker({ onWaiting });
    await Promise.resolve();

    const worker = registration.updateFound(new FakeWorker());
    worker.becomes('installed');
    expect(onWaiting).not.toHaveBeenCalled();
  });

  it('announces one that installed while an old version was serving', async () => {
    const { registration } = stubServiceWorker({ controlled: true });
    const onWaiting = vi.fn();
    const { registerServiceWorker } = await load();
    registerServiceWorker({ onWaiting });
    await Promise.resolve();

    const worker = registration.updateFound(new FakeWorker());
    expect(onWaiting).not.toHaveBeenCalled(); // still installing
    worker.becomes('installed');
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });

  it('finds one that was already waiting when the page loaded', async () => {
    // Somebody refreshed while an update was mid-install last time. There is
    // no `updatefound` to hear, so the current state has to be read.
    const { registration } = stubServiceWorker({ controlled: true });
    registration.waiting = new FakeWorker();
    const onWaiting = vi.fn();
    const { registerServiceWorker } = await load();
    registerServiceWorker({ onWaiting });
    await Promise.resolve();
    expect(onWaiting).toHaveBeenCalledTimes(1);
  });
});

describe('taking the new version', () => {
  it('asks the waiting worker to activate, and waits before reloading', async () => {
    const { registration, container } = stubServiceWorker({ controlled: true });
    const { registerServiceWorker, applyUpdate } = await load();
    registerServiceWorker({ onWaiting: () => {} });
    await Promise.resolve();
    const worker = registration.updateFound(new FakeWorker());
    worker.becomes('installed');

    applyUpdate();
    expect(worker.posted).toEqual(['skip-waiting']);
    /*
      Not yet. Reloading here would race the swap and can serve the *old*
      assets back - an update that appears to fail, which is worse than none,
      because the reader stops pressing the button.
    */
    expect(reload).not.toHaveBeenCalled();

    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once, however many times control changes', async () => {
    const { registration, container } = stubServiceWorker({ controlled: true });
    const { registerServiceWorker, applyUpdate } = await load();
    registerServiceWorker({ onWaiting: () => {} });
    await Promise.resolve();
    registration.updateFound(new FakeWorker()).becomes('installed');

    applyUpdate();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('falls back to a plain reload with nothing waiting', async () => {
    stubServiceWorker({ controlled: true });
    const { applyUpdate } = await load();
    applyUpdate();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
