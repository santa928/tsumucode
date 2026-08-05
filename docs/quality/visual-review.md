# World-A Visual Review

- releaseStatus: `approved`
- reviewedScreens: `24`
- slideLibraryReviewedScreens: `10`
- deliveryChangeReviewedScreens: `10`
- javascriptReviewedScreens: `17`
- unresolvedFindings: `0`
- finalArtifactReviewed: `true`
- reviewedAt: `2026-08-05`
- latestCandidateSourceCommit: `45a70405e85dff0283a0f040351108cebd02c9c3`
- verifiedSourceCommit: `draft`
- canonicalDistSha256: `draft`
- reviewBaseCommit: `draft`
- baselineSet: `tests/e2e/visual-regression.spec.ts-snapshots`
- verification: `2026-07-29`のβBadge最終レビューでは24比較組のactual／expected／diff計72画像を独立に原寸目視し、別レビューで24 baseline更新をAPPROVEDとした。`2026-07-31`にはLearningPath 4画面と変更後Home 4画面を原寸目視し、同一sourceの全visual regressionを再実行した。下表の標準20画面＋LearningPath 4画面＋低画面高診断2画面は、現在のbaseline実体からSHA-256を再計算して結び直した
- bindingPolicy: 自動検証済み。最終source commitとcanonical distへの結合はRelease Approval時に行う

## 判定基準

- 世界観: 生成り紙、木、深緑の工具箱、黄色の学習中ピース、青緑の完了ピースが同じ語彙で使われている。
- Text切れ／重なり／端部: 意図しない切断、要素同士の衝突、viewport外への横はみ出しがない。
- CTA: その画面で次に行う操作が文言と視覚階層の両方で判別できる。
- Focus: 共通`:focus-visible` token、44px以上の操作面、Tab／矢印keyのsemantic契約を確認した。Focus状態の実ブラウザ横断監査はTask 19でも再確認する。
- PC案内: 編集不能幅では理由、必要条件、URL copy／端末データ導線が表示され、編集UIを誤表示しない。

## 目視結果

