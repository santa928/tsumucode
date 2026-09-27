import { afterEach, describe, expect, it, vi } from 'vitest';
import { installCurrentTargetGuard } from './currentTargetGuard';

afterEach(() => {
  document.body.replaceChildren();
});

/** non-configurableな保護を各テスト専用のDOM realmへ限定する。 */
function createDocument(): Document {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const target = frame.contentDocument;
  if (target === null) throw new Error('Missing test document');
  return target;
}

describe('native currentTarget guard', () => {
  it('子targetと登録Elementを区別し、未接続Elementとdispatch後nullを維持する', () => {
    const target = createDocument();
    const denied = vi.fn();
    expect(installCurrentTargetGuard(target, denied)).toBe(true);
    target.body.innerHTML = '<button><span>子</span></button>';
    const button = target.querySelector('button')!;
    const child = target.querySelector('span')!;
    let saved: Event | undefined;
    button.addEventListener('click', function (event) {
      saved = event;
      expect(event.target).toBe(child);
      expect(event.currentTarget).toBe(button);
      expect(this).toBe(button);
    });
    child.click();
    expect(saved?.currentTarget).toBeNull();
    const detached = target.createElement('button');
    const listener = vi.fn((event: Event) => {
      expect(event.currentTarget).toBe(detached);
    });
    detached.addEventListener('click', listener);
    detached.click();
    expect(listener).toHaveBeenCalledOnce();
    expect(denied).not.toHaveBeenCalled();
  });

  it('Document listenerのtarget使用は維持し、currentTarget取得をcatchしても通知する', () => {
    const target = createDocument();
    const denied = vi.fn();
    expect(installCurrentTargetGuard(target, denied)).toBe(true);
    const button = target.createElement('button');
    target.body.append(button);
    const listener = vi.fn((event: Event) => {
      expect(event.target).toBe(button);
      expect(() => event.currentTarget).toThrow(/unsupported/u);
    });
    target.addEventListener('click', listener);
    button.click();
    expect(listener).toHaveBeenCalledOnce();
    expect(denied).toHaveBeenCalledOnce();
    target.removeEventListener('click', listener);
    button.click();
    expect(denied).toHaveBeenCalledOnce();
  });

  it('保護getterを上書きできず、設置不能なrealmではfalseを返す', () => {
    const target = createDocument();
    const view = target.defaultView!;
    expect(installCurrentTargetGuard(target, vi.fn())).toBe(true);
    expect(() =>
      Object.defineProperty(view.Event.prototype, 'currentTarget', { value: view }),
    ).toThrow();
    expect(installCurrentTargetGuard(target, vi.fn())).toBe(false);
  });
});
