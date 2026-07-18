---
id: html-css-ch03-l02-s01
title: imgは画像Sourceと代替Textを持つ
kind: code
concept: image-source-alt
assets: []
---

`img`は`src`で画像を指定し、`alt`で画像を表示できない状況や読み上げ利用者へ同等の情報を伝えます。

TsumuCodeの実習では、Network上の画像URLを直接読み込まず、教材へ安全に登録されたAssetを`asset:ID`で参照します。

```html
<img src="asset:profile-avatar" alt="Code Cardを持つ学習プロフィールのAvatar" />
```

画像には終了Tagがありません。srcとaltはどちらも開始Tagの属性として書き、表示だけでなく情報の届き方も確認します。

:::practice
prompt: Code例で画像の場所を示す属性と、言葉で内容を伝える属性を指します。
expectedAction: srcとaltの役割を区別して説明する
estimatedMinutes: 2
:::

次は、画像の目的に合わせたaltの書き方を考えます。