| 画面       | Viewport | Baseline SHA-256                                                   | 世界観 | Text切れ | 重なり | 右端／下端 | CTA                        | Focus              | PC案内                 | 判定 |
| ---------- | -------- | ------------------------------------------------------------------ | ------ | -------- | ------ | ---------- | -------------------------- | ------------------ | ---------------------- | ---- |
| Home       | 1440x900 | `715fa4d560209cb075fce5fec1a842dcbfc6b46914606256faed05bca72fec25` | 一致   | なし     | なし   | 安全       | 学習Pathの主CTAが明瞭      | 共通契約確認       | 対象外                 | 承認 |
| Home       | 1280x720 | `cd9d06a0526c7e80fcf5ff727328a718e739a0915154f4a5ba2db152c18c2568` | 一致   | なし     | なし   | 安全       | 学習Pathの主CTAが明瞭      | 共通契約確認       | 対象外                 | 承認 |
| Home       | 768x1024 | `d18c8e3b89fce33a6795b8642f0c27513228a191169740ae715c65831b2e6dc9` | 一致   | なし     | なし   | 安全       | 教材CTAが明瞭              | 共通契約確認       | 対象外                 | 承認 |
| Home       | 390x844  | `351c72505fa2a8e409b343dd767519dc5f4dcd177c1f8c9290066d47f22a0c48` | 一致   | なし     | なし   | 安全       | 主CTAが初期画面内          | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 1440x900 | `3cde221bfca3c69c7f97a906e54b3860b1ad3db44a58adc3d03efabcb794d986` | 一致   | なし     | なし   | 安全       | 最初のLessonが明瞭         | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 1280x720 | `3cdb7ddda8372449ccdc4fc7bb6a7c6ae7ac41cfaf8308084c8e097090368ab3` | 一致   | なし     | なし   | 安全       | 最初のLessonが明瞭         | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 768x1024 | `c97926d65b88b49bc6e48306fd74278fca3e4eb5f8123a5ad3d03d3283543db7` | 一致   | なし     | なし   | 安全       | 学習順序が明瞭             | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 390x844  | `715cc0f5113a06388d5b8ed5f0a767ae2b9c86d9f2fac977f7df23a40e883d06` | 一致   | なし     | なし   | 安全       | 1列の学習順序が明瞭        | 共通契約確認       | 対象外                 | 承認 |
| Slide      | 1440x900 | `f52f888b1e302f65b224e8772d00c7b801b4636b4f06f19417dc5c6c23f12c7f` | 一致   | なし     | なし   | 安全       | Tool Rail／前後導線が明瞭  | 矢印key契約確認    | 対象外                 | 承認 |
| Slide      | 1280x720 | `59fa5ec3da0da6a1a9fefd89ecd2cdf13b65157387e355a510fb5703609da2b3` | 一致   | なし     | なし   | 安全       | Tool Rail／前後導線が明瞭  | 矢印key契約確認    | 対象外                 | 承認 |
| Slide      | 768x1024 | `994f8c1d5486d0b0bd72912db475f52fdd37fb7cf3ff82dd91afa4a482fa60a7` | 一致   | なし     | なし   | 安全       | 本文と前後導線が明瞭       | 共通契約確認       | 最終Slideで表示        | 承認 |
| Slide      | 390x844  | `244adf794a7be8c1ee61eea098db407a53f827582c9d9e903ef9a2fadc737f66` | 一致   | なし     | なし   | 安全       | 本文と前後導線が明瞭       | 共通契約確認       | 最終Slideで表示        | 承認 |
| Exercise   | 1440x900 | `3e7fb3799e8a2d8c34c47549784e3e334462115a33e9a6b4418c88c800dcab98` | 一致   | なし     | なし   | 安全       | Preview／Reset／判定が明瞭 | Tab矢印key契約確認 | 編集可能               | 承認 |
| Exercise   | 1280x720 | `2f3ac3b1b761e71b7c7a44a31a8faf4101aa149a4f4866f0bad24259bfe050f4` | 一致   | なし     | なし   | 安全       | Preview／Reset／判定が明瞭 | Tab矢印key契約確認 | 編集可能               | 承認 |
| Exercise   | 768x1024 | `34e6e96db3dca8a0234ba15c81ee32cdbe6debcd89b6bb08eb5e4f115dd0b6e4` | 一致   | なし     | なし   | 安全       | URL copy／書き出しが明瞭   | 共通契約確認       | 理由と1024px条件を明示 | 承認 |
| Exercise   | 390x844  | `719afb422d7dd22229413f11788342f977d6a5c55f8cc2440c717ad172613816` | 一致   | なし     | なし   | 安全       | 縦積みCTAが明瞭            | 共通契約確認       | 理由と1024px条件を明示 | 承認 |
| Completion | 1440x900 | `3a24cee10515e03ceb67756fd5bbeb3792c0bc7701dbc8abd70a45ea3854ed3b` | 一致   | なし     | なし   | 安全       | 次のピースが主CTA          | 共通契約確認       | 対象外                 | 承認 |
| Completion | 1280x720 | `6d5b1e9838ecf5714d5c03ccfe0f2f3a5e7d1e19b8412115d0fcf7fdc6d97a39` | 一致   | なし     | なし   | 安全       | 次のピースが主CTA          | 共通契約確認       | 対象外                 | 承認 |
| Completion | 768x1024 | `06ae31d6d4ef67b38bbae3771eb8d5dd73254bc3c90e458ce9dcff20cff742f3` | 一致   | なし     | なし   | 安全       | 2 CTAが衝突しない          | 共通契約確認       | 対象外                 | 承認 |
| Completion | 390x844  | `1d55043162ade0e03ba83d03a233f5a8ef5ce066254e74b57b5fa04f7bf472be` | 一致   | なし     | なし   | 安全       | 縦積みCTAが明瞭            | 共通契約確認       | 対象外                 | 承認 |

## Slide Library追加証跡

- 確認日: `2026-07-26`
- 対象source: `82270cf7dd3654c1ebe9b9b71a966489fe5a3375`
- 配信条件: `BASE_PATH=/tsumucode/`のProduction build
- Viewport: 390x844、412x915、768x1024、1280x720、1440x900
- 結果: 下記10枚を原寸目視し、意図しないText切れ、重なり、横はみ出し、右端／下端の欠け、誤った文言は0件。1280x720と1440x900のViewerは1画面へ収まり、低い画面だけSlide Stage内に救済Scrollを持つ
- βBadge再レビュー: `2026-07-29`に閲覧目次`library-index`の下記5 baselineを更新対象として原寸目視した。閲覧Viewer 5 baselineは`2026-07-26`の既存証跡を維持し、今回の更新対象には含めていない

