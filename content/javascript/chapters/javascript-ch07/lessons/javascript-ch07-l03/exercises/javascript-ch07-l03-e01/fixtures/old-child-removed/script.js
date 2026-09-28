const list = document.querySelector('#books');
const item = document.createElement('li');
item.textContent = '次に読む本';
list.textContent = '';
list.appendChild(item);
