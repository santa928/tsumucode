---
id: html-css-ch03-l03-s01
title: Form Controlは情報を入力・選択する部品
kind: concept
concept: form-controls
assets: []
---

Formには、1行Textを入力する`input`、複数行を書く`textarea`、選択肢を選ぶ`select`などのControlがあります。

このLessonでは名前を入力するText Controlを使います。Inputの`type`は入力の目的をBrowserへ伝え、`name`は送信時の項目名になります。

```html
<input id="display-name" name="displayName" type="text" />
```

TsumuCodeのPreviewでは外部へのForm送信を無効にしています。入力部品の構造と操作性を安全なSandbox内で練習します。

:::practice
prompt: Code例からControlを識別するid、送信項目名のname、入力種類のtypeを探します。
expectedAction: 3属性を指し、それぞれの役割を区別する
estimatedMinutes: 2
:::

次は、見えるLabelとControlを関連付けます。