| 画面       | Baseline                                           |
| ---------- | -------------------------------------------------- |
| 閲覧目次   | `library-index-mobile-primary-chromium-linux.png`  |
| 閲覧目次   | `library-index-mobile-tall-chromium-linux.png`     |
| 閲覧目次   | `library-index-tablet-portrait-chromium-linux.png` |
| 閲覧目次   | `library-index-desktop-compact-chromium-linux.png` |
| 閲覧目次   | `library-index-desktop-wide-chromium-linux.png`    |
| 閲覧Viewer | `library-slide-mobile-primary-chromium-linux.png`  |
| 閲覧Viewer | `library-slide-mobile-tall-chromium-linux.png`     |
| 閲覧Viewer | `library-slide-tablet-portrait-chromium-linux.png` |
| 閲覧Viewer | `library-slide-desktop-compact-chromium-linux.png` |
| 閲覧Viewer | `library-slide-desktop-wide-chromium-linux.png`    |

## LearningPath追加証跡

- 確認日: `2026-07-31`
- 対象source: `6195f13a0be4b29cceced94d2ed59c6ab80e1e9b`
- 配信条件: `BASE_PATH=/tsumucode/`のProduction build
- 結果: 下記4枚と変更後Home 4枚を原寸目視し、意図しないText切れ、重なり、横はみ出し、右端／下端の欠け、誤ったCTA階層は0件。同一sourceの全E2Eは`318 passed / 90 skipped / 0 failed / 0 flaky`
- Responsive境界: 390x844と1280x720で主CTAを初期Viewport内へ維持。Course Card内のBadgeと全CTAは親境界を越えず、順序を示す番号とCardは衝突しない

| 画面         | Viewport | Baseline SHA-256                                                   | 世界観 | Text切れ | 重なり | 右端／下端 | CTA                  | 判定 |
| ------------ | -------- | ------------------------------------------------------------------ | ------ | -------- | ------ | ---------- | -------------------- | ---- |
| LearningPath | 1440x900 | `4571235ecdbfae977341cf66b2ccc4706720a08444398b21471b41b75d70c484` | 一致   | なし     | なし   | 安全       | 続き／最初からが明瞭 | 承認 |
| LearningPath | 1280x720 | `fe7f54c056b7779435f282429bf92f733bc658680c4b89d3e91f2d46254ac50c` | 一致   | なし     | なし   | 安全       | 主CTAが初期画面内    | 承認 |
| LearningPath | 768x1024 | `47a15a2a7367297e4c125c87064294919b61ac2ae141746e259e1d780b857706` | 一致   | なし     | なし   | 安全       | Card内CTAが明瞭      | 承認 |
| LearningPath | 390x844  | `febbaf4e9454efb3f261ed58cc06a03774ff88f3c2d15a57f13a00caff9e2565` | 一致   | なし     | なし   | 安全       | 主CTAが初期画面内    | 承認 |

## Starter Reset／診断の追加証跡

- Task 7確認日: `2026-07-22`
- `exercise-desktop-wide-chromium-linux.png`（1440x900）: Reset Triggerは見出し、file count、右端から安全余白を保ち、file tab、Preview、Action Railと重ならない。Headerは一行で、Editor高を不必要に削っていない。
- `exercise-desktop-compact-chromium-linux.png`（1280x720）: Reset Triggerを含むHeaderは折り返さず、Triggerとfile tab、Preview、Action Railの衝突や右端の欠けがない。
- 一時証跡`/tmp/tsumucode-task7-reset-drawer-1280x720.png`（1280x720、SHA-256 `a276eb6766c2d0dad9a0435c185d2a3604a88ee7b77a78e4512aeec659a13bf7`、baseline対象外）: 編集後にReset Triggerを開き、確認文、閉じる、`編集を続ける`、`最初のコードに戻す`がDrawer内へ収まり、右端／下端の欠けがないことを原寸目視した。

| 診断Baseline                                              | Viewport | Baseline SHA-256                                                   | Header／Editor／診断境界 | 世界観 | 判定 |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------ | ------------------------ | ------ | ---- |
| `exercise-diagnostics-desktop-wide-chromium-linux.png`    | 1440x900 | `c96107a718f0ef00b0a9d72601ee5c26869c1a9ebb0b22955462d213afa36e40` | 収まり、重なりなし       | 一致   | 承認 |
| `exercise-diagnostics-desktop-compact-chromium-linux.png` | 1280x720 | `cea251d8914d58adcafb312dacf13415c685ff1185c4a5ecbe1573d05fc885d0` | 収まり、重なりなし       | 一致   | 承認 |

