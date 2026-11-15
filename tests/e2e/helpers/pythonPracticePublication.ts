/** Draft と正式掲載の期待を分け、不明な掲載状態を受け入れない。 */
export function practiceIsPublished(status: unknown): boolean {
  if (status === 'published') return true;
  if (status === 'draft') return false;
  throw new Error('Unexpected Python practice publication status');
}
