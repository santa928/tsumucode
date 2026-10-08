---
id: next-ch02-l01-s04
title: 共通表示とURLの値を確かめる
kind: reflection
concept: 共通表示とURLの値を確かめる
layout: comparison
teachesConceptIds: [next-navigation]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

layoutの見出しを旅行ノートにし、海リンクと詳細のslug表示を直します。保存・反映後に入口→一覧→森/海と進みます。詳細URLを直接開き、再読込しても同じ見出しと値が出ることを比べます。

ReactのJSXとchildrenは既習のままです。Nextのpage/layoutのファイル配置、Promiseのparams、実URLへのHTTP応答が今回の差分です。共通layoutが表示されることと、Client状態が遷移で保持されることは別の観点です。

止めて再開したら保存版と反映版を確認し、同じURLを開きます。未知のslugは固定Previewでは拒否されます。

:::prediction
prompt: "修正後の一覧・森・海で、共通見出しとslugはどうなりますか。"
answer: "共通見出しは旅行ノート、詳細のslugはforestとseaです。"
explanation: "共通layoutは同じ内容で、dynamic pageはURLごとの値を表示します。"
:::