## Lesson単位配信後の追加証跡

- 確認日: `2026-08-02`
- 対象source: `45a70405e85dff0283a0f040351108cebd02c9c3`
- 配信条件: `BASE_PATH=/tsumucode/`のProduction buildを`?verify=45a70405e85dff0283a0f040351108cebd02c9c3`付きで取得
- 対象: Home、Course Map、Slide、Exercise、Slide Library目次を1280x720と390x844で撮影した10画面
- 保存方針: 画像は`output/playwright/45a70405/`の一時証跡であり、`.gitignore`により公開Artifactへ含めない。下表のSHA-256で目視対象を固定する
- 自動Gate: Unit `1320/1320`、3 Engine E2E `342 passed / 90 skipped / 0 failed / 0 flaky`、Performance `18/18`、bundle budget `7/7`、Lighthouse `12/12`、LCP最大`2192.337 ms`、CLS全件`0`
- Console: 10画面を同一Chromium sessionで巡回後、error `0`、warning `0`
- 境界: 全画面で`documentElement.scrollWidth === clientWidth`、`scrollX === 0`。Course MapとLibrary目次は長い一覧の通常Document Scrollを維持し、SlideとExerciseは両viewportで`scrollHeight === clientHeight`として外側Scrollを発生させない
- Preview例外: Desktop Exerciseの1280px Preview canvasは専用`runtime-preview-scroll`内で縮小されるため内部座標のrightがviewportを越えるが、wrapperとDocumentのrightはviewport内に収まり、実画像でもEditor、Preview、Action Railの重なり・欠けはない

| 画面       | Viewport | Screenshot SHA-256                                                 | Document高          | 代表境界                             | Text切れ／重なり | CTA／案内                        | 判定 |
| ---------- | -------- | ------------------------------------------------------------------ | ------------------- | ------------------------------------ | ---------------- | -------------------------------- | ---- |
| Home       | 1280x720 | `b9b4109fba817389a0ed607a86bcb5c3aadf1a9fc28fa26685130857f870be78` | 2012px、通常Scroll  | 横overflow 0                         | なし             | 学習Pathの主CTAが初期画面内      | 承認 |
| Course Map | 1280x720 | `1cb622b51a77006bbda1c656a6fa508e0ce5c782ec7eb31193ba47833670ec34` | 16871px、通常Scroll | Card右余白16px                       | なし             | コース進捗と最初のChapterが明瞭  | 承認 |
| Slide      | 1280x720 | `c3d3d21d5ec10b121de8b9bb8d8d048d42aa02d5191ec1d14f06578fe6caf9a0` | 720px、外側Scroll無 | Card右余白31px、下余白62.6px         | なし             | 前後導線と一覧／用語が明瞭       | 承認 |
| Exercise   | 1280x720 | `e7269931698266eeabe932458486c2626462bed5a4ce91304cc107deb4f431d9` | 720px、外側Scroll無 | Workspace右余白438.7px、下余白58.6px | なし             | Preview／Reset／判定が明瞭       | 承認 |
| Library    | 1280x720 | `968cd7e832488c632ec4f087051ed43f558fcd54ffb262d58c9f040284e8b6ac` | 8450px、通常Scroll  | Shell左右端0px、横overflow 0         | なし             | 通常学習へ戻る導線が明瞭         | 承認 |
| Home       | 390x844  | `f53524b80a11ce6322a2893622dc5b10f9422cfd7f754899041bb1458a4b9da3` | 2583px、通常Scroll  | 横overflow 0                         | なし             | 学習Pathの主CTAが初期画面内      | 承認 |
| Course Map | 390x844  | `eddaad407c4eff60ec759659e8de8cf585db0e76856b9b4f078d597b68624cf8` | 24216px、通常Scroll | Card右余白16px                       | なし             | 1列の学習順序が明瞭              | 承認 |
| Slide      | 390x844  | `8359bb95fe3225c9670985cc8073c501b92fd5bcd0ac03b6a0cc01640fecedd7` | 844px、外側Scroll無 | Card右余白31px、下余白6.7px          | なし             | 前後導線が下端まで操作可能       | 承認 |
| Exercise   | 390x844  | `10abe9a7c901d29c7c3be9421bd85dca281bce692a08778fe2f4f1273dc40451` | 844px、外側Scroll無 | Document横overflow 0                 | なし             | PC理由／URL copy／書き出しが明瞭 | 承認 |
| Library    | 390x844  | `d5a3f75d5053cc85358275b4817bcf480fecf61494943bec44602730cdf4b320` | 15692px、通常Scroll | Shell左右端0px、横overflow 0         | なし             | 目次と通常学習復帰の主従が明瞭   | 承認 |

