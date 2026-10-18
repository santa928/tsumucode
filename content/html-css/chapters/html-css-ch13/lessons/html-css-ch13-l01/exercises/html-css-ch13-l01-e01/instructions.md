## STACK DAY Landing Pageを完成する

1. BriefのPurpose、Audience、必須Content、開催設定、Tokenを自分のLayoutへ翻訳します。開催案内はPosterと同じ7月26日、11:00–18:00、NORTH HALL、入場無料へ揃えます。
2. Semantic Structure、Heading、Navigation名、Poster altを確認します。
3. 3件以上のEvent CardをGridまたはFlexで並べます。
4. 390px、768px、1280px、1440pxでCard件数と幅、Documentの横Overflowを確認します。
5. 主要ActionのKeyboard Focusと本文Contrastを確認します。

予約や問い合わせに`mailto:`のLinkを使うと、プレビューでは拒否されます。予約方法や連絡先を説明するSectionへ`id`を付け、対応するページ内Linkで案内できます。たとえば`href="#reserve"`の案内先は`id="reserve"`です。`id`の名前や配置は自由に選べます。プレビューではLinkの移動も停止するため、KeyboardでFocusできることと、`href`の`#`より後の値が案内先の`id`と一致することをコードで確認します。実際の予約やメール送信は不要です。

計測用に、Pageへ`data-capstone-page`、Posterへ`data-event-poster`、Cardの親へ`data-event-grid`、3件以上の各Cardへ`data-event-card`、主要Actionへ`data-capstone-action`を付けます。これらは採点対象を見つける目印であり、Class名やDOM配置の正解ではありません。最後に、Briefの手動Content確認も読み上げます。

完成Sourceは作業中に表示されません。評価Guideと各RuleのFeedbackから自分の設計と修正を決めてください。
