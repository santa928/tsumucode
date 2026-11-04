import {
  BrowserPythonPracticeClient,
  supportsBrowserPythonPractice,
} from '../../../adapters/runtime/python/BrowserPythonPracticeClient';
import { loadPythonCore } from '../../../adapters/runtime/python/loadPythonCore';
import { PythonPracticePanel } from './PythonPracticePanel';
import type { PythonPracticePanelProps } from '../localRuntime';

const createClient = () => new BrowserPythonPracticeClient(loadPythonCore);
export function BrowserPythonPractice(props: PythonPracticePanelProps) {
  if (!supportsBrowserPythonPractice())
    return (
      <p>
        このブラウザでは実行途中の入力に未対応です。上の事前入力でプレビューできます。対話練習には対応するChromiumを使ってください。
      </p>
    );
  return (
    <PythonPracticePanel
      {...props}
      createClient={createClient}
      engineName="Pyodide"
      calculationSeconds={1.5}
    />
  );
}
