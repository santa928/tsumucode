interface Feedback {
  hint?: string;
}
function hintLength(feedback: Feedback) {
  if (typeof feedback.hint === 'string') return feedback.hint.length;
  return 'ヒントなし';
}
console.log(hintLength({ hint: '見る' }));
console.log(hintLength({}));
console.log(hintLength({ hint: '' }));
