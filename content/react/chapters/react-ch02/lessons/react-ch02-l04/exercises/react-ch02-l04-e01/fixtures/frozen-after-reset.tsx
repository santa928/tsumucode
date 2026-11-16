import { useState } from 'react';
interface ReadingProps { readonly degrees: number; }
function Reading({ degrees }: ReadingProps) {
  const converted = degrees * 9 / 5 + 32;
  return <section><p>摂氏 <span id="celsius">{degrees}</span> ℃</p>
    <p>華氏 <span id="fahrenheit">{converted}</span> ℉</p></section>;
}
export function App() {
  const [temperature, changeTemperature] = useState(20);
  const [step, setStep] = useState(1);
  function raise() { changeTemperature(temperature + step); }
  return <section><h1>温度表示</h1><Reading degrees={temperature} />
    <button id="increase" type="button" onClick={raise}>1℃上げる</button>
    <button id="decrease" type="button" onClick={() => changeTemperature(previous => previous - step)}>1℃下げる</button>
    <button id="reset" type="button" onClick={() => { changeTemperature(20); setStep(0); }}>最初に戻す</button></section>;
}
