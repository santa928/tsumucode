import { isInteractiveStateWorkspace } from './interactiveStateScaffold';
import { isPropsWorkspace } from './propsCardScaffold';
import { isStaticComponentsWorkspace } from './staticComponentsScaffold';
import { isControlledFormWorkspace } from './controlledFormScaffold';

/** RuntimeのprofileとImportを含む全Sourceを照合する。未知profileは受理しない。 */
export function isReactWorkspace(
  files: Readonly<Record<string, string>>,
  profile: unknown,
): boolean {
  if (profile === 'controlled-form-v1') return isControlledFormWorkspace(files);
  if (profile === 'interactive-state-v1') return isInteractiveStateWorkspace(files);
  if (profile === 'props-card-v1') return isPropsWorkspace(files);
  if (profile === 'static-components-v1') return isStaticComponentsWorkspace(files);
  return false;
}
