import { useState as remember } from 'react';
type NumberProps = { readonly amount: number; readonly marker: string; readonly unit: string };
const NumberView = (props: NumberProps) => (
  <p>
    <span id={props.marker}>{props.amount}</span> {props.unit}
  </p>
);
interface ActionProps {
  readonly rise: () => void;
  readonly fall: () => void;
  readonly restart: () => void;
}
function Buttons({ rise, fall, restart }: ActionProps) {
  return (
    <div>
      <button id="increase" type="button" onClick={rise}>
        1℃上げる
      </button>
      <button id="decrease" type="button" onClick={fall}>
        1℃下げる
      </button>
      <button id="reset" type="button" onClick={restart}>
        最初に戻す
      </button>
    </div>
  );
}
const ForwardButtons = (props: ActionProps) => (
  <Buttons rise={props.rise} fall={props.fall} restart={props.restart} />
);
function Thermometer() {
  const [reading, update] = remember<number>(20);
  const fahrenheit = 32 + (reading * 9) / 5;
  const increase = () => update((current) => current + 1);
  function decrease() {
    update(reading - 1);
  }
  return (
    <section>
      <h1>温度表示</h1>
      <NumberView amount={reading} marker="celsius" unit="℃" />
      <NumberView amount={fahrenheit} marker="fahrenheit" unit="℉" />
      <ForwardButtons rise={increase} fall={decrease} restart={() => update(20)} />
    </section>
  );
}
export function App() {
  return <Thermometer />;
}
