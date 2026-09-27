# 予測・修正・応用のパイロット

Issue #23。既存ガイドを入口として残し、ClosureとHTML/CSS導入だけに考える場面を追加する。同じPro Chatのmain96054f1に対する設計助言を確認して実装する。

| ID      | 区分     | 受入条件                                                                                                                                            |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 | 維持     | e01・既存ID/下書き/初回完了日時/必須完了条件を保持                                                                                                  |
| REQ-002 | 追加     | 問いを先に表示し、答えと理由はdetailsで開く。別問題へ開閉を持ち越さず、採点/保存を更新しない                                                        |
| REQ-003 | 追加     | Closure e02で初期化の場所を修正、e03で増分の違う2つの係を独立に使う。各workspaceを分離し任意の追加練習と表示                                        |
| REQ-004 | 維持     | 既存SourceFactとConsoleで正解2種と代表誤解/単純な出力置換を区別。任意evalやhidden probe基盤は追加しない                                             |
| REQ-005 | 追加     | Localの要求検証/能力応答/画面を有限3IDへ揃え、同じconsole/core profileで実Node実行。対象外/旧controllerは未対応案内、黙ったfallbackや不正解保存なし |
| REQ-006 | 維持     | ヒント/解答/不正解/Reset/追加課題往復/Import/Exportで既存e01下書きと完了を守る                                                                      |
| REQ-007 | 実施待ち | 実初心者に別例の説明と修正を観察し、できなかった点も記録。実装PR後もこの項目が未完ならIssueはOpenで維持                                             |

保留・削除した要件はない。人の観察は自動テストでは代替しない。観察待ちは#22など独立作業を止める理由にしない。

既存の生成り/深緑/黄色を用い、予測は「考えてみよう」、展開は「答えと理由を見る」とする。コード/例は既存Blockを再利用。閲覧・ガイド合格・追加練習合格を習得率として扱わない。

## 制約

採点は代表的な誤解と単純な固定出力置換を見分ける学習用の検査であり、ダミー呼出し等で故意に欺くコード全てを防ぐ試験基盤ではない。学習目標にない関数形式/return個数は固定しない。

旧Node演習と同じイメージ、資源上限、ファイル形式、停止/回収/隔離を維持する。PagesからLocal APIを探索せず、Homeの既存容量/遅延ロード条件も維持する。

## 検証（実装中）

予測の許可記法・回答非表示/別問題へのリセット、2演習の代表解/誤答、Browser/Local実行と採点、既存完了/下書きとImport/Export、PC/390pxを中心に確認する。実行した結果だけを追記する。全Course×全Browserや固定テスト件数を目標にしない。

初心者観察、実機タッチ、公開Gateは現時点で未実施。

## 実行記録

- 実Browser JavaScript RunnerでClosure e01/e02/e03のSolution/Starterと定義済みFixtureを確認。追加課題は `+=` と `= score + ...` / arrow関数の別解、毎回初期化・共有global・固定return・出力だけ・元関数を残した定数出力・構文誤りを区別した。
- 実Local web→controller→隔離Nodeで3演習のStarter不合格、Solution合格、追加2演習の別解合格を確認。pageerror 0。Nodeイメージ/隔離/権限/上限は変更していない。能力一覧欠落・対象外を未対応とする契約はHTTPモックを用いたService検証であり、実Node結果と区別する。
- Browserでe01を実合格させたBundleの教材revisionだけ旧版へ戻し、正規checksumを付けた合成BundleをImport。予測開閉、e02不正解・Hint・編集・Reset、同じURLの再表示、e02/e03実合格、Export→別profileへのImportまで完走。既存e01のfiles・currentComplete・firstCompletedAtを保持。過去ユーザーの実データによる確認ではない。
- この往復で同一URLの再検証時に新Controllerが旧Sessionのreadyを引き継ぐ不具合を発見。新Controllerのinitialize完了まで編集画面を待機させ、Runnerへ新しいiframeを渡す。`stop`/`dispose`やsandbox属性は変えず、同じ実フローの赤→緑を確認。既存画面/Session回帰82件・型・対象Lint成功。
- 1280×844 / 390×844のHTML/CSS予測とClosure予測で、初期閉→展開→理由末尾到達、横はみ出しなしを確認。Closure最終Slideの任意リンクと予測への再訪（再び閉）を確認。画像6枚を目視した。既存Closure最終SlideのVisual 2件は変更なしで成功し、基準画像は更新していない。

画像は[PC予測](evidence/issue-23/javascript-1280-prediction.png)、[390px予測](evidence/issue-23/javascript-390-prediction.png)、[PC任意リンク](evidence/issue-23/closure-1280-optional.png)、[390px任意リンク](evidence/issue-23/closure-390-optional.png)、[HTML/CSS PC](evidence/issue-23/html-css-1280-prediction.png)、[HTML/CSS 390px](evidence/issue-23/html-css-390-prediction.png)。Local buildの読書画面であり、公開Pagesで新機能を検証した画像ではない。

## 未完条件と復帰条件

実初心者に予測を説明してもらい、Hint前後の小修正・別増分での独立性を観察する受入条件は未実施。実装PRが統合されてもIssue #23を自動closeしない。対象教材版を固定した人の観察記録が揃った時に再評価する。合成Bundle・自動操作を学習効果の実証として扱わない。

最終の関連検証はDocker Composeで `npm run lint`、`npm run test:changed`（84ファイル826件）、production build、CSS inline、learning chunk isolation、配信容量9件が成功。教材集計の旧27演習/420分と旧practice専用検査は、29演習/430分とpredictionを許可する契約へ同期した。上限・セキュリティ期待・snapshotを緩和していない。

Production buildのChromiumでは対象JS Fixture、保存往復、既存HTML/CSS全消去Reset、初回自動Previewの4件が成功。最初の同時指定で対象JS用Fixture filterをHTML/CSSの全Fixtureテストにも渡した1件は一致0で失敗しており、HTML/CSS全Fixtureを検証済みとはしない。追加2演習を含むJS対象の全定義済みFixtureは実行済み。
