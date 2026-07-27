/** 初期Hashに必要なMode entryだけを読み、Library直リンクのRuntime境界を守る。 */
import { resolveInitialAppMode } from '@/app/initialMode';
import '@/design-system/base.css';

if (import.meta.env.DEV) {
  if (resolveInitialAppMode(location.hash) === 'library') {
    void import('@/app/libraryEntry');
  } else {
    void import('@/app/normalLearningEntry');
  }
}
