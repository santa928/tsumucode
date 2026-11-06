# Python実践・OOPの限定歴史受入

この接続は #147 Python実践5 Lessonと #152 Python OOP9 Lessonの固定歴史受入だけを扱う。現行Courseを公開へ変更せず、新しい教材・全Lesson×3役の正式receipt・新しい実操作観察を発行しない。普通の新教材に必要なcontent/novice/recovery/makerの独立receiptは従来どおり必要である。

## 認証した記録

- 旧Source: 6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931、tree 85b143b26b35aaeb68ce11df1b8b16729a6ab966。
- 実践reader候補: 75c42b98d0d75675b7a8a1703b2cc56393180ccb。固定proposal SHA256 45532dda9a592ad8982df587236a5858551ede232a640a7a1c7407d6e4a3a758、独立audit SHA256 8b866039310010ca265f53fe855afedc951126903e457f0faf4cac329cccd4cd。
- OOP reader候補: 1b7739927e5dd4a8f9d93ffc94a6def66738bfbc。固定17原本のbytes/hashを専用宣言へ拘束する。
- 両候補の独立再レビュー: session 01a1ac60-3361-72c1-a28a-2939cb5bb7be。3指摘修正後の静的再レビューで必須指摘なし。実行成功・公開承認を意味しない。
- 今回の別担当 /root/historical_inspection は2026-11-05T16:32:16.961835Zに、実践2原本とaudit参照18件、OOP17コピーと出所原本、両Course各5 Git参照、旧Source/tree、OOP reviewed tree、現5＋9台帳/sourceHash/撤回0件、固定宣言を実照合した。静的照合であり、現runtime/Browser成功ではない。
- 実践宣言digest af0ecb948a55d00f552c23459d4a85f549486ceb188b2072a3709ef8fc0fc703、OOP宣言digest 2742fea850683eecbc8b03ebc5bc0c8a97ee7a128af477aabda3ef53643d485a を最小sidecarへ固定する。自己申告・任意の再hashを受け付けない。

私有原本の本文やコピーは公開sidecar・テストfixtureに入れない。CIは独立検査済み宣言digestと公開Gitを用いて再照合する。原本検査を行う従来の私有readerも残す。裸宣言やpure helperの結果だけでは共有gateを通せない。

通常の`test:run`と正式unitは、認証済みsidecarから公開readerを実行し、独立Git metadata・旧inventory・現原稿・台帳・撤回を再照合する。私有原本を条件にしたskipは収集しない。原本のSHA256照合を含む従来の2ケースは`tests/local/python-practice-historical-originals.test.ts`に保持し、専用の`test:historical-originals`で明示実行する。専用suiteは環境変数・原本がなければ失敗する。公開unitの成功を、私有原本を今回再照合した証拠にはしない。正式unitのpending/todo/失敗0条件、固定原本hash、認証receipt、資格要件は変更しない。

私有原本の再検査は、許可された原本ディレクトリをホスト側の`PYTHON_PRACTICE_HISTORICAL_ORIGINALS`へ設定し、read-onlyでDockerへ渡して行う。ディレクトリには`historical-proposal-v2.json`と`independent-audit.json`の固定原本が必要で、原本の取得・複製・公開をこのコマンドは行わない。

```sh
./scripts/docker-compose.sh run --rm --no-deps \
  --volume "$PYTHON_PRACTICE_HISTORICAL_ORIGINALS:/private-originals:ro" \
  -e PYTHON_PRACTICE_HISTORICAL_ORIGINALS=/private-originals \
  app npm run test:historical-originals
```

## 適用条件と保持する範囲

限定AI3担当は、初見・応答回復が各Courseの初回演習、小画面・Keyboardが各Projectの読書・戻る操作等を扱った。実践のLesson対応は原Course構造からの対応という限界も保持する。「18:49以降」は回復担当だけの親報告であり、他2担当の時刻と正確な日時は未確認である。

子原画像、全Lesson×3担当、Project制作採点、実人理解、物理端末、VoiceOver/全Tab、長時間停止/終了復元等の未確認を維持する。元宣言の担当別scopeと未確認一覧をqualificationのpythonHistoricalAcceptancesへ保持する。今回のinspection日時を過去観察日時にしない。再観察を要求しない。

適用は固定Lesson集合とlearner内容が一致し、現原稿からcompileしたCourse全体が渡されたinventoryと一致し、現内容台帳が有効な場合に限る。両Courseの撤回は別hash・別Lessonを名乗るものも含めて保守的に拒否する。実践の整合するexercise/navigation/persistence差分は技術再検証義務へ残す。OOPは固定4指紋と演習集約・台帳の完全一致を要求する。

## release v2への接続と未完条件

stage-contentと最終qualifyCurrentReleaseの双方が同じreadVerifiedPythonHistoricalAcceptancesでsidecar・旧Git・現原稿・台帳・撤回を再照合する。verifyContentは固定2案件と既存Tailwind案件を明示的に区別し、Course重複を拒否する。qualificationには歴史受入Lessonと限定summaryを保持し、newlyApprovedLessonsへ昇格しない。

旧Git objectがcheckoutに存在しなければ失敗する。準備環境は元reader内の固定参照SHAを明示的に取得してから実行する必要がある。readerは自動fetch・ネットワーク通信やfallbackを行わない。旧Sourceは現mainの祖先とは限らず、通常のmain履歴取得だけで揃ったとはみなせない。

歴史受入は公開baselineではない。9821a4eb…は候補照合の固定参照であり、公開成功を意味しない。16bb…等の配信baselineをこのsidecarへ固定せず、正式prepare/最終qualifyではその実行時点の認証済み公開baselineを使う。baselineが変われば既存の同一親検査で止め、再採取と適合確認を行う。

同一候補/同一runのruntime・fixture（Pyodide/CPython）・保存・Project・Browser・accessibility・配信境界の技術検証、main/recipe/artifactの一致、publisherと配信後の確認は既存gateに残す。plan/prepare/実行要件の削減はしない。summaryの技術再検証一覧は合格記録ではない。Browserと重い全体テストの実行は統合Rootの割当後に行う。

#259の固定2教材carryは別契約であり、この2Courseの歴史受入に流用しない。統合時は #259 のmovement再検証優先条件・固定baseline・追加Browser要件を維持し、共有content/admission/CLI/qualifyの競合を解消して対象検証する。
