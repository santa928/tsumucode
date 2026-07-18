import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** Vitest globalsを無効にしても各TestのDOMを必ず隔離する。 */
afterEach(cleanup);
