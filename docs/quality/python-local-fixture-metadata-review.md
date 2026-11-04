# Python Local Fixture期待値のメタデータ移設レビュー

対象は `python-basics-ch01-l03`、`python-basics-ch01-l09`、`python-basics-ch02-l01` の3行です。元main `16bbf55442a3166193c3e7de07c06d644126968d` の旧台帳原本を下にそのまま保持します。今回の台帳行へ旧承認者・旧Sourceの承認を付け替えません。

`94a847702c57e035a9ceb07162683ed6723637c9` は3つのexercise.yamlへ `expectedLocalStatus` を計4項目追加し、E2Eに直書きされていた同じLocal期待値を参照させました。旧3行のsourceHashはすべて `94a84770^` の各Lesson全文と一致し、そこから現行Lessonへの差分はこの4項目だけです。教材本文・掲載例・Fixture Sourceは変わっていません。

| Lesson / Fixture | 旧E2EのLocal条件と新metadata | 根拠 |
| --- | --- | --- |
| ch01-l03 / empty | pass → pass | 固定採点は空入力ではなく17/18で実行する |
| ch01-l09 / input-exhausted | pass → pass | 固定採点は5/fiveの例外処理を検証する |
| ch02-l01 / unused-loop-hardcode | code-error → code-error | 正常固定入力の出力不一致後、不正入力の未捕捉ValueErrorが優先される |
| ch02-l01 / input-exhausted | pass → pass | 固定採点は正常・不正入力の3例を実行する |

独立AI Runtime担当 `input_boundary_review` が `f310fdcb` で4項目、既存Local固定採点、旧テストの条件を静読し、メタデータ移設の差分に残るImportantなしと判断しました。対象3Lessonはこの基準mainと同一です。これは今回新たに実行・通常UI観察・実人受講を行った証拠や公開承認ではありません。

特に `unused-loop-hardcode` のLocal Previewは、入力3/5なら実行成功・出力 `8\n終了\n`・`projectSummed=false` で未採点です。Browserの事前入力採点はincomplete、Local固定入力採点はcode-errorとなります。Previewそのものをincompleteという採点結果へ読み替えません。

既存の掲載例の実行証拠は、コードが不変の範囲と旧条件でだけ参照します。全体の `releaseStatus: draft`、公開承認原本、専用公開gateは維持します。#196の実CPython/ブラウザCI・通常UI・公開後検証が完了したとは扱いません。

旧行の原本（fenced text内は再整形しない）:

`python-basics-ch01-l03` の原本行 SHA-256: `6536aacd08b774e09bf2d860d21a124599c0efe5755ac51687d27643ee39f61e`

```text
  - lessonId: python-basics-ch01-l03
    authorId: tsumucode-python-author
    reviewerId: codex-issue147-prepublication-review
    sourceHash: ccd316600891bca8d0b32daf2163978e83644147959e31995742608c1a2e2a78
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: Codex /rootが目標・前提・全Slide・演習指示・段階・Rule・Hint・Starter・Solutionを実レビューし、必須修正0。固定CPython 3.14.2で説明例・境界例を実行。範囲・継続文脈・私有原本はpython-basics-content-review.mdを参照。内容レビューであり、実人受講・新たな公開許可は未完。
```

`python-basics-ch01-l09` の原本行 SHA-256: `a51e55703eac55e6c03350d268b9a4e26052e336dd3a3a71224b149bd7c1a8f1`

```text
  - lessonId: python-basics-ch01-l09
    authorId: tsumucode-python-author
    reviewerId: codex-issue147-prepublication-review
    sourceHash: 55239ab7d202adf2f7066122a9e6e21e208d8a5507a093ede7fcf70b4bbef86d
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: Codex /rootが目標・前提・全Slide・演習指示・段階・Rule・Hint・Starter・Solutionを実レビューし、必須修正0。固定CPython 3.14.2で説明例・境界例を実行。範囲・継続文脈・私有原本はpython-basics-content-review.mdを参照。内容レビューであり、実人受講・新たな公開許可は未完。
```

`python-basics-ch02-l01` の原本行 SHA-256: `102beff425737f3aafe4b4fb2e8189343d44307bb89a529d4674be5c8efa70fa`

```text
  - lessonId: python-basics-ch02-l01
    authorId: tsumucode-python-author
    reviewerId: codex-issue147-prepublication-review
    sourceHash: 1e2b72e0c48c49534ae1e14d1d8d1f73abcd056263e018a84b3c5f45e44f76ef
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: Codex /rootが目標・前提・全Slide・演習指示・段階・Rule・Hint・Starter・Solutionを実レビューし、必須修正0。固定CPython 3.14.2で説明例・境界例を実行。範囲・継続文脈・私有原本はpython-basics-content-review.mdを参照。内容レビューであり、実人受講・新たな公開許可は未完。
```

記録上のhashを入れ替えるだけの修正ではなく、期待値移設の差分レビューを新hashへ結び、旧内容レビュー・旧例の実行・公開承認を分けて保持する。
