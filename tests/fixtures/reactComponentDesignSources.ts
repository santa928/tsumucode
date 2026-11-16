/** 所有者・命名・変換位置を変えた温度課題の正例。完成例をUI評価者へ渡さない。 */
export const appOwnsTemperature = `import { useState } from 'react';
interface ReadingProps { readonly degrees: number; }
function Reading({ degrees }: ReadingProps) {
  const converted = degrees * 9 / 5 + 32;
  return <section><p>摂氏 <span id="celsius">{degrees}</span> ℃</p>
    <p>華氏 <span id="fahrenheit">{converted}</span> ℉</p></section>;
}
export function App() {
  const [temperature, changeTemperature] = useState(20);
  function raise() { changeTemperature(temperature + 1); }
  return <section><h1>温度表示</h1><Reading degrees={temperature} />
    <button id="increase" type="button" onClick={raise}>1℃上げる</button>
    <button id="decrease" type="button" onClick={() => changeTemperature(previous => previous - 1)}>1℃下げる</button>
    <button id="reset" type="button" onClick={() => changeTemperature(20)}>最初に戻す</button></section>;
}`;

export const panelOwnsTemperature = `import { useState as remember } from 'react';
type NumberProps = { readonly amount: number; readonly marker: string; readonly unit: string; };
const NumberView = (props: NumberProps) => <p><span id={props.marker}>{props.amount}</span> {props.unit}</p>;
interface ActionProps { readonly rise: () => void; readonly fall: () => void; readonly restart: () => void; }
function Buttons({ rise, fall, restart }: ActionProps) {
  return <div><button id="increase" type="button" onClick={rise}>1℃上げる</button>
    <button id="decrease" type="button" onClick={fall}>1℃下げる</button>
    <button id="reset" type="button" onClick={restart}>最初に戻す</button></div>;
}
const ForwardButtons = (props: ActionProps) => <Buttons rise={props.rise} fall={props.fall} restart={props.restart} />;
function Thermometer() {
  const [reading, update] = remember<number>(20);
  const fahrenheit = 32 + reading * 9 / 5;
  const increase = () => update(current => current + 1);
  function decrease() { update(reading - 1); }
  return <section><h1>温度表示</h1><NumberView amount={reading} marker="celsius" unit="℃" />
    <NumberView amount={fahrenheit} marker="fahrenheit" unit="℉" />
    <ForwardButtons rise={increase} fall={decrease} restart={() => update(20)} /></section>;
}
export function App() { return <Thermometer />; }
`;

export const siblingDisplays = `import { useState } from 'react';
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
}`;

export const unusedDisplay = appOwnsTemperature.replace(
  '<Reading degrees={temperature} />',
  '<p>摂氏 <span id="celsius">{temperature}</span> ℃</p><p>華氏 <span id="fahrenheit">{temperature * 9 / 5 + 32}</span> ℉</p>',
);

export const dummyState = appOwnsTemperature.replace(
  '<Reading degrees={temperature} />',
  '<Reading degrees={20} />',
);

export const oneSideFrozen = appOwnsTemperature.replace('{converted}', '{68}');

/** Reset自身は戻るが、その後の更新幅だけを0にしてしまう負例。 */
export const frozenAfterReset = appOwnsTemperature
  .replace('function raise() {', 'const [step, setStep] = useState(1);\n  function raise() {')
  .replace('temperature + 1', 'temperature + step')
  .replace('previous - 1', 'previous - step')
  .replace('() => changeTemperature(20)', '() => { changeTemperature(20); setStep(0); }');

/** Resetの値そのものを誤る別の負例。 */
export const brokenReset = appOwnsTemperature.replace(
  'changeTemperature(20)',
  'changeTemperature(0)',
);
