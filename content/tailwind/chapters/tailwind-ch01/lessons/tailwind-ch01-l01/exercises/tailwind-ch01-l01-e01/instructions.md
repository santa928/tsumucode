2つの項目を横に並べ、項目間と枠の内側にそれぞれ1remの余白を作ります。

index.htmlのid="cards"が付いたdivで、block・gap-8・p-2を順に直してください。2つの子のdivを残し、親のclassだけを直します。まず結果を予測し、「プレビュー更新」で見比べてから判定します。

flexはdisplay: flex、gap-4はgap: 1rem、p-4はpadding: 1remに対応します。この固定themeでは1remが16pxです。gap-[16px]やp-[1rem]のような数値別解も使えます。

この実習はindex.htmlだけを扱います。classは合計64個・1個64文字、HTMLは16KiB・128要素までです。対応するclassはflex/block/inline-block、flex-row/col、gapとpの0/2/4/8、border/rounded、一部の色・文字指定です。後続教材用に幅・状態・レスポンシブの有限指定も対応しています。この演習で使う数値別解はgapとpの0〜128px・0〜8rem（小数2桁まで）です。幅の数値指定は後続教材で扱います。未知の通常classは見た目へ反映せず、警告と実際のCSSで確認します。

追加CSS・style属性・script・任意のvariant連結・url・plugin・configは未対応で、編集を保ったまま採点を止めます。実行部の読み込みに失敗したときも未採点です。Hint・初期コードへ戻す操作・保存された下書きからやり直せます。
