# Function変換・Closure・wrapsの草稿契約

Issue150は既存OOP草稿へ2 Lesson・2 Exercise・8 Slide・想定50分を追加する。Course全体は7 Lesson・7 Exercise・27 Slide・想定175分。Functionとスコープを前提にし、Issue149の全体完了をこの2単元の学習条件にはしない。引数付きdecoratorとProjectは151、正式受入と公開は152に残す。

1単元目はFunction objectを渡しFunctionを返す変換、明示適用と単一の@記法、位置引数・名前付き引数・戻り値・例外の中継を比較する。Closureとnonlocalを小さい別例から説明し、同じwrapperの状態は継続し、別の装飾Functionの状態は独立することを確認する。回数は元のFunctionを呼ぶ前に増やすため、例外でも増えた状態は残る。

2単元目はmetadataを失うwrapperとfunctools.wrapsを比較する。名前・docstring・元のFunctionへの参照を実観測し、metadataの修復を実動作の保証へ読み替えない。元を呼ばない固定値・return欠落・引数欠落・例外の握り潰しを負例とし、妥当な別名・途中値・加算順・明示適用とwrapsのimport別表現を正例にする。

## 対応範囲と実行境界

既存CPython 3.14.2／Pyodide 314.0.7とSource bytes・revision/session・停止／回収・保存／Resetを再利用する。新しいRuntime・依存・権限・ネットワークは追加しない。新2 profileだけが限定した入れ子Function・nonlocal・可変引数・metadata読取りとfunctools.wrapsを扱い、既存20 profileの対応構文・packetを広げない。

ASTは1,000 node・module本体40文・定数値上限を持ち、許可構文を確認してから限定事実を判定する。解析内で学習コードを実行せず、ASTを隔離の代替としない。starterの観察行は固定する。Functionの変換・中継・Closureの構造と、同じSourceの実stdoutをANDで採点する。任意のPython表現を受け付けるとは説明しない。作者の直接Function観測や解答原稿は提出ごとの採点へ持ち込まない。

未対応は非採点、構文エラーと実行時エラーは既存のcode-error経路を保つ。wrapsのない2単元目のstarterは元への参照を持たず、説明どおりAttributeErrorになる。実エラーを未達や成功へ置き換えない。

## 完了の証拠

両engineの正負Fixture・Function／Closure／例外identity／metadataの作者観測と全8 Slide例、製品CPython解析wrapperも検証する。通常両Runtime画面で新2課題の判定・実エラー・保存全文・旧成功版・Reload・Reset・未対応時の履歴保持を確認する。PC／390pxの8図を画像で確認し、Keyboard／a11yと代表別Browserも確認する。関連Unit・型・Lint・8 Course compile・build／chunk・内容hash台帳・3独立最終treeレビューと正確HEAD／merge SHAの両初回CIを記録する。

Courseはdraftを保ち、Home／Pathへの公開追加はしない。Issue147の実人・物理端末・性能受入と新Pages公開は未完のまま維持する。自動検証とAI内容レビューを実人の理解や正式公開の受入へ拡張しない。