## JavaScript vertical slice追加証跡

- 確認日: `2026-08-02`
- 対象source: `draft`（push後にTask 8 commitへ固定する）
- 配信条件: `BASE_PATH=/tsumucode/`のProduction build
- 自動Gate: Chromiumの14 baselineを更新なしで`14/14`再照合し、各画面でpage error、unhandled rejection、console error `0`
- 全体Gate: Chromium／Firefox／WebKitで`392 passed / 118 skipped / 0 failed / retry 0`、性能`20/20`、bundle予算`9/9`、Lighthouse`12/12`
- Viewport境界: 1280x720はDocument `scrollHeight <= 721`、390x844はDocument `scrollHeight <= 845`、両方ともDocument／Stageの`scrollWidth <= clientWidth + 1`
- 救済Scroll: 390x844の最終SlideだけStage内を`overflow-y: auto`とし、下端は`scrollTop + clientHeight >= scrollHeight - 1`で到達可能。上下2画像で完了CardとPager CTAが重ならないことを確認
- 目視結果: 4 Slide×2 viewport、最終Slide下端、Exercise×2 viewport、Error、Hint、Resetの14画像を原寸確認し、意図しないText切れ、重なり、横はみ出し、右端／下端欠け、誤ったCTAは0件
- 公開後是正: 最初のbeta公開でSlide 1の未対応Markdown強調が`**HTML**`のように文字表示されることを発見した。教材本文から記号を除き、compilerへ未対応インライン強調の拒否Gateを追加したうえで、Slide 1の2 viewportを更新・原寸再確認した

| 画面         | Viewport | Baseline SHA-256                                                   | Text切れ／重なり | 右端／下端 | CTA／案内                  | 判定 |
| ------------ | -------- | ------------------------------------------------------------------ | ---------------- | ---------- | -------------------------- | ---- |
| Slide 1      | 1280x720 | `b9121dc1840b2c346f41072e54718e6e1da2e4873f3a04edcde21dd7f5ca939b` | なし             | 安全       | 次Slideが明瞭              | 承認 |
| Slide 2      | 1280x720 | `39964e30ae932960a7cf7e7bb7eaa6ab1b68132110c23ff39e5d95c71f50a40b` | なし             | 安全       | 前後導線が明瞭             | 承認 |
| Slide 3      | 1280x720 | `8d22893ce3745afcdee7638eddab35aea079a25130eff6cd2e08e869e2018022` | なし             | 安全       | 前後導線が明瞭             | 承認 |
| Slide 4      | 1280x720 | `506ab40632c04655885041a94227d86c695169aa2edd43f43ca529135114f41d` | なし             | 安全       | 演習導線が明瞭             | 承認 |
| Slide 1      | 390x844  | `b0662bb62aa9751b8de36e343c57df30cc5895a98a0152a53dfee4d58f4aa351` | なし             | 安全       | 次Slideが明瞭              | 承認 |
| Slide 2      | 390x844  | `415679a7257f40ffce49b28daaa36d1c4541ac8ecdb1eac05d8d27aafdcc1d3d` | なし             | 安全       | Code横Scroll案内が明瞭     | 承認 |
| Slide 3      | 390x844  | `559c4ae8888555febe87dbed2d695adc241b4821b0c2b79e92aa50f9e2499bc7` | なし             | 安全       | Code横Scroll案内が明瞭     | 承認 |
| Slide 4 上端 | 390x844  | `9d13d20f2414aea1147f4883f92205a436a614d631a12b8bb4fccad12efb6b03` | なし             | 安全       | Stage救済Scroll可能        | 承認 |
| Slide 4 下端 | 390x844  | `0182bc9cab38f5893fc261cbf25e0c309b7a188d3840b28d3b9aa0659eb36c37` | なし             | 安全       | 完了Card／Pagerが明瞭      | 承認 |
| Exercise     | 1280x720 | `1fbf1e813b6187c59b2bc9d7d1429e0278191374424139119718cbc950271f2e` | なし             | 安全       | Preview／Reset／判定が明瞭 | 承認 |
| PC案内       | 390x844  | `21223a86e0449db9393f389c2a5e1327321411b16a2246fb76ee25d85772f51b` | なし             | 安全       | URL copy／書き出しが明瞭   | 承認 |
| Error        | 1280x720 | `7e17d48b9e8a92f82444ce593bdbc4531cd9cee6532a5b8745589b0e1414a836` | なし             | 安全       | コードを直すが明瞭         | 承認 |
| Hint         | 1280x720 | `0140a97d811467bb6aa27adcb4c717b0e7178b5ef42e76db92c00ebceb55976b` | なし             | 安全       | 段階開示が明瞭             | 承認 |
| Reset        | 1280x720 | `ba36195861cefbb3b5325974e743d0429f95a34ac4e77e53a46a40a4fc0c4755` | なし             | 安全       | 続行／復元の主従が明瞭     | 承認 |

