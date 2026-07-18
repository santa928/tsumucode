# World-A Visual Review

- releaseStatus: `approved`
- reviewedScreens: `20`
- unresolvedFindings: `0`
- finalArtifactReviewed: `true`
- reviewedAt: `2026-07-18`
- verifiedSourceCommit: `f3d2023e534ac207c5fb25908aac09b28021612e`
- canonicalDistSha256: `d84d16c571d48e597c6d2f17078f34280742e310af9118e9b9d3d184e36afc78`
- reviewBaseCommit: `f3d2023e534ac207c5fb25908aac09b28021612e`
- baselineSet: `tests/e2e/visual-regression.spec.ts-snapshots`
- verification: Chromiumで20件を差分なしで再実行し、20枚すべてを原寸目視した
- bindingPolicy: 最終Noticeを含む同一source commitと`/tsumucode/` canonical distへ結合済み

## 判定基準

- 世界観: 生成り紙、木、深緑の工具箱、黄色の学習中ピース、青緑の完了ピースが同じ語彙で使われている。
- Text切れ／重なり／端部: 意図しない切断、要素同士の衝突、viewport外への横はみ出しがない。
- CTA: その画面で次に行う操作が文言と視覚階層の両方で判別できる。
- Focus: 共通`:focus-visible` token、44px以上の操作面、Tab／矢印keyのsemantic契約を確認した。Focus状態の実ブラウザ横断監査はTask 19でも再確認する。
- PC案内: 編集不能幅では理由、必要条件、URL copy／端末データ導線が表示され、編集UIを誤表示しない。

## 目視結果

