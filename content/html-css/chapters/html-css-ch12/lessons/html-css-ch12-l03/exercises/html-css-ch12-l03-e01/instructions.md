## About、Skills、Worksを再利用Styleで育てる

1. `data-about`を持つAbout Sectionへ、`data-about-copy`を付けた本文の`p`で学習内容と目標を書きます。
2. Skillsを`data-skill-list`を付けた`ul`と、3件以上の子`li`で表します。
3. AboutとSkillsへ共通のSurface Classを付けます。
4. About本文のComputed Line Heightを24px以上にします。
5. Worksへ`data-work-card`を付けた`article`を2件以上置きます。1件目の画像へ`data-work-image`と`class="work-image"`を付け、`asset:profile-avatar`と内容が分かる`alt`を指定します。
6. Worksの親へ`data-works-layout`を付けて2列CSS Gridにし、CardへPaddingとBorderを付けます。

工程2までのHeader、Hero、Avatar、Primary Linkを保ちます。まずHTMLで3つの内容を分け、その後に共通Surface、本文の行間、Skills Flex、Works Gridの順でCSSを追加してください。

`data-`で始まる属性は判定する部品の目印で、`ul`の開始タグへ`data-skill-list`を付け、`class="skill-list"`と併記できます。目印がないと、Listや本文が見えていても判定の対象は0件になります。ClassはCSSで見た目を整えるために使います。
