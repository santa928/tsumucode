interface Feedback {
  hint?: string;
}
function hintLength(feedback: Feedback) {
  return feedback.hint !== undefined ? feedback.hint.length : 'ヒントなし';
}
console.log(hintLength({ hint: '見る' }));
console.log(hintLength({}));
console.log(hintLength({ hint: '' }));
