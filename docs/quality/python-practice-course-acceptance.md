# Python実践Courseの公開前技術受入（Issue #147）

対象は`python-practice`の3Chapter・5Lesson・11Slide・標準4演習・Guided Project1件、95分の草稿です。Python基礎のList・for・Function・例外を前提に、反復の状態とResource終了処理をデータ集計へ結びます。実行基盤を増やさず、固定CPython 3.14.2とPyodide 314.0.7を使います。

今回の差分は7Slideのコード例への静的説明図、既存`code-preview`への分類、revision `2026-10-13.1`、対象読書検査とこの受入記録です。`publicationStatus: draft`を維持し、Home／Python Path追加、Pages公開、Browser対話入力、任意pip、外部DBは含めません。#147は公開後の条件が満たされるまでOpenです。

## 概念・教材順・Projectの対応

| 概念                  | 初出Slide    | 確認する行動                                                  | Projectとの対応                                                                |
| --------------------- | ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 内包表記              | ch01-l01-s01 | 変換する式と残す条件を分け、0と空Listを説明する               | Listの一括変換と遅延生成の違いを学ぶ前提。Projectへ内包表記を強制しない        |
| Iterator              | ch01-l02-s01 | 同じIteratorの消費位置と、新しく作ったIteratorを区別する      | streamとGeneratorを反復で消費する。明示的なnextの使用は要求しない              |
| Generator             | ch01-l03-s01 | 作成／next／yieldでの中断／枯渇／listによる全消費を区別する   | read_recordsのyieldをsumが最後まで消費する                                     |
| Context manager／with | ch02-l01-s01 | StringIOの正常・例外終了でcloseし、終了後の利用不能を確認する | 行を読むstreamの終了処理。途中で保持したGeneratorの即時closeは保証しない       |
| Type hint             | ch03-l01-s01 | 注釈付きfieldへ文字列を渡せることを確認する                   | RecordとFunctionの注釈を、実行時の値検証と分ける                               |
| dataclass             | ch03-l01-s01 | 最小Class／Instance／attributeと、生成された初期化を説明する  | labelとamountを持つ1件をまとめる。method binding／decorator一般論は#17へ委ねる |
| 値検証                | ch03-l01-s02 | int変換の失敗と、if／raiseによる負値拒否を区別する            | 不正文字列・負値をValueErrorとして拒否する                                     |
| Test                  | ch03-l01-s03 | 正常・不正・空データと固定期待値を比較する                    | assert失敗／未捕捉の実行エラー／未採点を別の結果として扱う                     |

各Lessonは説明→コード例と静的図→予測→修正課題→振り返りの順です。図はコードを読み解くための独自SVGであり、画面では「静的な図」と表示します。実行結果の代用品ではありません。既存の概念coverage検査は最初の書換え前に`code-preview`を要求し、そのLayoutはCodeとVisual各1件以上を要求します。今回見つかった8概念の不足を7Slideの図と分類で修正し、検査条件は変更していません。

Guided Projectはch01-l03とch02-l01を前提にします。dataclassに必要なClass／Instance／attributeはこのCourse内で導入し、#17との循環依存を作りません。全概念のAPIをProjectへ列挙して使わせる条件にはしません。

## 再利用する実行・保存の証拠

