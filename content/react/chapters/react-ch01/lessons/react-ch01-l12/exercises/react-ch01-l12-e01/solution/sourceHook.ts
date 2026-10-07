import { useEffect, useState } from 'react';
import { subscribe } from './source';
import type { SourceId } from './types';
/** 外部入力の現在値を、このHook呼出し固有のStateとして返す。 */
export function useSourceValue(target: SourceId) {
  const [value, setValue] = useState('');
  useEffect(() => {
    const stop = subscribe(target, setValue);
    return stop;
  }, [target]);
  return value;
}
