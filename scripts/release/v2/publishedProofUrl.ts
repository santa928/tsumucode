/** Accept the actual page only when its normalized origin and path match the configured site. */
export function publishedProofUrl(pageUrl: string, baseUrl: string | undefined): string {
  try {
    if (typeof baseUrl !== 'string') throw new Error();
    const base = new URL(baseUrl),
      page = new URL(pageUrl);
    const cleanBase = new URL(base.href);
    cleanBase.search = '';
    cleanBase.hash = '';
    if (
      (base.protocol !== 'https:' && base.protocol !== 'http:') ||
      base.username !== '' ||
      base.password !== '' ||
      base.href !== cleanBase.href
    )
      throw new Error();
    page.hash = '';
    page.search = '';
    if (page.href !== cleanBase.href) throw new Error();
    return cleanBase.href;
  } catch {
    throw new Error('Public operation page URL is invalid');
  }
}
