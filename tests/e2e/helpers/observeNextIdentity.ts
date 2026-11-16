/** Test-only observation: absence of a marker does not prove absence of a change. */
export function observeNextIdentity(before: string): () => void {
  let active = false;
  let card: Element | null = null;
  let guide: Element | null = null;
  let batches = 0;
  const emitted = new Set<string>();
  const emit = (marker: string) => {
    if (!emitted.has(marker)) {
      emitted.add(marker);
      console.info(`[next-identity] ${marker}`);
    }
  };
  const current = (): [Element | null, Element | null] => {
    const currentCard = document.getElementById('course-title-next')?.closest('article') ?? null;
    if (!currentCard) return [null, null];
    const walker = document.createTreeWalker(currentCard, NodeFilter.SHOW_ELEMENT);
    for (let index = 0; index < 128; index += 1) {
      const node = walker.nextNode();
      if (!node) return [currentCard, null];
      const element = node as Element;
      if (
        element.tagName === 'DD' &&
        element.childNodes.length === 1 &&
        element.firstChild?.nodeType === Node.TEXT_NODE &&
        element.firstChild.nodeValue === before
      )
        return [currentCard, element];
    }
    emit('node-budget-exhausted');
    return [currentCard, null];
  };
  const capture = () => {
    const [nextCard, nextGuide] = current();
    if (card && nextCard && card !== nextCard) emit('card-identity-changed-at-delivery');
    if (guide && nextGuide && guide !== nextGuide) emit('guide-identity-changed-at-delivery');
    if (nextCard) card = nextCard;
    if (nextGuide) guide = nextGuide;
  };
  const inspect = (records: readonly MutationRecord[]) => {
    if (!active || !records.length) return;
    batches += 1;
    if (batches > 128) {
      emit('observation-budget-exhausted');
      active = false;
      return;
    }
    let inspected = 0;
    for (const record of records) {
      inspected += 1;
      if (inspected > 128) {
        emit('removal-budget-exhausted');
        active = false;
        return;
      }
      for (const removed of record.removedNodes) {
        inspected += 1;
        if (inspected > 128) {
          emit('removal-budget-exhausted');
          active = false;
          return;
        }
        if (card && removed.contains(card)) emit('subtree-contains-card-at-delivery');
        if (guide && removed.contains(guide)) emit('subtree-contains-guide-at-delivery');
      }
    }
    capture();
  };
  const observer = new MutationObserver(inspect);
  const start = () => {
    observer.takeRecords();
    emitted.clear();
    card = null;
    guide = null;
    batches = 0;
    active = true;
    capture();
  };
  const stop = () => {
    inspect(observer.takeRecords());
    active = false;
    card = null;
    guide = null;
  };
  window.addEventListener('tsumucode-next-observe-start', start);
  window.addEventListener('tsumucode-next-observe-stop', stop);
  observer.observe(document, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    window.removeEventListener('tsumucode-next-observe-start', start);
    window.removeEventListener('tsumucode-next-observe-stop', stop);
  };
}
