/** Test-only observation. Unseen and within-batch changes are unknown. */
export function observeNextGuide(before: string): () => void {
  const emitted = new Set<string>();
  let active = false;
  let card: Element | null = null;
  let guide: Element | null = null;
  let batches = 0;
  const emit = (category: string) => {
    const width = innerWidth === 1280 ? 'desktop' : innerWidth === 390 ? 'mobile' : 'unknown';
    const route = location.hash === '#/' ? 'home' : 'other';
    const marker = `[next-guide-observation] ${category} ${width} ${route}`;
    if (emitted.has(marker)) return;
    emitted.add(marker);
    console.info(marker);
  };
  const capture = () => {
    if (card && !card.isConnected) emit('card-detached');
    if (guide && !guide.isConnected) emit('guide-detached');
    const currentCard = document.getElementById('course-title-next')?.closest('article') ?? null;
    if (currentCard) emit('card-seen');
    let currentGuide: Element | null = null;
    if (currentCard) {
      const walker = document.createTreeWalker(currentCard, NodeFilter.SHOW_ELEMENT);
      for (let index = 0; index < 128; index += 1) {
        const node = walker.nextNode();
        if (!node) break;
        const element = node as Element;
        if (
          element.tagName === 'DD' &&
          element.childNodes.length === 1 &&
          element.firstChild?.nodeType === Node.TEXT_NODE &&
          element.firstChild.nodeValue === before
        ) {
          currentGuide = element;
          break;
        }
        if (index === 127) emit('node-budget-exhausted');
      }
    }
    if (currentGuide) emit('guide-seen');
    card = currentCard;
    guide = currentGuide;
  };
  const observer = new MutationObserver(() => {
    if (!active) return;
    batches += 1;
    if (batches > 128) {
      emit('observation-budget-exhausted');
      active = false;
      return;
    }
    capture();
  });
  const start = () => {
    observer.takeRecords();
    emitted.clear();
    card = null;
    guide = null;
    batches = 0;
    active = true;
    emit('scope-start');
    capture();
  };
  const stop = () => {
    if (active && observer.takeRecords().length > 0) capture();
    if (active) emit('scope-stop');
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

/** An unavailable observer must not replace the original browser action. */
export async function startNextGuideObservation(start: () => Promise<unknown>): Promise<void> {
  try {
    await start();
  } catch {
    console.info('[next-guide-observation] unavailable');
  }
}
