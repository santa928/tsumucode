interface Feedback {
  hint?: string;
}
function hintLength(feedback: Feedback) {
  if (feedback.hint === undefined) return 'ヒントなし';
  return feedback.hint.length;
}
console.log(hintLength({ hint: '見る' }));
console.log(hintLength({}));
console.log(hintLength({ hint: '' }));
