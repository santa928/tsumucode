import type { SourceId } from './types';
let active = 0;
let notifications = 0;
function paint() {
  const activeNode = document.getElementById('active');
  const notificationNode = document.getElementById('notifications');
  if (activeNode) activeNode.textContent = String(active);
  if (notificationNode) notificationNode.textContent = String(notifications);
}
/** 固定の外部DOM入力に購読し、同じlistenerを外すcleanupを返す。 */
export function subscribe(target: SourceId, receive: (value: string) => void) {
  const element = document.querySelector<HTMLInputElement>('#' + target);
  if (!element) throw new Error('外部入力がありません');
  active += 1;
  paint();
  const notify = () => {
    notifications += 1;
    paint();
    receive(element.value);
  };
  element.addEventListener('input', notify);
  receive(element.value);
  return () => {
    element.removeEventListener('input', notify);
    active -= 1;
    paint();
  };
}
