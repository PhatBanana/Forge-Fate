import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Component tests share one jsdom document per file, so anything left mounted
 * by one test is still in the tree for the next. Unmounting between them keeps
 * `getByText` from matching a stale copy of the thing you just rendered.
 *
 * This runs for the node-environment engine tests too, where there is no DOM to
 * clean and `cleanup` is a no-op - cheaper than maintaining two setup files.
 */
afterEach(() => {
  cleanup();
});
