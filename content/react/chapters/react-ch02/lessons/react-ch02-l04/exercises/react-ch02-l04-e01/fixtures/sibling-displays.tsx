import { useState } from 'react';
type CelsiusProps = { readonly value: number; };
type FahrenheitProps = { readonly converted: number; };
function Celsius({ value }: CelsiusProps) { return <p><span id="celsius">{value}</span> ℃</p>; }
const Fahrenheit = ({ converted }: FahrenheitProps) => <p><span id="fahrenheit">{converted}</span> ℉</p>;
export function App() {
  const [degrees, setDegrees] = useState(20);
  const fahrenheit = degrees * 9 / 5 + 32;
  return <section><h1>温度表示</h1><Celsius value={degrees} /><Fahrenheit converted={fahrenheit} />
    <button id="increase" type="button" onClick={() => setDegrees(degrees + 1)}>1℃上げる</button>
    <button id="decrease" type="button" onClick={() => setDegrees(degrees - 1)}>1℃下げる</button>
    <button id="reset" type="button" onClick={() => setDegrees(20)}>最初に戻す</button></section>;
}
