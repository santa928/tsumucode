---
id: html-css-ch03-l01-s01
title: a要素は行き先と説明を1組にする
kind: concept
concept: anchor-anatomy
assets: []
---

Linkは`a`要素で作り、`href`属性へ行き先、開始Tagと終了Tagの間へLink Textを書きます。

```html
<a href="#practice">練習内容を見る</a>
```

`#practice`は同じページ内で`id="practice"`を持つ場所を示すFragmentです。Link Textには「ここ」ではなく、移動すると何が分かるかを書きます。

- hrefは移動先を示す
- Link Textは人に目的を伝える
- idはページ内の到着点になる

:::practice
prompt: 「ここをClick」と「練習内容を見る」のどちらが行き先を予測できるか比べます。
expectedAction: 文脈から切り離しても目的が分かるLink Textを選ぶ
estimatedMinutes: 2
:::

次は、ページ内Linkとhttpsの外部Linkを安全に使い分けます。
