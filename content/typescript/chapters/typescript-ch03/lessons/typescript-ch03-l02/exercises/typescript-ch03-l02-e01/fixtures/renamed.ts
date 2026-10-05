interface Entry {
  hint?: string;
}
function describe(item: Entry) {
  if (item.hint !== undefined) {
    return item.hint.length;
  } else {
    return 'ヒントなし';
  }
}
console.log(describe({ hint: '見る' }));
console.log(describe({}));
console.log(describe({ hint: '' }));
