import { useState } from 'react';
import type { Topic } from './types';

export function App() {
  const [topics, setTopics] = useState<readonly Topic[]>([
    { id: 'html', label: 'HTML' },
    { id: 'css', label: 'CSS' },
  ]);

  function add() {
    setTopics((current) => [
      ...current.filter((item) => item.id !== 'js'),
      { id: 'js', label: 'JS' },
    ]);
  }

  function remove() {
    setTopics((current) => current.filter((item) => item.id !== 'html'));
  }

  function reverse() {
    setTopics((current) => current.reverse());
  }

  function removeJS() {
    setTopics((current) => current.filter((item) => item.id !== 'js'));
  }

  return (
    <section>
      <h1>学習テーマ</h1>
      <button id="add" onClick={add}>
        JSを追加
      </button>
      <button id="remove" onClick={remove}>
        HTMLを削除
      </button>
      <button id="reverse" onClick={reverse}>
        逆順にする
      </button>
      <button id="remove-js" onClick={removeJS}>
        JSを削除
      </button>
      <ul id="topics">
        {topics.map((item) => (
          <li key={item.id} data-id={item.id}>
            {item.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
