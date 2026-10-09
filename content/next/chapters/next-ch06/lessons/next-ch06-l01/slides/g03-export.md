---
id: next-ch06-l01-g03
title: 現在のSourceを持ち出す
kind: guide
layout: explanation
teachesConceptIds:
  - next-project-presentation
  - next-source-export
masteryTarget: compose
screenBudget:
  maxTextCharacters: 420
  maxCodeLines: 12
  maxVisuals: 0
assets: []
---

入口のtitle/descriptionと画像のalt/寸法は、文書と画像の工程で判定します。ZIPの作成や復元は、この判定の代わりにはなりません。

Source ZIPには現在表示中のファイルと固定画像、Docker起動用の包装を入れます。端末JSONは下書き・合格記録の移送です。持ち出したREADMEの手順で別Dockerの動作を確かめ、元のDraftも保持します。

:::prediction
prompt: "未合格のZIPを保存したら、合格記録も得られますか。"
answer: "いいえ。ZIPはその版のSourceで、判定記録とは別です。"
explanation: "Briefの条件と実測した結果を対応させます。"
:::
