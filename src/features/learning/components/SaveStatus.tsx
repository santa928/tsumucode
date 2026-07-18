import type { SaveStatus as LearningSaveStatus } from '../../../core/learning/sessionReducer';

interface SaveStatusProps {
  readonly status: LearningSaveStatus;
}

const SAVE_STATUS_LABEL: Record<LearningSaveStatus, string> = {
  idle: '自動保存オン',
  saving: '保存中',
  saved: '保存済み',
  error: '保存できません。編集内容は画面に残っています',
};

/** 自動保存の現在状態を操作可能性と一致する文言とlive roleで伝える。 */
export function SaveStatus({ status }: SaveStatusProps) {
  const isError = status === 'error';

  return (
    <p
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-save-status={status}
      className={`rounded-workshop-sm px-3 py-2 text-sm font-bold ${
        isError ? 'bg-workshop-workbench text-workshop-correction' : 'text-workshop-complete'
      }`}
    >
      {SAVE_STATUS_LABEL[status]}
    </p>
  );
}
