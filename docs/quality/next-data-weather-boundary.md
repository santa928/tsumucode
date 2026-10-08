# データ保持と失敗からの復旧（Issue #134）

固定Next.js 16.3.8で、制御可能な教材内データを使う2 Lessonを追加する。
Courseはdraftを維持し、外部API・新DB・秘密鍵は必須にしない。

## 教材と判定

`next-ch03-l01`はServer fetchのno-store、force-cache、revalidateを扱う。
同じpageへの複数要求と期限前後を比較し、固定APIの実取得履歴とDOMの取得番号を
照合する。静的な同じ文字列を表示するだけでは合格しない。

`next-ch03-l02`はloading、errorのretry、notFoundを扱う。固定版のretryは再取得、
resetはerror境界の再描画として区別する。Next Linkのprefetchを無効化し、遅い応答、
初回503と再試行後200、対象なし404を実測する。stream済みnotFoundの文書応答は
200になる場合があるため、画面・noindex・内部API404も照合する。

各Lessonは4 Slide、折り畳む予測、修正手順3、Hint3、Solution、正負Fixture8/9を持つ。
制御APIと共通ファイルはSource保存APIで固定し、編集できるpage/境界だけを示す。
この固定は保存契約であり、learnerが任意コードを実行できないという主張ではない。
進捗revision `.2`→`.3` は旧Draft・合格を保持し、追加Lessonを現在のCourse完了へ要求する。

## 承認済みの転送境界

2026-10-08の本人承認により、GET/HEADの固定data3経路とWeather4経路を追加する。
Weatherのみ、固定版で実測したstate-treeと単一 `_rsc` queryを持つGETを通す。
任意tree、prefetch、未知query、POST、内部制御API、管理UIは公開しない。
RSC/streamはHTMLまたはtext/x-componentのみ、512 KiB・30秒の既存上限内で送る。
Cookie・Authorization・管理tokenを転送せず、固定CSP・接続数・chunk上限を維持する。
backpressureを扱い、上限超過・切断・Source適用/停止で部分応答を中断する。
採点は応答完了と遷移先も確認するため、部分応答の画面だけを合格に使わない。
trusted bridgeはRSC URLを最大16件記録し、転送が上限内で最後まで完了したURLだけを
採用する。同じURLの再利用は拒否し、上限超過・切断時は完了を記録しない。
固定版のdev debug channelを無効にし、資格情報や追加のdebug headerを通さない。
devのfont GETとstack-frame POSTは引き続き403で拒否する。この2つの固定診断要求は
Weather採点の教材エラーに含めず、その他の資源失敗は診断する。

learnerのCPU1、RAM/swap512 MiB、PID64、tmpfs各64 MiB、nonroot、readonly、
network:none、cap dropを変更しない。新2教材だけdevのTurbopackファイルcacheを
無効にし、dev validationは追加workerではなく同じprocessで行う。Node heapは192 MiBへ抑える。Source反映時は生成物の`.next`だけを初期化する。Draftは保持する。
新2教材の内部allocatorはarena2、Rayon/Tokioのworker設定は各1へ抑える。
CPU・RAM・PID・tmpfsの上限や採点期限は変更しない。
固定データAPIはbootstrapのloopback 5174で処理し、Nextは5175で起動する。
これにより固定APIの追加compileを避ける。学習者の実行時ファイルは読み込まず、
image内のreadonly API原稿と同じ正本をNode 24の型除去で実行する。
保存版ごとにデータ状態を生成し、旧保存版の遅延応答は破棄する。
通常のAPI/Next応答とtrusted採点は既存の5173/Unix socketを使い、内部APIはPreviewへ公開しない。
Weatherの起動warmupと判定前には作者用内部APIで初回失敗条件を戻す。
操作/表示のTimeoutErrorは教材エラーへ分類し、基盤障害と区別する。

## 作者検証

通常LessonのBrowser検証は予測開閉、編集/反映/判定、keyboard、失敗修復、合格版失効、
停止/reload/再起動、狭い画面、axe、JSONのDraft/合格export/importを対象とする。
Fixture・Solutionは作者用imageだけに含め、learner/web/graderへ配布しない。
作者用production buildの資源はlearnerとは別であり、その成功をlearnerのbuild保証にしない。
実RSCの結果到着前にSource反映・停止を行い、部分応答の切断、旧版gradeの409、
新保存版の合格、Source保持後の再起動を確認する。作者の手作りqueryによるredirectを
成功証拠には使わず、固定Next16.3.8と同じヘッダーからqueryを生成する。
生ログ・画像・作業記録は非公開`.release-issue134`へ置く。
