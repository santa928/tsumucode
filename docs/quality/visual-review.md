# World-A Visual Review

- releaseStatus: `approved`
- reviewedScreens: `20`
- slideLibraryReviewedScreens: `10`
- unresolvedFindings: `0`
- finalArtifactReviewed: `true`
- reviewedAt: `2026-07-20`
- verifiedSourceCommit: `draft`
- canonicalDistSha256: `draft`
- reviewBaseCommit: `draft`
- baselineSet: `tests/e2e/visual-regression.spec.ts-snapshots`
- verification: `/tsumucode/` canonical distでChromium 22件（標準20画面＋低画面高診断2画面）をretry 0・差分なしで再実行した。既存承認済み標準20枚と代表診断画像の記録に加え、Task 7では更新対象のExercise desktop 2枚と診断2枚を原寸目視した
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
| Home       | 1440x900 | `c0f89aaf7956b7ada9e36bf48fa992753da07729f031e2ab2b7dd7d6e80ae456` | 一致   | なし     | なし   | 安全       | 最初のピースが明瞭         | 共通契約確認       | 対象外                 | 承認 |
| Home       | 1280x720 | `4cc2a87c18af619c6545e13c9947b379237f8881cfc23b0a4272c2fa7a2eb94c` | 一致   | なし     | なし   | 安全       | 最初のピースが明瞭         | 共通契約確認       | 対象外                 | 承認 |
| Home       | 768x1024 | `729a791fea9c83fc101731a917133c6b3f55efa995a9b5c88bc269a3b4b6b64a` | 一致   | なし     | なし   | 安全       | 教材CTAが明瞭              | 共通契約確認       | 対象外                 | 承認 |
| Home       | 390x844  | `6aa057a5705749cc4d6ddf5c1ce1710a60f5310d2a7d68e8629cabb31793f6ca` | 一致   | なし     | なし   | 安全       | 1列導線が明瞭              | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 1440x900 | `6bbc45671f696b0270e19cff5465da104a8c287a671ac09ae133beef2a2c552f` | 一致   | なし     | なし   | 安全       | 最初のLessonが明瞭         | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 1280x720 | `6488975baf6914d5d8eab82ac24abf419619467afe80e32a0d0899fb0b1521d8` | 一致   | なし     | なし   | 安全       | 最初のLessonが明瞭         | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 768x1024 | `cc891a01b318c8666321f096646a4ce0d16384a45da9ea6a9610ab6b1e2e1914` | 一致   | なし     | なし   | 安全       | 学習順序が明瞭             | 共通契約確認       | 対象外                 | 承認 |
| Course Map | 390x844  | `73307ab0e910263e83b77bca124270006eca681b9449486c2cb875d0d5ac432b` | 一致   | なし     | なし   | 安全       | 1列の学習順序が明瞭        | 共通契約確認       | 対象外                 | 承認 |
| Slide      | 1440x900 | `e10e7a75f559cd2dca203701065b3a72a626849164c532a663cc9d7665a3eb70` | 一致   | なし     | なし   | 安全       | Tool Rail／前後導線が明瞭  | 矢印key契約確認    | 対象外                 | 承認 |
| Slide      | 1280x720 | `4dfcea9bd4f9f543e9fdc6d367900e1c722127e8ce4d29b476b60e590adb946d` | 一致   | なし     | なし   | 安全       | Tool Rail／前後導線が明瞭  | 矢印key契約確認    | 対象外                 | 承認 |
| Slide      | 768x1024 | `483b0b241a940bcf38e7a27ed85cd33a7caf94d73dfc6cb186f3be88e00a464a` | 一致   | なし     | なし   | 安全       | 本文と前後導線が明瞭       | 共通契約確認       | 最終Slideで表示        | 承認 |
| Slide      | 390x844  | `2b8d146cd24a5feb55c24a5e6bbffeb243af34ab6c8ed22dd4abdd7dc87ea0e4` | 一致   | なし     | なし   | 安全       | 本文と前後導線が明瞭       | 共通契約確認       | 最終Slideで表示        | 承認 |
| Exercise   | 1440x900 | `1c2061c49e0f2495e19421e77a9b1a17bf643b622d2ff08a9916dd6b0d685a4d` | 一致   | なし     | なし   | 安全       | Preview／Reset／判定が明瞭 | Tab矢印key契約確認 | 編集可能               | 承認 |
| Exercise   | 1280x720 | `fd222764bc3d5977a4e42cf330ac1bcc69dd2a546558138f041b5d607befea4a` | 一致   | なし     | なし   | 安全       | Preview／Reset／判定が明瞭 | Tab矢印key契約確認 | 編集可能               | 承認 |
| Exercise   | 768x1024 | `34e6e96db3dca8a0234ba15c81ee32cdbe6debcd89b6bb08eb5e4f115dd0b6e4` | 一致   | なし     | なし   | 安全       | URL copy／書き出しが明瞭   | 共通契約確認       | 理由と1024px条件を明示 | 承認 |
| Exercise   | 390x844  | `719afb422d7dd22229413f11788342f977d6a5c55f8cc2440c717ad172613816` | 一致   | なし     | なし   | 安全       | 縦積みCTAが明瞭            | 共通契約確認       | 理由と1024px条件を明示 | 承認 |
| Completion | 1440x900 | `f058a4c687c4bbb36391903c706e8267f03bf4e46db2219b7350447a395b9d71` | 一致   | なし     | なし   | 安全       | 次のピースが主CTA          | 共通契約確認       | 対象外                 | 承認 |
| Completion | 1280x720 | `8eacc22fc39dc212d45447438ca84ded995c5b7224e7500bf76d60f451eb3ff0` | 一致   | なし     | なし   | 安全       | 次のピースが主CTA          | 共通契約確認       | 対象外                 | 承認 |
| Completion | 768x1024 | `c25ed089d011a982968970485230c03e05dd3a397cfa3553c37b75f341d5e92e` | 一致   | なし     | なし   | 安全       | 2 CTAが衝突しない          | 共通契約確認       | 対象外                 | 承認 |
| Completion | 390x844  | `8206dfa8dc72d6361fcd3ebba99081d05ad821a4fb6bd5b07c25a3b9a2acdf2e` | 一致   | なし     | なし   | 安全       | 縦積みCTAが明瞭            | 共通契約確認       | 対象外                 | 承認 |

