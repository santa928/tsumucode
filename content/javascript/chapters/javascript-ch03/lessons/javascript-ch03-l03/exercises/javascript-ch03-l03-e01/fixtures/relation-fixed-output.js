const courseName = 'JavaScript';
const lessonName = 'Scope';
function unused() {
  const lessonName = 'unused';
}
function showLabels() {
  console.log(courseName);
  console.log(lessonName);
}
showLabels();
