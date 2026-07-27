## ContactとProfileを2 Viewportへ収める

1. `body`へ`data-profile-page`を付け、Contact SectionとNavigation Linkを追加します。
2. Contact Linkへ誰に何を送るか分かる名前を付けます。
3. `[data-works-layout]`の固定列を、幅に応じて折り返すGridまたはFlexへ変更します。
4. `.work-image`へ`width: 100%`、`max-width: 100%`、`height: auto`を指定します。
5. 700px以下でHeroを1列にし、390pxと1280pxでHorizontal Overflowを防ぎます。

GridとFlexはどちらでも合格します。工程3で完成したAbout、Skills、2件のWork Cardを削除せず、境界のCSSを直してください。
