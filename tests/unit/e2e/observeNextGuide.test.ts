// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { observeNextGuide, startNextGuideObservation } from '../../e2e/helpers/observeNextGuide';

it('keeps the next action available and never logs an observer error', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    const action = vi.fn();
    await startNextGuideObservation(() => Promise.reject(new Error('nonpublic-error')));
    action();
    expect(action).toHaveBeenCalledOnce();
    expect(log.mock.calls).toEqual([['[next-guide-observation] unavailable']]);
  } finally {
    log.mockRestore();
  }
});

function cardWithGuide(): HTMLElement {
  const card = document.createElement('article');
  const heading = document.createElement('h3');
  heading.id = 'course-title-next';
  const guide = document.createElement('dd');
  guide.textContent = 'synthetic-learner-input';
  card.append(heading, guide);
  return card;
}

it('reports fixed categories within each viewport scope, not normal route transitions', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const originalWidth = innerWidth;
  const originalUrl = location.href;
  const disconnect = observeNextGuide('synthetic-learner-input');
  try {
    history.replaceState(null, '', '#/');
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    const desktop = cardWithGuide();
    document.body.append(desktop);
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    desktop.querySelector('dd')!.remove();
    await Promise.resolve();
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    history.replaceState(null, '', '#/courses/next');
    desktop.remove();
    await Promise.resolve();
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    history.replaceState(null, '', '#/');
    const mobile = cardWithGuide();
    document.body.append(mobile);
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    mobile.remove();
    await Promise.resolve();
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toEqual([
      ['[next-guide-observation] scope-start desktop home'],
      ['[next-guide-observation] card-seen desktop home'],
      ['[next-guide-observation] guide-seen desktop home'],
      ['[next-guide-observation] guide-detached desktop home'],
      ['[next-guide-observation] scope-stop desktop home'],
      ['[next-guide-observation] scope-start mobile home'],
      ['[next-guide-observation] card-seen mobile home'],
      ['[next-guide-observation] guide-seen mobile home'],
      ['[next-guide-observation] card-detached mobile home'],
      ['[next-guide-observation] guide-detached mobile home'],
      ['[next-guide-observation] scope-stop mobile home'],
    ]);
  } finally {
    disconnect();
    log.mockRestore();
    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
    history.replaceState(null, '', originalUrl);
    document.body.replaceChildren();
  }
});

it('leaves unseen or within-batch changes unknown', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const disconnect = observeNextGuide('synthetic-learner-input');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    const card = cardWithGuide();
    document.body.append(card);
    card.remove();
    await Promise.resolve();
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toEqual([
      ['[next-guide-observation] scope-start unknown other'],
      ['[next-guide-observation] scope-stop unknown other'],
    ]);
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});

it('stops observing after a fixed number of mutation batches', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const disconnect = observeNextGuide('absent');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    for (let index = 0; index < 130; index += 1) {
      document.body.append(document.createElement('div'));
      await Promise.resolve();
    }
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toEqual([
      ['[next-guide-observation] scope-start unknown other'],
      ['[next-guide-observation] observation-budget-exhausted unknown other'],
    ]);
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});
