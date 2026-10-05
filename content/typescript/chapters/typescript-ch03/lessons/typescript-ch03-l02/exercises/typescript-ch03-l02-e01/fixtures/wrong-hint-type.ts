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
console.log(hintLength({ hint: 2 }));
console.log(hintLength({}));
console.log(hintLength({ hint: '' }));
