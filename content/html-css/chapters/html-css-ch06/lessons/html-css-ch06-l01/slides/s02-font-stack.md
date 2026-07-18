---
id: html-css-ch06-l01-s02
title: System Font Stackは端末にある文字を使う
kind: comparison
concept: system-font-stack
assets: []
---

`font-family`には候補を左から順に並べます。Browserは利用できる最初のFontを選び、最後の`sans-serif`は環境ごとの差を吸収する一般Familyです。

```css
body {
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
}
```

このStackは外部FontのDownloadを待たず、端末に馴染む文字を表示できます。特定のOSだけで使えるFont名を1つに固定しません。

:::practice
prompt: 外部Networkなしでも表示できるFont Stackの最後に置く一般Familyを確認します。
expectedAction: sans-serifをFallbackとして残す
estimatedMinutes: 2
:::

次の実習ではFont Size、Line Height、Font StackをComputed Styleで確かめます。