## Slide Library追加証跡

- 確認日: `2026-07-26`
- 対象source: `82270cf7dd3654c1ebe9b9b71a966489fe5a3375`
- 配信条件: `BASE_PATH=/tsumucode/`のProduction build
- Viewport: 390x844、412x915、768x1024、1280x720、1440x900
- 結果: 下記10枚を原寸目視し、意図しないText切れ、重なり、横はみ出し、右端／下端の欠け、誤った文言は0件。1280x720と1440x900のViewerは1画面へ収まり、低い画面だけSlide Stage内に救済Scrollを持つ

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

## Starter Reset／診断の追加証跡

- Task 7確認日: `2026-07-22`（全体の`reviewedAt`と未確認画面の承認日は変更しない）
- `exercise-desktop-wide-chromium-linux.png`（1440x900）: Reset Triggerは見出し、file count、右端から安全余白を保ち、file tab、Preview、Action Railと重ならない。Headerは一行で、Editor高を不必要に削っていない。
- `exercise-desktop-compact-chromium-linux.png`（1280x720）: Reset Triggerを含むHeaderは折り返さず、Triggerとfile tab、Preview、Action Railの衝突や右端の欠けがない。
- 一時証跡`/tmp/tsumucode-task7-reset-drawer-1280x720.png`（1280x720、SHA-256 `a276eb6766c2d0dad9a0435c185d2a3604a88ee7b77a78e4512aeec659a13bf7`、baseline対象外）: 編集後にReset Triggerを開き、確認文、閉じる、`編集を続ける`、`最初のコードに戻す`がDrawer内へ収まり、右端／下端の欠けがないことを原寸目視した。

| 診断Baseline                                              | Viewport | Baseline SHA-256                                                   | Header／Editor／診断境界 | 世界観 | 判定 |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------ | ------------------------ | ------ | ---- |
| `exercise-diagnostics-desktop-wide-chromium-linux.png`    | 1440x900 | `4599e2466f75474310e6fd3f28205ebcfc7e1a76938d7bf917c934ff2a11b0a7` | 収まり、重なりなし       | 一致   | 承認 |
| `exercise-diagnostics-desktop-compact-chromium-linux.png` | 1280x720 | `7aa0b3b99bfab7146681a03eed709200cc48f28378a093948c56b1ebf4e9046e` | 収まり、重なりなし       | 一致   | 承認 |

## 指摘と解消

1. 学習画面の共用領域をFocus Shellへ再編し、Tool Rail、Stage、Action RailをDocument高へ収めた。Chrome実測1470x801ではSlide／ExerciseともDocument 801px内に収まった。
2. 常設Footerと大きな見出し帯を学習画面から外し、コース復帰、Lesson名、一覧、用語、自動保存を45pxのTool Railへ集約した。
3. Slide本文を1画面単位へ圧縮し、1024x768、1280x720、1440x900、1470x801を3 Engineで検証した。低い画面だけStage内救済Scrollを許可した。
4. PC Exerciseを工程票、CodeMirror、Previewの3ペインへ整理し、初期コードを触らなくてもPreviewが表示されることを3 Engineで確認した。
5. 200%相当の640x360ではStage内救済Scroll、編集不能幅ではPC案内へ切り替え、主要CTAと親境界の衝突がないことを追加診断で確認した。

未解消の視覚指摘は0件。
