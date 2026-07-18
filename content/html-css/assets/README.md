# TsumuCode Original Asset Workflow

1. 図解は最初に `source/` へ編集可能な SVG として作成する。
2. Raster Image を生成する場合は image generation を使い、採用 Prompt を `source/prompts/` へ保存する。
3. Course で使う最終 Asset だけを `published/` へ置く。
4. Source、Prompt、Published Asset をそれぞれ `provenance.yaml` へ登録する。
5. 第三者 Asset は `CC0-1.0`、`CC-BY-4.0`、`OFL-1.1` だけを許可し、表示義務を README と画面へ反映する。
6. 他サービスの Logo、Character、Screenshot、図解、教材 Asset を入力または参照に使わない。

Source と Published Asset は別の Provenance 項目にし、公開用 Asset から外部参照、Script、Event 属性を除きます。
