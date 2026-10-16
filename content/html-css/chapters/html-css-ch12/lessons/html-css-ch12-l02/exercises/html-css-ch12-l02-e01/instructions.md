## HeaderとHeroでProfileの入口を作る

1. HeaderへNavigationを置き、内容を表すAccessible Nameを付けます。
2. HeroへProfile Ownerと目的が分かるh1を1つ置きます。
3. Avatarの`img`へ`data-profile-avatar`と、内容が分かる`alt`を付けます。
4. `#works`へ進むPrimary Linkの`a`へ`data-primary-link`を付け、目的が分かるTextを書きます。
5. `.site-header`をFlexにし、NavigationをSite名の右へ並べます。
6. `.hero`を2列Gridにし、Avatarを親幅へ収めます。

工程1のAudience、header、main、footerは保ったまま積み上げます。HTMLを整えたあと、既習のFlex、Grid、`width: 100%`で入口のLayoutを作ります。

`data-`で始まる属性は、この実習で判定する部品の目印です。たとえば`a`の開始タグへ`data-primary-link`を付け、`href="#works"`と併記します。目印だけでは見た目は変わらず、CSSのClassや内容を表す`alt`とは役割が異なります。
