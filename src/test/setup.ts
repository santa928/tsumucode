import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** jsdomでnative dialogを開き、実Browserと同じopen属性へ反映する。 */
function showModalShim(this: HTMLDialogElement): void {
  this.setAttribute('open', '');
}

/** jsdomでnative dialogを閉じ、実Browserと同じopen属性へ反映する。 */
function closeDialogShim(this: HTMLDialogElement): void {
  this.removeAttribute('open');
}

if (typeof HTMLDialogElement !== 'undefined') {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModalShim,
    });
  }
  if (typeof HTMLDialogElement.prototype.close !== 'function') {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: closeDialogShim,
    });
  }
}

/** Vitest globalsを無効にしても各TestのDOMを必ず隔離する。 */
afterEach(cleanup);
