const trigger = document.querySelector('#open');
function openBook() {
  document.querySelector('#status').textContent = '本を開きました';
}
trigger.addEventListener('click', openBook);
