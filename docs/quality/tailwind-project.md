# Tailwind制作課題の入力と持ち出し

Issue130は草稿Courseへ1つのguided projectを追加する。共有する値は@theme、共通の見た目はCSSの.note-card、内容と配置はHTMLが担う。既存4教材のID・原稿を保持し、追加だけの空の進捗移行を使う。新規公開はIssue131の別工程。

Issue131の作者検証で使う既存distは、[Tailwind草稿のSource照合](tailwind-draft-artifact.md)で現在のCourse原稿との対応を確認する。

## 入力の責務

`theme-project-v1`を明示したTailwind Runtimeだけがindex.htmlとstyles.cssを受け付ける。導入4教材はRuntime省略のまま、既存の1ファイル制約を維持する。

- HTMLは従来の要素・属性・容量・class数の制約を共有する。headの固定stylesheet参照と文字コード・viewportだけを追加する。
- CSSは4 KiB以下。固定のtailwindcss取込1件、3token、components層の.note-cardと有限@applyを扱う。外部参照・追加の取込・config/plugin/source・任意selector等はcompiler取得前に拒否する。
- 色は6桁の#hex、spacing-cardは0〜64pxで小数2桁まで。値を誤っても対応範囲内なら描画へ進め、学習上の正しさをRuleで判定する。
- 入力検証とcompiler用class制限は同じprofile別許可集合を使う。.note-cardの使用数と実Styleを組み合わせ、個別Utilityの複製を再利用の達成としない。

共通sanitizerは変更しない。元RunnerInputを各renderのcallbackへ渡し、検証済みCSSだけを別typeのstyleへ組み込む。constructorの共有変数へSourceを保持しない。通常CSSとしては二重注入せず、終了タグをraw text用にescapeする。

固定browser compiler 4.3.2はtailwindcss取込を内部の仮想stylesheetへ解決する。Tailwind adapterは完全検証済みの固定importに対する除去警告だけを結果から除く。他のsecurity診断を残し、CSP、opaque iframe、nonce、認証、取消、旧Preview復旧、sentinel readyとSnapshotの状態分離を共有する。

## 持ち出しの責務

既存PortableSourceExportのクリック時snapshot・再クリック抑止・離脱後download抑止と、fflate/downloadArchiveを使う。対応する2ソースをUTF-8の原文で格納し、固定manifest・実lockfile・Vite設定・READMEを加える。余分なFileや未対応classは格納しない。保存・採点・進捗APIを呼ばず、途中の対応Sourceも持ち出せる。

包装の原稿はportable/tailwind-project内の通常ファイルをraw importする。手書き設定をJSON文字列へ複製しない。サイト本体の依存を増やさず、外部用のVite 8.2.0、Tailwind CSS/Plugin 4.3.2、Node 24.18.0を固定する。

外部buildの検証は、実際のZIPを別フォルダーへ展開し、同梱lockfileによる依存取得とproduction buildを行った生成物を対象にする。依存取得の通信とinstall工程をREADMEへ記載する。表示中は生成CSSを使い、Play CDNやbrowser compilerを同梱しない。テーマ変更・共通class・代表幅・Tabの輪郭と、サイト側の下書き・進捗が保持されることを確認する。

サイトの完了判定はHTML/CSSの条件を確認する。外部buildの実行結果をサイトの合格表示に含めず、持ち出し先で確認する活動として説明する。

## 継続検証

関連するPRとmain変更では、課題専用workflowが既存Dockerfileのbrowser imageを使い、制作を3ブラウザー、既存下書きのrevision移行をChromiumで検証する。単一workerで実行し、失敗時の画面・判定とcgroup計測をArtifactへ残す。公開jobやworkflow dispatchは含めない。
