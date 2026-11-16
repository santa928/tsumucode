export interface Question {
  readonly text: string;
  readonly choices: readonly string[];
  readonly correctId: string;
}
export interface QuizState {
  readonly index: number;
  readonly score: number;
  readonly answered: boolean;
}
export interface QuestionCardProps {
  readonly question: Question;
  readonly answered: boolean;
  readonly onAnswer: (choice: string) => void;
}
