# React Componentの作者用Starter検証（Issue #12）

TypeScriptからReactへつなぐ少量の技術準備。Course全体の順序・Runtime契約の承認や、完成CourseのPath追加は行わない。React/React DOMを実Browserで描画し、NodeでDOMを代用しない。使うのはリポジトリに固定済みのReact/React DOM/型定義/TypeScript/Viteだけで、新規依存・外部CDNを加えない。

## 要件台帳と差分

| ID          | 区分 | 受入条件                                                                                                                  |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| REQ-RCP-001 | 維持 | TypeScriptを前提に、Component/JSX/PropsをNext.js固有機能から分離する。                                                    |
| REQ-RCP-002 | 追加 | 固定Starter/SolutionのTSXを実Compilerで非emit型検査し、成功した原稿だけ実React/React DOMを含むBrowser bundleへbuildする。 |
| REQ-RCP-003 | 追加 | 誤ったProp型と必須フィールド不足を診断位置・codeまで観察し、失敗した原稿をbuildしない。                                   |
| REQ-RCP-004 | 維持 | 学習者の任意sourceを開発Composeで実行しない。作者の固定原稿だけを専用tmpへ展開する。                                      |
| REQ-RCP-005 | 維持 | 通常Course/Catalog/Path・管理UI・保存・隔離Runtime・既存公開Gateを変更しない。                                            |

保留・削除はない。Reactの既存16Topic（Component、JSX、Props、Composition、Event、State、List、Key、Form、State配置、lifting state up、Reducer、Context、Ref、Effect/cleanup、Custom Hook）と、不要なEffectを避ける条件を維持する。今回これら全部を教材化したとは扱わない。TS/JSの学習前提と正式公開の整合、人による初心者/実機/正式受入も維持する。

## 小さい原稿と見た目

データ`Question`を受け取る`QuestionCard`が、問題文と2つの選択肢を表示する。Starterは仮の文、Solutionは「HTMLが受け持つものは？」と「内容」「見た目」。interfaceの形が通ることと、React Componentが実DOMへ描画されることを別に確認する。

世界観は積み木学習工房の問題カード。主役は文と選択肢で、見出し・一覧・作者用の表示範囲を素の意味的HTMLで示す。独自画像・装飾や回答できそうな偽ボタンを置かない。カードは内容に応じた高さと余白を持たせ、右端・下端とDocument横幅を実Browserで確認する。表示専用で、回答/State/判定の実装済みとは案内しない。

作者のBriefは「TSのQuestionが画面の問題カードになるまで」。Component/JSXを定義し、データをPropsとして渡し、型の誤りと描画を比較する。`createRoot`の起動コードと配列の表示は作者の足場であり、初学者へ未説明の構文を全部一度に要求しない。通常Lesson化する前に小さいSlide/課題の分割と独立レビューを行う。

## 実行方法と証拠範囲

プロジェクトDockerで `npm exec tsx scripts/content/probeReactComponentPilot.ts /evidence/react-component-pilot` を実行する。`/evidence`は検証時だけtmpへmountする。固定原稿・型定義を用いる非emit型検査の後、成功2原稿を実Viteでbuildする。型Error2原稿ではbuildせず、診断のfile/line/column/codeを照合する。作業は新しい専用tmpを作り、既存の学習sourceや他のartifactを上書きしない。

この作者previewは通常Courseでも管理UIでもなく、任意学習者コード用の隔離環境ではない。実Browserで表示できても、管理token/Cookie境界、学習用サーバーの起動/停止・revision・保存、Error boundary、HMR/PTY、Next.jsの常駐Projectの受入を満たしたとは扱わない。それらは#12/#25 B/#14の別契約に残す。

リスクは「型検査だけでReactが動いた」「Viteの変換だけで型が通った」「作者previewを安全なlearner sandbox」と誤解すること。型検査→成功原稿のbuild→実Browser DOM表示を区別し、未知のsourceを受理しない。製品Worker上限、Home/Path/Slideの配信予算、既存Gateは変えない。固定の小原稿だけで検証し、全Course×全Browserや重いRelease検査を新規に広げない。

公式資料は[Component](https://react.dev/learn/your-first-component)、[TypeScriptとReact](https://react.dev/learn/typescript)、[createRoot](https://react.dev/reference/react-dom/client/createRoot)を参照した。公式サイトは現行版を示すため、実験versionはリポジトリのlockと実際のインストール値で記録する。資料の例をそのまま教材へ転載しない。

- [x] 受入/非対象/リスク対策/既存性能目標を維持する範囲を定義。
- [x] 固定Compiler/実build/実Browserの結果を確認。
- [ ] 最新HEAD独立Proレビューと必要CI。
- [ ] 通常Lesson/安全Runtime/人の受入/React Course全体/Next.js常駐Project。

## 初回の技術観察（2026-10-01）

プロジェクトDockerの実インストールはNode 24.18.0 / TypeScript 6.0.3 / React・React DOM 19.2.7 / Vite 8.2.0 / React plugin 6.0.3 / React型19.2.17・DOM型19.2.3。固定4原稿のうちStarter/Solutionは型診断0でbuild成功、wrong-propは`main.tsx:5:3 / TS2322`、missing-propは`main.tsx:4:7 / TS2741`で停止し、後者2原稿にはdist/emit JSを作っていない。

実Chromium 149.0.7827.0、1280×800で成功2原稿を別々にHTTP配信した。配信indexを各distと全文一致させ、初期HTMLの空rootからReactが生成した見出し/選択肢/個数を実DOMで照合。作者用の表示専用案内が見え、回答用controlはなく、page/console Errorと外部origin通信は0。両原稿ともDocument幅1280、カード右端976/下端359.703125、子の左右/上下がカード内。Starter/Solutionの2画像を目視した。これは作者原稿2件の表示確認であり、学習者の自由入力、State/Event/採点/保存、全React Courseや人の理解の証拠には広げない。

型検査/対象ESLint/Prettierは成功。製品入力を変更していないため既存製品の全Browser/Visual/性能/Lighthouseを今回再実行せず、公開前の既存Gateへ残す。最新HEAD独立Proレビュー・必要CI・人の受入は別に追跡する。