| 画面       | Viewport | Baseline SHA-256                                                   | 世界観 | Text切れ | 重なり | 右端／下端 | CTA                                | Focus              | PC案内                 | 判定 |
| ---------- | -------- | ------------------------------------------------------------------ | ------ | -------- | ------ | ---------- | ---------------------------------- | ------------------ | ---------------------- | ---- |
| Home       | 1440x900 | `c0f89aaf7956b7ada9e36bf48fa992753da07729f031e2ab2b7dd7d6e80ae456` | 一致   | なし     | なし   | 安全       | 最初のピースが明瞭                 | 共通契約確認       | 対象外                 | 承認 |
| Home       | 1280x720 | `4cc2a87c18af619c6545e13c9947b379237f8881cfc23b0a4272c2fa7a2eb94c` | 一致   | なし     | なし   | 安全       | 最初のピースが明瞭                 | 共通契約確認       | 対象外                 | 承認 |
| Home       | 768x1024 | `729a791fea9c83fc101731a917133c6b3f55efa995a9b5c88bc269a3b4b6b64a` | 一致   | なし     | なし   | 安全       | 教材CTAが明瞭                      | 共通契約確認       | 対象外                 | 承認 |
| Home       | 390x844  | `6aa057a5705749cc4d6ddf5c1ce1710a60f5310d2a7d68e8629cabb31793f6ca` | 一致   | なし     | なし   | 安全       | 1列導線が明瞭                      | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 1440x900 | `6bbc45671f696b0270e19cff5465da104a8c287a671ac09ae133beef2a2c552f` | 一致   | なし     | なし   | 安全       | 最初のLessonが明瞭                 | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 1280x720 | `6488975baf6914d5d8eab82ac24abf419619467afe80e32a0d0899fb0b1521d8` | 一致   | なし     | なし   | 安全       | 最初のLessonが明瞭                 | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 768x1024 | `cc891a01b318c8666321f096646a4ce0d16384a45da9ea6a9610ab6b1e2e1914` | 一致   | なし     | なし   | 安全       | 学習順序が明瞭                     | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 390x844  | `73307ab0e910263e83b77bca124270006eca681b9449486c2cb875d0d5ac432b` | 一致   | なし     | なし   | 安全       | 1列の学習順序が明瞭                | 共通契約確認       | 対象外                 | 承認 |
| Slide      | 1440x900 | `a5334d52d83c011ee8f12f4414c3d4bd306b9c624f0710519b35e898bd33d884` | 一致   | なし     | なし   | 安全       | 一覧／前後導線が明瞭               | 矢印key契約確認    | 対象外                 | 承認 |
| Slide      | 1280x720 | `e0b4957bea9de353ecf4a67e6a8f454e25845c976198c154e297091108188e26` | 一致   | なし     | なし   | 安全       | 一覧／前後導線が明瞭               | 矢印key契約確認    | 対象外                 | 承認 |
| Slide      | 768x1024 | `e1545681678ea46a24b5b1348d3bd7d54ddf4ce11d8288498c5e198d29912602` | 一致   | なし     | なし   | 安全       | 折りたたみ一覧と本文が同時に見える | 共通契約確認       | 最終Slideで表示        | 承認 |
| Slide      | 390x844  | `5fd724e3ceb50fbac6036c7debbf629aa9dede1acb00c6c7c1b1808321f3e6c2` | 一致   | なし     | なし   | 安全       | 折りたたみ一覧と本文が明瞭         | 共通契約確認       | 最終Slideで表示        | 承認 |
| Exercise   | 1440x900 | `715105da1ab1a7e44e8459ec9ab5fda22d89f747ef8a03e65a4c5792ed031f9f` | 一致   | なし     | なし   | 安全       | Preview更新／判定が明瞭            | Tab矢印key契約確認 | 編集可能               | 承認 |
| Exercise   | 1280x720 | `31216624dd2a102653bbef51c2a485fd00f622aa469c0b6546f79f6b29984c51` | 一致   | なし     | なし   | 安全       | Preview更新／判定が明瞭            | Tab矢印key契約確認 | 編集可能               | 承認 |
| Exercise   | 768x1024 | `cd33a3a8c22586f39d2224377ef5134254ee2a50b3aae4d14832fbb90e82118a` | 一致   | なし     | なし   | 安全       | URL copy／書き出しが明瞭           | 共通契約確認       | 理由と1024px条件を明示 | 承認 |
| Exercise   | 390x844  | `fe93901ab735822a9f5558964b318ca3118e2686ab022fc40aa3e15f6bf1308d` | 一致   | なし     | なし   | 安全       | 縦積みCTAが明瞭                    | 共通契約確認       | 理由と1024px条件を明示 | 承認 |
| Completion | 1440x900 | `f058a4c687c4bbb36391903c706e8267f03bf4e46db2219b7350447a395b9d71` | 一致   | なし     | なし   | 安全       | 次のピースが主CTA                  | 共通契約確認       | 対象外                 | 承認 |
| Completion | 1280x720 | `8eacc22fc39dc212d45447438ca84ded995c5b7224e7500bf76d60f451eb3ff0` | 一致   | なし     | なし   | 安全       | 次のピースが主CTA                  | 共通契約確認       | 対象外                 | 承認 |
| Completion | 768x1024 | `c25ed089d011a982968970485230c03e05dd3a397cfa3553c37b75f341d5e92e` | 一致   | なし     | なし   | 安全       | 2 CTAが衝突しない                  | 共通契約確認       | 対象外                 | 承認 |
| Completion | 390x844  | `8206dfa8dc72d6361fcd3ebba99081d05ad821a4fb6bd5b07c25a3b9a2acdf2e` | 一致   | なし     | なし   | 安全       | 縦積みCTAが明瞭                    | 共通契約確認       | 対象外                 | 承認 |

## 指摘と解消

1. 狭いSlideで部品トレイが本文を押し下げていたため、一覧を折りたたみ式に変更した。
2. PC Exerciseのfile tabと編集面が未整形だったため、ファイルピース、行番号、現在行、診断面をWorld-Aへ統合した。
3. 1280px固定Previewが一部しか見えなかったため、固定Viewportを維持した全体縮尺表示と100%切替を追加した。
4. Homeの遅延読込fallbackがBaselineへ混ざる揺れを、端末データ道具箱の準備完了待ちで除去した。

未解消の視覚指摘は0件。
