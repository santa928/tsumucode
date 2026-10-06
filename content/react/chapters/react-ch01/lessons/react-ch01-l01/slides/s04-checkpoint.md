---
id: react-ch01-l01-s04
title: 型・描画・実行環境を分ける
kind: checklist
concept: Propsの型と表示を確認する
layout: checkpoint
teachesConceptIds: [react-props-data]
masteryTarget: transform
codeReferenceSlideId: react-ch01-l01-s03
screenBudget: { maxTextCharacters: 420, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

main.tsxのpromptを「HTMLが受け持つものは？」へ直します。「プレビューを更新」で実Reactの見出しと一覧を見て、「判定する」で指定の内容を確かめます。createRootは用意済みの起動処理です。

型の案内は変換前、描画中の例外は実行時、Compilerや読込の失敗は環境の案内として扱います。失敗や停止でも編集内容を保持して再試行できます。Resetは確認後に初期コードへ戻します。この教材は表示だけで、回答ボタンやStateの演習ではありません。

:::practice
prompt: 型検査は通るのに表示中に例外が起きた場合、問題文の型エラーですか。
expectedAction: 実行時の描画失敗として区別し、コードを保持して原因を直すと説明する
estimatedMinutes: 1
:::
