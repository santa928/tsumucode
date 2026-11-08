/** 公開コースの入口で、前提・支援段階・扱わない範囲を短く伝える。 */
export interface CourseGuide {
  readonly before: string;
  readonly practice: string;
  readonly outside: string;
}

const guides: Readonly<Record<string, CourseGuide>> = {
  'html-css': {
    before: 'プログラミングの経験は必要ありません。',
    practice: '説明と小さい修正から始め、手順付きの制作、仕様に沿う制作へ進みます。',
    outside: 'ページの動きを作るJavaScriptや、サーバーへの公開手順は扱いません。',
  },
  tailwind: {
    before: 'HTMLでクラス名（class）を付け、CSSで余白を付けたり横に並べたりする基本を使います。',
    practice:
      'CSSの指定を短いクラス名（ユーティリティ）に置き換える練習から始めます。操作や画面の幅で見た目を切り替え、最後は手順に沿って2枚の読書カードの見た目を揃えます。',
    outside: 'JavaScriptで画面の処理を書くことや、作ったサイトの公開手順は扱いません。',
  },
  javascript: {
    before: 'HTMLとCSSで、文章・見た目・入力欄を作る基礎を使います。',
    practice: '結果を予想し、小さい修正から、複数の処理をつなぐクイズ制作へ進みます。',
    outside: 'TypeScriptの型、React、サーバー側のアプリ制作は扱いません。',
  },
  'python-basics': {
    before: 'プログラミングが初めてでも、値と変数から始められます。',
    practice:
      '用意されたコードの結果を予想して直すところから始めます。複数の値をまとめるリスト（List）を作って合計し、関数を書き、返された値（戻り値）を次の計算に使います。最後は手順に沿って、別ファイルの関数を使う小さなプログラムを作ります。',
    outside: 'Webアプリ制作、外部パッケージの追加、端末のファイル操作は扱いません。',
  },
  typescript: {
    before: 'JavaScriptの変数・関数・配列と、画面の要素を操作する基礎を使います。',
    practice: '型の指定と絞り込みを小さく確かめ、同じクイズを段階的に型安全化する制作へ進みます。',
    outside:
      '複雑な型パズルや、サーバー側のアプリ制作は扱いません。型が通ることと動作の正しさを分けます。',
  },
  react: {
    before:
      'TypeScriptの型の形（interface）・関数・読み取り専用の配列と、JavaScriptの画面操作を使います。',
    practice: '小さい修正を重ね、手順付きのクイズ制作から、別の仕様に沿うクイズ制作へ進みます。',
    outside:
      'HTTPによるサーバー処理や画面URLの切り替えはNext.js側で学びます。修了だけで実務能力を保証しません。',
  },
  next: {
    before: 'Reactの部品・Props・Stateを使います。コード実習にはPCのLocal Docker環境が必要です。',
    practice:
      '用意されたサーバーの小さい修正から、データ取得・送信、仕様に沿う制作とSourceの持ち出しへ進みます。',
    outside: '本番サーバーへの配備、データベースや認証基盤の構築は扱いません。',
  },
};

export function courseGuide(courseId: string): CourseGuide | undefined {
  return guides[courseId];
}
