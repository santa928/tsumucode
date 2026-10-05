// @ts-ignore
interface Feedback {
  hint?: string;
}
function hintLength(feedback: Feedback) {
  if (feedback.hint !== undefined) {
    return feedback.hint.length;
  } else {
    return 'ヒントなし';
  }
}
console.log(hintLength({ hint: '見る' }));
console.log(hintLength({}));
console.log(hintLength({ hint: '' }));
