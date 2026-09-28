import { afterEach, expect, it } from 'vitest';
import { installSubmitGuard, submitDiagnostics } from './submitGuard';

afterEach(() => {
  document.body.replaceChildren();
});

/** prototype変更が他caseへ残らない独立realmを作る。 */
function fixture() {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const doc = frame.contentDocument!;
  doc.body.innerHTML = '<form><button type="submit">確認</button></form>';
  const view = doc.defaultView!;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- trusted側のnative取消をreceiver付きで再現する。
  const nativePrevent = view.Event.prototype.preventDefault;
  doc.addEventListener(
    'submit',
    (event) => {
      Reflect.apply(nativePrevent, event, []);
    },
    true,
  );
  let learner = false;
  const guard = installSubmitGuard(doc, () => learner)!;
  return {
    doc,
    view,
    guard,
    setLearner: (value: boolean) => {
      learner = value;
    },
  };
}

it('trusted取消だけでは合格せず、同じnative submitのlearner取消だけを採用する', () => {
  const { doc, guard, setLearner } = fixture();
  const button = doc.querySelector('button')!;
  guard.begin();
  button.click();
  expect(guard.end()).toBe(false);
  doc.querySelector('form')!.addEventListener('submit', (event) => {
    setLearner(true);
    event.preventDefault();
    setLearner(false);
  });
  guard.begin();
  button.click();
  expect(guard.end()).toBe(true);
  guard.begin();
  expect(guard.end()).toBe(false);
});

it('synthetic submitと過去Eventの再利用を学習者取消の証拠にしない', () => {
  const { doc, view, guard, setLearner } = fixture();
  let previous: Event | undefined;
  doc.querySelector('form')!.addEventListener('submit', (event) => {
    previous = event;
    setLearner(true);
    event.preventDefault();
    setLearner(false);
  });
  guard.begin();
  doc
    .querySelector('form')!
    .dispatchEvent(new view.Event('submit', { bubbles: true, cancelable: true }));
  expect(guard.end()).toBe(false);
  guard.begin();
  setLearner(true);
  previous!.preventDefault();
  setLearner(false);
  expect(guard.end()).toBe(false);
});

it('guard設置不能はnullで返し、未設定を正常な誤答と混同しない', () => {
  expect(installSubmitGuard(document.implementation.createHTMLDocument(), () => true)).toBeNull();
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const doc = frame.contentDocument!;
  Object.defineProperty(doc.defaultView!.Event.prototype, 'preventDefault', {
    configurable: false,
    writable: false,
  });
  expect(installSubmitGuard(doc, () => true)).toBeNull();
  expect(submitDiagnostics('setup-error')).toEqual([
    expect.objectContaining({ kind: 'system', severity: 'error' }),
  ]);
});

it('nested submitは全件の取消を要求し、1操作の観測上限を超えたら合格にしない', () => {
  const { doc, guard, setLearner } = fixture();
  const first = doc.querySelector('form')!;
  const second = doc.createElement('form');
  second.innerHTML = '<button type="submit">追加</button>';
  doc.body.append(second);
  let cancelNested = false;
  first.addEventListener('submit', (event) => {
    setLearner(true);
    event.preventDefault();
    second.querySelector('button')!.click();
    setLearner(false);
  });
  second.addEventListener('submit', (event) => {
    if (cancelNested) event.preventDefault();
  });
  guard.begin();
  first.querySelector('button')!.click();
  expect(guard.end()).toBe(false);
  cancelNested = true;
  guard.begin();
  first.querySelector('button')!.click();
  expect(guard.end()).toBe(true);
  guard.begin();
  for (let index = 0; index < 9; index += 1) first.querySelector('button')!.click();
  expect(guard.end()).toBe(false);
});
