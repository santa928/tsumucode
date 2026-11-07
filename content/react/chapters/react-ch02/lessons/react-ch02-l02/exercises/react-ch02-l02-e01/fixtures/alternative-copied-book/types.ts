export interface Book {
  readonly id: string;
  readonly title: string;
  readonly read: boolean;
}

export interface BookCardProps {
  readonly book: Book;
  readonly onToggle: (id: string) => void;
}
