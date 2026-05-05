export type ComposerAction = 'NONE' | 'TASK' | 'DONE' | 'BLOCKED' | 'QA';

export const ACTION_OPTIONS: Array<{ value: ComposerAction; label: string; hint: string }> = [
  { value: 'NONE', label: 'Mensaje', hint: 'Mensaje libre sin protocolo' },
  { value: 'TASK', label: 'TASK', hint: 'Nueva tarea accionable para agentes' },
  { value: 'DONE', label: 'DONE', hint: 'Resultado completado' },
  { value: 'BLOCKED', label: 'BLOCKED', hint: 'Bloqueo con motivo' },
  { value: 'QA', label: 'QA', hint: 'Revisión o validación' }
];

const ACTION_PREFIX_PATTERN = /^(TASK|DONE|BLOCKED|QA)\b/i;

export function applyComposerAction(action: ComposerAction, draft: string): string {
  const text = draft.trim();
  if (!text) return '';
  if (action === 'NONE' || ACTION_PREFIX_PATTERN.test(text)) return text;
  return `${action} ${text}`;
}

export function toggleMemberSelection(current: string[], profileId: string, checked: boolean): string[] {
  const normalized = profileId.trim().toLowerCase();
  if (!normalized) return current;
  if (checked) return current.includes(normalized) ? current : [...current, normalized];
  return current.filter((id) => id !== normalized);
}
