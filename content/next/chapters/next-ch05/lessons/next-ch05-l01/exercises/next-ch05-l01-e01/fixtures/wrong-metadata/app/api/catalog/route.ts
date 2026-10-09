import { catalog } from '../../data';

/** 編集対象のpageから同じ隔離内で読む固定JSON。DBや外部APIは使わない。 */
export function GET(): Response {
  return Response.json(catalog);
}