統合元は[#144／PR201](https://github.com/santa928/tsumucode/pull/201)、[#145／PR202](https://github.com/santa928/tsumucode/pull/202)、[#146／PR203](https://github.com/santa928/tsumucode/pull/203)です。各最終HEAD／merge SHAの必要CIと独立レビューを完了しています。今回の基準mainは`1f13de3cebe1c565e26a96a2288f6d1a1811366f`です。

| 範囲                | 両実Engineの作者Fixture | 直接観測と通常UIの確認                                                                                                                                |
| ------------------- | ----------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| #144の3Lesson       |                  各28件 | 実Iteratorの同一性・消費・再生成、GeneratorのCREATED／SUSPENDED／CLOSED、空と全消費。通常UIの正負判定・保存／Reset／JSON／他Course非混入              |
| #145のwith Lesson   |                  各14件 | 実StringIOの正常・例外close／終了後利用拒否／空／再close。通常UIの停止・再実行、revision移行、保存／Reset／JSON                                       |
| #146のデータProject |                  各16件 | 実dataclass fields／生成init／注釈非強制／明示validation／4種のstream close。通常UIの正負判定、停止、移行／保存／Reset／JSON、Preview／Keyboard／axe0 |

作者の実object観測と、学習者の提出に対する固定構造・実stdoutの採点を分けます。提出ごとにGeneratorやdataclassの内部objectを直接観測する採点ではありません。同じstdoutのhardcode／Test削除／役割の違うSourceを不合格として確認済みです。

再利用条件は演習Source／Fixture／解析helper／実行器／固定依存／資源・期限の一致です。今回の7Slide・図・Course revisionの変更を、旧読書画像の成功へ読み替えません。新しい読書とrevision移行は今回確認します。新revisionへの移行は既存の空steps方式で、教材／Workspace ID、Source、履歴、成功Snapshotを保持します。

Chromiumで全正負Fixture、Firefox／WebKitでは既存の非root／traceなし構成による代表成功・反例を確認済みです。過去の作者側OOM／timeoutは私有原本に保持し、成功した同入力の範囲を再利用します。今回の変更による製品OOM修正や、物理端末での性能保証は主張しません。

## 今回の追加検証と再現

開発・検証は固定済み依存とBrowserを持つDocker内で行います。Browser buildは`BASE_PATH=/tsumucode/`を指定します。新しい受入検査は通常の全Course検査と分け、Reactの専用設定も`react-*.spec.ts`だけを選ぶようにして相互混入を防ぎます。

```sh
npm run content:compile
npm exec -- tsx scripts/content/reportConceptCoverage.ts content/python-practice
npm exec -- tsx scripts/content/checkProvenance.ts content/python-practice
npm run build:app
npm run smoke:subpath
npm run smoke:learning-chunks
npm exec -- tsx scripts/release/checkStaticArtifact.ts dist --course-id python-basics
npm exec -- playwright test --config=tests/acceptance/python-practice.config.ts
```

読書検査はPC／390pxで全11Slideを開き、図の実読込、axe、横overflow、本文末尾とPagerへの到達を確認します。Home／既存Python Pathに草稿が追加されないこと、Home／Path／読書でPython coreの取得が0であることも確認します。subpath buildと静的import graphは既存のHome初期JS 250 KiB上限・遅延読込境界を維持します。静的Artifact検査は既存`python-basics`契約を入口として、生成物全体の不許可file、authoring Fixture／Solution、core／license／source offerを確認します。この検査を`python-practice`専用公開Gateの承認とは扱いません。

2026-10-13に次を確認しました。

- 7Course compile、対象型／Lint／整形、概念coverage complete。provenanceは110files／110items。現5Lessonの内容台帳はreviewed5／stale0／rejected0です。
- 拡大した最終7図のsubpath build、CSS inline、subpath smoke、learning chunk isolation、静的Artifact507files検査が成功しました。図のlabel／titleは28px、説明は26pxの2行で、390pxの実表示でも読めるようにしました。
- PC／390pxで全11Slideの読書検査2件がretry0で成功（7.4／6.7秒）。図の実読込、axe違反0、横overflowなし、本文末尾／Pager到達、Home／Path非掲載、Python core取得0を確認。Iterator／with／dataclassの両幅6画像を作者と独立UIレビューが直接確認しました。
- 旧revision `2026-10-12.2`から最新`2026-10-13.1`までの移行とデータProjectの保存／reload／Reset／JSON移送は、実Browser UIで1件成功（31.4秒）。旧ContextとProjectを実gradeし、Source／履歴／成功Snapshotの保持を照合しました。図だけの拡大後も保存・実行・revisionの入力は同じで、この成功を再利用しています。
- 旧revision `2026-10-12.1`から最新revisionへのContext移行と保存／Reset／JSON移送も、修正後の実Browser UIで1件成功（25.7秒、retry0）。最新期待をauthoringから読み、旧Source／履歴／成功Snapshot保持を引き続き照合しました。
- Reactの限定読書収集は6件／1React fileだけを選び、新Python検査を除外しました。Unit収集もacceptanceを除外します。全React受入の再実行ではありません。

作者のNode imageにBrowserがない初回起動失敗と、Gitを要求する全React収集の失敗は原本に保持しています。固定Browser imageとGit不要の限定収集で必要範囲を確認し、失敗を成功へ読み替えていません。生ログ・スクリーンショット・学習データは公開pushへ含めず、私有の作者原本を保持します。

PRの初回Runtime CIでは旧with課題の移行検査に旧最新revision `2026-10-12.3`の期待値が残り、実際の移行先`2026-10-13.1`との不一致で失敗しました。新旧両移行検査の最新期待をauthoringのcourse.yamlから照合するように修正し、旧保存revisionのseedとSource／履歴／成功Snapshot保持の検査を維持します。製品の移行処理や検査条件は緩和していません。初回FAILは私有原本に保持し、修正した最終HEADの必要CIを別に確認します。

内容／Runtime／UIの独立3レビューと現hashを対応付け、最終HEAD／マージSHAの必要CIはPRとローカル引継ぎへ記録します。Localは最終HEADの既存Runtime CIで新しい生成indexを組み込んだimageを使い、能力情報とのrevision一致を必須にした実gradeと移行検査の成功を確認します。古いcontroller imageの成功を新revisionの証拠へ流用しません。

## 性能・安全性と未確認の受入

既存のWorker／frame、同origin固定core取得、ASTの有限文法、CPythonの隔離・資源・出力・回収条件は[Python実行契約](python-runtime-contract.md)と[Local実行境界](local-python-runtime.md)を正とし、今回緩和しません。型注釈やASTの形を、任意コードの安全性を証明する仕組みとは説明しません。

読書中のcore取得0と既存bundle上限は配信・性能の技術確認です。低速CPU／回線での実践Projectの初回・操作時間、標本数とp95の受入は今回未確認です。テスト所要時間を操作性能へ読み替えず、未承認の性能予算を新たに作りません。実人の初心者受講・物理低性能端末も未確認です。独立内容／Runtime／UIレビューと自動テストを、初心者の理解や実機観察の完了とは扱いません。初心者模擬受講を採用する場合も、対象・方法・原本照合と本人承認を別に確認します。

Nextの厳格checkpointで検出された短時間Zombieは[#204](https://github.com/santa928/tsumucode/issues/204)で原因を追跡します。関連記録は#142／PR199および#146です。初回FAILと限定診断を保持し、再確認・main成功を原因解明／解消とは扱いません。再発時は追加再試行せず、厳格なZombie0条件のままライフサイクル調査へ戻ります。

## 公開前に残る条件

- 公開候補を固定した時点の5Lesson内容hash／独立レビューと技術原本のbinding。今回の草稿教材承認を公開許可へ流用しない。
- 承認された初心者受入方法、必要な性能受入、blocking findingの是正。実人・物理端末の未確認状態を維持する。
- 既存の全site公開Gateが要求するPython基礎9教材のレビュー不足を別管理で解消する。
- `python-practice`の公開契約と品質／Source／tree／dist bindingを定義し、専用承認・履歴・既存Gateの整合を確認する。現在の公開allowlistは`python-basics`までで、このCourseは未設定。
- 本人の新規Pages公開／Home・Path追加許可を確認して、完成CourseだけをPython Pathへ追加する。
- 正確な公開SHA／CI／配信hash、公開後の開始・再開・実判定・保存・Export／fresh Importを記録する。

公開準備の技術差分を統合しても、Path追加と配信後確認が保留の間は#147を閉じません。
