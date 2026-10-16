# 3草稿の公開前契約と私有原本の照合

Tailwind 5教材、Python実践5教材、Python OOP 9教材の技術的な準備を、既存の6公開Courseとは別の固定契約で検査します。成功は `draft-candidate-verified`、`publicationAuthorized: false` です。公開入口、Home／Path、workflowの公開対象、承認履歴を追加しません。実際の公開は別途本人許可と専用の公開契約への接続が必要です。

初期の3つの `*-release-preparation.yaml` は意図的に `draft` です。CLIの合成テストやschema実装は、実教材のcomputer use、原本照合、公開受入の完了に数えません。過去に受入済みの観測は元Source／tree／distを保持します。実人・物理端末待ちには戻しません。

## 実行手順

開発実行は通常どおりDocker内で行います。作業treeと依存volumeをmountし、原本は別の私有Directoryへ保存してください。公開repoや生成Artifactへ原本・認証情報を入れません。以下はコンテナ内のCLIです。

```sh
./node_modules/.bin/tsx scripts/release/checkDraftReleaseCandidate.ts dist --course-id tailwind --measure
./node_modules/.bin/tsx scripts/release/checkDraftReleaseCandidate.ts dist --course-id tailwind --evidence-root /private-evidence
```

`--course-id` は `tailwind`、`python-practice`、`python-oop` のいずれかです。最初の計測はSourceと全Product入力のcommit後に行います。`--measure` は草稿Source／実Artifact一致と全体静的Artifact検査を実行し、候補のhashを出力します。品質原本の検証成功とは解釈しません。

品質記録を追記した後も、Productが同一なら元のSourceを保持できます。計測時は `--measure --source-sha <元Source>`、通常検証時は記録の `candidate.sourceCommit` を使います。SourceはHEADの祖先である必要があります。除外するmetadataは固定3品質記録と固定3内容レビュー台帳の6fileだけです。任意のpath除外、未追跡Product、別Productの差分は許可しません。metadata自身は内容hash・品質記録hash・全参照集合へ別に結びます。

## 私有原本の形式

全JSONは未知fieldを拒否します。実測値だけを記入し、不足値を合成値で埋めません。候補 `candidate` は計測出力をそのまま保持します。`sourceCommit`／`sourceTree` は40桁、他hashは64桁の小文字hexです。

品質記録は `schemaVersion: 1`、固定 `courseId`、`status: ready-for-technical-verification`、`publicationAuthorized: false`、実際の `author`、`candidate`、`observations`、3つの `codeReviews`、`originalsReview` です。参照はすべて `{ "path": "私有rootからの相対path", "sha256": "実bytesのSHA-256" }` です。root外、symlink、特殊file、同pathの別hash、重複する参照は拒否します。

各observation JSONには次を保存します。

| field                            | 内容                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| schemaVersion / courseId / actor | `1`、固定Course、実施担当                                                    |
| method                           | `computer-use` または `automated-test`                                       |
| executionTarget                  | 下表の固定実行対象                                                           |
| contextSharing                   | 独立computer useは `none`。自動検査は `not-applicable` 可                    |
| sourceCommit / sourceTree        | 実際の操作・実行時の元SourceとGit tree                                       |
| canonicalDistSha256              | Browserは実サイトdistのhash。下記の非Browser runtimeだけ `not-applicable` 可 |
| portableArtifacts                | portableだけ `{sourceArchive: 参照, buildManifest: 参照}`、他は `null`       |
| scopes / lessonIds               | 実際に観測した範囲と固定Lesson IDの配列。重複不可                            |
| inputSha256ByScope               | scopesと同じkey集合。各値は下記helperの元Sourceでの計測hash                  |
| rawReports                       | 実ログ・操作報告・画面・manifest等の参照配列。portableの両成果物参照も含める |
| mandatoryFindings                | 必須指摘が解消した原本だけ `0`                                               |

| Course     | 必須runtimeの実行対象とLesson                                       |
| ---------- | ------------------------------------------------------------------- |
| Tailwind   | `browser-tailwind` 全5、`portable-vite` 最後のProject               |
| Python実践 | `node-pyodide`／`local-cpython` 各全5、`browser-pyodide` 最初と最後 |
| Python OOP | `node-pyodide`／`local-cpython` 各全9、`browser-pyodide` 最初と最後 |

Node、Local、portableは `automated-test` かつ `scopes: [runtime]` の場合だけサイトdistを適用外にできます。Nodeの成功でBrowser／Localを、Browserの成功で持ち出しproduction buildを代用できません。ZIPとbuild manifestは実bytesを照合しますが、その内容が実行成功を裏付けるかは独立原本照合が必要です。

`usability` は履歴なし・作者／3code担当とは別の `computer-use`、`executionTarget: browser-ui` です。必要LessonはTailwind全5、Python各最初と最後です。これは既存受入の限定範囲で、全Project実装能力の受入や物理端末の性能保証へ拡張しません。`accessibility`／`delivery` は全Lesson、`persistence` は最初と最後が必要です。これらのサイト操作も実サイトdistを保持します。

入力指紋は `scripts/release/draftQualityInputHashes.ts` の `hashDraftQualityInputs(root, sourceCommit, courseId, scope, lessonIds)` で計測します。tsxから同helperをimportして、元Sourceの実値を記録してください。validatorは元Sourceと現候補の両方を再計測します。runtimeは対象Lessonの実行・検証fileと固定実行基盤、他scopeは対象教材と画面・配信基盤を含みます。他Lessonの追加やrevisionだけで旧runtimeを失効させません。画面基盤の変更は保守的に該当scopeを失効させます。単なる互換性の自己申告やSource SHAの付替えは受理しません。

3つのcode review JSONは `schemaVersion`、`courseId`、`actor`、`role`（`requirements-logic`／`security`／`structure` を各1名）、`sourceCommit`、`productTreeSha256`、`decision: approved`、`mandatoryFindings: 0`、`rawReport` です。3担当は相互に別で作者とも別です。レビュー原文を実際に照合し、元Sourceと同Productの範囲でのみ再利用します。

最後にその3担当のうち1名が、全原本の内容・実行条件・主張との対応を実際に確認します。独立照合JSONは `schemaVersion`、`courseId`、`reviewer`、`decision: approved`、`candidate`、`qualityRecordSha256`、`checkedReferences` です。品質記録hashは `hashDraftCourseQualityRecord(record)` で、循環を避けるため `originalsReview` propertyだけを除きます。`checkedReferences` はobservation／code receiptと、その全raw参照の重複しない集合です。独立照合JSON自身は含めません。

hash一致は改変・欠落を検出する手段で、実操作の実施事実を自動証明しません。取得できていない原本や未完の再操作があれば、品質記録はdraftのまま保持します。過去の承認記録を最新Sourceの実操作へ書き換えず、入力が変わったLesson／scope／実行対象だけを再確認します。
