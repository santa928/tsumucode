## Guide 2 — Heroの優先順位

1. Profile Ownerの名前を含むh1を置く
2. Avatarへ内容が分かるaltを付ける
3. 1文の紹介でAudienceとの接点を作る
4. Worksへ進むPrimary Linkを置く

装飾だけのTextや画像を情報の代わりにしないようにします。

### Avatarの素材を使う

この工程の画像は同梱されています。工程1で作ったHTMLを残し、Heroの中へ次の画像を追加します。`src`は素材の場所、`data-profile-avatar`は採点対象を示す目印です。

```html
<img src="asset:profile-avatar" data-profile-avatar alt="つむぎのプロフィール画像" />
```

表示された画像を見て、`alt`は内容に合う短い説明へ調整してください。画像を用意するために前の工程をリセットする必要はありません。
