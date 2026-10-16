## ContactとProfileを2 Viewportへ収める

1. `body`へ`data-profile-page`を付け、Contact SectionとNavigation Linkを追加します。
2. Contact Linkの`a`へ`data-contact-link`を付け、誰に何を送るか分かる名前を付けます。判定で外部へ送信する操作は不要です。
3. `[data-works-layout]`の固定列を、幅に応じて折り返すGridまたはFlexへ変更します。
4. `.work-image`へ`width: 100%`、`max-width: 100%`、`height: auto`を指定します。
5. 700px以下でHeroを1列にし、390pxと1280pxでHorizontal Overflowを防ぎます。

GridとFlexはどちらでも合格します。工程3で完成したAbout、Skills、2件のWork Cardを削除せず、境界のCSSを直してください。

`data-contact-link`はContact Linkを判定する目印です。`a`の開始タグへ付け、`href="#contact"`などの移動先と併記します。Linkの名前や移動先を置き換えるものではありません。
