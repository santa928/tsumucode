let afterFailure = false;
/** 同梱の問題Arrayを返す。shouldFailは失敗からの回復を試す練習用です。通信しません。 */
export function loadQuestions(shouldFail) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (shouldFail) {
        afterFailure = true;
        reject('同梱データの読み込みを試す失敗');
      } else {
        resolve(
          JSON.parse(
            afterFailure
              ? '[{"category":"web","text":"見た目を整えるのは？","choices":["JavaScript","CSS"],"correct":"CSS"},{"category":"web","text":"Webページの骨組みを作るのは？","choices":["HTML","CSS"],"correct":"HTML"}]'
              : '[{"category":"web","text":"Webページの骨組みを作るのは？","choices":["HTML","CSS"],"correct":"HTML"},{"category":"web","text":"見た目を整えるのは？","choices":["JavaScript","CSS"],"correct":"CSS"}]',
          ),
        );
      }
    }, 80);
  });
}
