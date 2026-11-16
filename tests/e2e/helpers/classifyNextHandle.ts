/** Returns only a fixed category; never returns text, markup, URL, or attributes. */
export function classifyNextHandle(element: Element): string {
  if (element.closest('article[data-course-map]')) return 'course-map';
  const card = element.closest('article[aria-labelledby="course-title-next"]');
  if (card?.closest('section[aria-labelledby="catalog-title"]')) return 'home-card';
  return 'unknown';
}
