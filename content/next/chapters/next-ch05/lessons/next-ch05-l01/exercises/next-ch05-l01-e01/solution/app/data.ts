export type CatalogItem = {
  id: string;
  title: string;
  area: 'outdoor' | 'indoor';
  seats: number;
  description: string;
};

export const catalog: readonly CatalogItem[] = [
  {
    "id": "forest",
    "title": "森の散歩",
    "area": "outdoor",
    "seats": 3,
    "description": "木陰を歩く小さな旅です。"
  },
  {
    "id": "sea",
    "title": "海の資料館",
    "area": "indoor",
    "seats": 0,
    "description": "室内で海の歴史を学びます。"
  }
];
