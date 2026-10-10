export type CatalogItem = {
  id: string;
  title: string;
  area: 'outdoor' | 'indoor';
  seats: number;
  description: string;
};

export const catalog: readonly CatalogItem[] = [
  {
    "id": "morning",
    "title": "朝の読書会",
    "area": "indoor",
    "seats": 3,
    "description": "朝の時間に本を読みます。"
  },
  {
    "id": "evening",
    "title": "夕方の読書会",
    "area": "indoor",
    "seats": 0,
    "description": "この回は受付を終了しました。"
  }
];
