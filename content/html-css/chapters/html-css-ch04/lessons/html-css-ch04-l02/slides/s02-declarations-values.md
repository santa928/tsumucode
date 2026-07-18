---
id: html-css-ch04-l02-s02
title: DeclarationはPropertyとValueを正しい記号で結ぶ
kind: comparison
concept: declaration-syntax
assets: []
---

CSS ParserはColon、Semicolon、波括弧を手掛かりにRuleを読みます。記号が欠けると、意図したDeclarationを解釈できずCode Errorになります。

```css
.card {
  background-color: #ffffff;
  color: #24323d;
}
```

構文が正しくてもValueが違えば、Previewは表示できても課題の目標には届きません。Diagnosticがあるときは構文を先に直し、次にComputed Styleを比べます。

:::practice
prompt: Colon不足と色Value違いを、Code ErrorとPreview未達へ分類します。
expectedAction: Parserが読めるかと結果が合うかを別々に判断する
estimatedMinutes: 2
:::

次の実習ではStylesheet接続とDeclarationの両方を修正します。
