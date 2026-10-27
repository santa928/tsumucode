# Tailwind草稿のSourceとdistの照合（Issue #131）

正式公開契約の追加後は[専用公開手順](tailwind-normal-release-policy.md)で元の草稿受入と新しい公開候補を照合します。下記CLIは元の固定草稿を検査するもので、Product変更後に元候補のSourceを付け替える用途には使いません。

作者検証に使うSourceとdistを固定した後、既存のDocker環境で実行します。新しいbuildが不要なら1行目を省略し、既存distのDirectoryを第1引数へ指定できます。

```sh
./scripts/docker-compose.sh run --rm app npm run build
./scripts/docker-compose.sh run --rm app node --import tsx scripts/content/checkTailwindDraft.ts dist
```

現在の`tailwind`をCompilerで読み、実distのCourse本文・Catalog metadata／Index SHA・公開Provenance・参照Asset bytesを照合し、既存5Lesson内容レビューも確認します。Source／Catalog／distがすべてdraftで、Source／dist双方のPathのstepと前提参照に未登録であることが条件です。検査はファイルや承認状態を書き換えません。

比較処理を共有する対象は、現在の実践・OOP・Tailwindの3草稿に固定します。既存の実践・OOP用APIと専用CLIは維持します。公開Courseの許可対象や一般Artifact Gateを追加する操作ではありません。

成功時の`draft-matched`は、この草稿入力の一致だけを示します。`runtimeSha256`はRuntime JSONのhashで、Source treeやdist全体のhashではありません。一般の静的Artifact検査・実行・操作受入・原本とのbinding・専用公開Gate・公開許可の完了とは別です。

Issue #131の完了には、承認された初心者検証と必須問題の是正、品質・保存・後続required Courseを阻害しない導線の確認、最終候補と原本のbinding、公開Gateと本人の公開／recommended Path追加許可、配信後の主要操作／SHA確認が必要です。既存証拠は対象入力と範囲を保って再利用し、この草稿照合によって一律に未完へ戻しません。照合の成功だけでIssueを閉じません。
