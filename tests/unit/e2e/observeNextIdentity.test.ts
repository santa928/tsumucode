// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { observeNextIdentity } from '../../e2e/helpers/observeNextIdentity';

function makeCard(): HTMLElement {
  const card = document.createElement('article');
  const heading = document.createElement('h3');
  heading.id = 'course-title-next';
  const guide = document.createElement('dd');
  guide.textContent = 'synthetic-private-input';
  card.append(heading, guide);
  return card;
}

it('reports the tracked subtree at delivery without emitting text', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const wrapper = document.createElement('section');
  wrapper.append(makeCard());
  document.body.append(wrapper);
  const disconnect = observeNextIdentity('synthetic-private-input');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    wrapper.remove();
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toContainEqual(['[next-identity] subtree-contains-card-at-delivery']);
    expect(log.mock.calls).toContainEqual(['[next-identity] subtree-contains-guide-at-delivery']);
    expect(log.mock.calls.flat().join(' ')).not.toContain('synthetic-private-input');
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});

it('reports identity replacement when the tracked card is replaced in a batch', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const card = makeCard();
  document.body.append(card);
  const disconnect = observeNextIdentity('synthetic-private-input');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    card.replaceWith(makeCard());
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toContainEqual(['[next-identity] card-identity-changed-at-delivery']);
    expect(log.mock.calls).toContainEqual(['[next-identity] guide-identity-changed-at-delivery']);
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});

it('detects replacement delivered after a separate removal batch', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const card = makeCard();
  document.body.append(card);
  const disconnect = observeNextIdentity('synthetic-private-input');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    card.remove();
    await Promise.resolve();
    document.body.append(makeCard());
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toContainEqual(['[next-identity] card-identity-changed-at-delivery']);
    expect(log.mock.calls).toContainEqual(['[next-identity] guide-identity-changed-at-delivery']);
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});

it('does not claim tracked removal or identity change for an unrelated removal', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const other = document.createElement('div');
  document.body.append(makeCard(), other);
  const disconnect = observeNextIdentity('synthetic-private-input');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    other.remove();
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toEqual([]);
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});

it('keeps unseen target changes unknown instead of claiming a removal', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const disconnect = observeNextIdentity('synthetic-private-input');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    const other = document.createElement('div');
    document.body.append(other);
    other.remove();
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toEqual([]);
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});

it('reports exhausted removal budget instead of scanning an unbounded batch', () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const disconnect = observeNextIdentity('synthetic-private-input');
  try {
    window.dispatchEvent(new Event('tsumucode-next-observe-start'));
    for (let index = 0; index < 130; index += 1) {
      document.body.append(document.createElement('div'));
    }
    window.dispatchEvent(new Event('tsumucode-next-observe-stop'));
    expect(log.mock.calls).toContainEqual(['[next-identity] removal-budget-exhausted']);
  } finally {
    disconnect();
    log.mockRestore();
    document.body.replaceChildren();
  }
});
