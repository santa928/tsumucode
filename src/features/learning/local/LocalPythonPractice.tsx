import { LocalPythonPracticeClient } from '../../../adapters/runtime/local/LocalPythonPracticeClient';
import { PythonPracticePanel } from '../components/PythonPracticePanel';
import type { PythonPracticePanelProps } from '../localRuntime';

const createClient = () => new LocalPythonPracticeClient();
export function LocalPythonPractice(props: PythonPracticePanelProps) {
  return (
    <PythonPracticePanel
      {...props}
      createClient={createClient}
      engineName="CPython"
      calculationSeconds={5}
    />
  );
}