## JavaScript Core Runtime／Console追加証跡

- 確認日: `2026-08-05`
- 対象source: 本証跡とbaselineを含むTask 6 commit
- Production artifact SHA-256: `38be0f65d89f10a4854b32ef883c32eca9787ba5b38e493894a622e2228ceab0`
- Visual baseline tree SHA-256: `905a7e2b8cd881439ac5a051ae24c3157139c2c58c8e48f873767ba50c51eb86`
- 自動Gate: Chromiumの全visual regression `53/53`、3 EngineのJavaScript Browser／Accessibility／Security／Responsive `148 passed / 2 skipped / 0 failed / retry 0`
- Responsive境界: 1280x720ではDocument、Stage、Workspaceを外側Scrollなしで維持し、Console 100件だけをConsole panel内の`overflow-y: auto`へ閉じ込めた。768x1024と390x844では編集UIを出さず、PC案内へ切り替えた
- 原寸目視: 下記4画像を原寸で確認し、Text切れ、重なり、横はみ出し、右端／下端欠け、誤ったCTA、現在結果と前回結果の誤認を0件とした

| 画面            | Viewport | Baseline SHA-256                                                   | Console境界                       | Editor／診断／CTA      | 判定 |
| --------------- | -------- | ------------------------------------------------------------------ | --------------------------------- | ---------------------- | ---- |
| 画面出力        | 1280x720 | `01b5f320ade3d5c18f0a6748c9f12701a553b6e05afaf14cabbdbc67cdc4316d` | 対象外                            | 重なり・欠けなし       | 承認 |
| Console空状態   | 1280x720 | `15938db17785af6b36ce002a30ff8faf9e25009f329d3862edac28cdcd7ecdd9` | 空状態案内がpanel内へ収まる       | 重なり・欠けなし       | 承認 |
| Console 100件   | 1280x720 | `3217abc8d342bb5f9a70f3e2734ed2a44bf7e9ddbb082cc7e1a3c842222a0faf` | panel内だけ縦Scroll、Document固定 | 重なり・欠けなし       | 承認 |
| 前回成功Console | 1280x720 | `f29e3fc6cfd620792d46bbc17ed8e803e861ddba56d7277c187687790341dc29` | `前回成功時`と`前回の記録`を明示  | 現在のsyntax診断と両立 | 承認 |

## 指摘と解消

1. 学習画面の共用領域をFocus Shellへ再編し、Tool Rail、Stage、Action RailをDocument高へ収めた。Chrome実測1470x801ではSlide／ExerciseともDocument 801px内に収まった。
2. 常設Footerと大きな見出し帯を学習画面から外し、コース復帰、Lesson名、一覧、用語、自動保存を45pxのTool Railへ集約した。
3. Slide本文を1画面単位へ圧縮し、1024x768、1280x720、1440x900、1470x801を3 Engineで検証した。低い画面だけStage内救済Scrollを許可した。
4. PC Exerciseを工程票、CodeMirror、Previewの3ペインへ整理し、初期コードを触らなくてもPreviewが表示されることを3 Engineで確認した。
5. 200%相当の640x360ではStage内救済Scroll、編集不能幅ではPC案内へ切り替え、主要CTAと親境界の衝突がないことを追加診断で確認した。

未解消の視覚指摘は0件。
