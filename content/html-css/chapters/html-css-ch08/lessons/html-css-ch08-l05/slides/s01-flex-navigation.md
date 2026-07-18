---
id: html-css-ch08-l05-s01
title: Navigationは並びと名前の両方を持つ
kind: concept
concept: accessible-flex-navigation
assets: []
---

NavigationをFlexboxで横並びにしても、`nav`の意味やLinkのAccessible Nameは失われません。見た目の配置と、支援技術へ伝わる役割を別々に確認します。

複数のNavigationがある場合は`aria-label`などで目的を区別します。FlexboxのClass名や並び順だけに意味を預けません。

:::practice
prompt: Profile内のNavigationへ、目的を伝えるAccessible Nameを追加します。
expectedAction: aria-labelへプロフィール内の移動などの名前を書く
estimatedMinutes: 2
:::

最後にNavigationとCard Rowを統合します。
