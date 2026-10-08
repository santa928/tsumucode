---
id: next-ch02-l02-s04
title: 初期値と操作後を別々に確認する
kind: reflection
concept: 初期値と操作後を別々に確認する
layout: comparison
teachesConceptIds: [next-props]
masteryTarget: transform
screenBudget: { maxTextCharacters: 420, maxCodeLines: 12, maxVisuals: 0 }
assets: []
---

pageのinitialを2にし、Counterでcountに1を足します。保存・反映後にserver-note.txtと初期値2を見て、2回押して3、4を確認します。

文書を再読込すると初期値2に戻ります。これは今回のローカルstateです。端末の下書き・Source版の保存とは別です。

Nextの診断と、表示・イベントの動作を両方確認します。エラーを直して再判定し、停止・再開後も編集したSourceを使います。Serverに残す処理、境界を渡す値、Clientのイベントを自分の言葉で説明します。

:::prediction
prompt: "再読込した後、Counterは4のままですか。"
answer: "再読込後は初期値2に戻ります。"
explanation: "ブラウザのstateは新しい文書で作り直されます。保存したSourceの変更とは別です。"
:::
