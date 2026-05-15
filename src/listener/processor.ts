import type { AgoraGroup, AgoraMessage } from '../shared/types.js';
import { getGroupState, rememberProcessed, type ListenerStateStore } from './state.js';
import { redactSensitive } from './redaction.js';

export type BootstrapMode = 'latest' | 'replay';

export interface AgoraListenerClient {
  listGroups(profileId: string): Promise<AgoraGroup[]>;
  listGroupMessages(profileId: string, groupId: string, after?: string | null): Promise<AgoraMessage[]>;
  postGroupMessage(profileId: string, groupId: string, text: string, options?: { replyTo?: string | null; metadata?: Record<string, unknown> }): Promise<void>;
  updateStatus(profileId: string, status: 'online' | 'idle' | 'blocked', note: string): Promise<void>;
}

export interface ProfileTaskRunnerInput {
  profileId: string;
  group: AgoraGroup;
  taskMessage: AgoraMessage;
  prompt: string;
}

export interface ProfileTaskRunnerResult {
  ok: boolean;
  output: string;
}

export type ProfileTaskRunner = (input: ProfileTaskRunnerInput) => Promise<ProfileTaskRunnerResult>;

export interface AgoraTaskListenerOptions {
  client: AgoraListenerClient;
  stateStore: ListenerStateStore;
  runner: ProfileTaskRunner;
  profiles: string[];
  groups?: string[];
  bootstrapMode?: BootstrapMode;
  maxMessagesPerGroup?: number;
}

export interface ListenerTickResult {
  processed: number;
  skipped: number;
  bootstrapped: number;
  errors: Array<{ profileId: string; groupId?: string; error: string }>;
}

const TASK_PATTERN = /^TASK\s+([A-Za-z0-9][A-Za-z0-9._-]{1,80})\b/i;

export class AgoraTaskListener {
  private readonly profiles: string[];
  private readonly groupFilter: Set<string> | null;
  private readonly bootstrapMode: BootstrapMode;
  private readonly maxMessagesPerGroup: number;

  constructor(private readonly options: AgoraTaskListenerOptions) {
    this.profiles = [...new Set(options.profiles.map((profile) => profile.trim().toLowerCase()).filter(Boolean))];
    if (this.profiles.length === 0) throw new Error('At least one listener profile is required');
    const groups = options.groups?.map((group) => group.trim().toLowerCase()).filter(Boolean) ?? [];
    this.groupFilter = groups.length > 0 ? new Set(groups) : null;
    this.bootstrapMode = options.bootstrapMode ?? 'latest';
    this.maxMessagesPerGroup = Math.min(Math.max(options.maxMessagesPerGroup ?? 50, 1), 200);
  }

  async tick(): Promise<ListenerTickResult> {
    const state = await this.options.stateStore.load();
    const result: ListenerTickResult = { processed: 0, skipped: 0, bootstrapped: 0, errors: [] };

    for (const profileId of this.profiles) {
      let groups: AgoraGroup[];
      try {
        groups = await this.options.client.listGroups(profileId);
      } catch (error) {
        result.errors.push({ profileId, error: (error as Error).message });
        continue;
      }

      for (const group of groups.filter((item) => !this.groupFilter || this.groupFilter.has(item.id))) {
        const groupState = getGroupState(state, profileId, group.id);
        let messages: AgoraMessage[];
        try {
          messages = await this.options.client.listGroupMessages(profileId, group.id, groupState.cursor).then((items) => items.slice(-this.maxMessagesPerGroup));
        } catch (error) {
          result.errors.push({ profileId, groupId: group.id, error: (error as Error).message });
          continue;
        }

        if (!groupState.initialized && this.bootstrapMode === 'latest') {
          for (const msg of messages) rememberProcessed(groupState, msg.id);
          groupState.initialized = true;
          result.bootstrapped += messages.length;
          await this.options.stateStore.save(state);
          continue;
        }
        groupState.initialized = true;

        for (const msg of messages) {
          if (groupState.processedMessageIds.includes(msg.id)) {
            result.skipped += 1;
            continue;
          }
          if (!isActionableTaskForProfile(msg, profileId)) {
            rememberProcessed(groupState, msg.id);
            await this.options.stateStore.save(state);
            result.skipped += 1;
            continue;
          }

          const taskId = extractTaskId(msg.text) ?? msg.id;
          await this.processTask(profileId, group, msg, taskId, result);
          rememberProcessed(groupState, msg.id);
          await this.options.stateStore.save(state);
        }
      }
    }

    await this.options.stateStore.save(state);
    return result;
  }

  private async processTask(profileId: string, group: AgoraGroup, msg: AgoraMessage, taskId: string, result: ListenerTickResult): Promise<void> {
    await this.safeStatus(profileId, 'online', `Procesando ${taskId} en ${group.name}`);
    const prompt = buildHermesPrompt(profileId, group, msg, taskId);
    try {
      const run = await this.options.runner({ profileId, group, taskMessage: msg, prompt });
      const text = run.ok ? sanitizeAgentOutput(run.output) : blockedText(taskId, profileId, run.output);
      await this.options.client.postGroupMessage(profileId, group.id, text, {
        replyTo: msg.id,
        metadata: { listener: 'agora-listener', sourceMessageId: msg.id, taskId, ok: run.ok }
      });
      await this.safeStatus(profileId, run.ok ? 'idle' : 'blocked', run.ok ? `DONE ${taskId}` : `BLOCKED ${taskId}`);
      result.processed += 1;
    } catch (error) {
      const text = blockedText(taskId, profileId, (error as Error).message);
      try {
        await this.options.client.postGroupMessage(profileId, group.id, text, {
          replyTo: msg.id,
          metadata: { listener: 'agora-listener', sourceMessageId: msg.id, taskId, ok: false }
        });
      } catch (postError) {
        result.errors.push({ profileId, groupId: group.id, error: `Failed to publish BLOCKED: ${(postError as Error).message}` });
      }
      await this.safeStatus(profileId, 'blocked', `BLOCKED ${taskId}`);
      result.processed += 1;
    }
  }

  private async safeStatus(profileId: string, status: 'online' | 'idle' | 'blocked', note: string): Promise<void> {
    try {
      await this.options.client.updateStatus(profileId, status, note.slice(0, 240));
    } catch {
      // Status updates are operational telemetry; message handling should continue if they fail.
    }
  }
}

export function isActionableTaskForProfile(message: AgoraMessage, profileId: string): boolean {
  const normalizedProfileId = profileId.trim().toLowerCase();
  if (message.author.profileId.trim().toLowerCase() === normalizedProfileId) return false;
  if (isListenerResult(message)) return false;
  const targetRead = readTargetProfileIds(message.metadata);
  if (targetRead.present && !targetRead.valid) return false;
  if (targetRead.targets.length > 0 && !targetRead.targets.includes(normalizedProfileId)) return false;
  return TASK_PATTERN.test(message.text.trim());
}

export function extractTaskId(text: string): string | null {
  return text.trim().match(TASK_PATTERN)?.[1] ?? null;
}

function readTargetProfileIds(metadata: AgoraMessage['metadata']): { present: boolean; valid: boolean; targets: string[] } {
  if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, 'targetProfileIds')) return { present: false, valid: true, targets: [] };
  const value = metadata.targetProfileIds;
  if (!Array.isArray(value)) return { present: true, valid: false, targets: [] };
  const targets: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') return { present: true, valid: false, targets: [] };
    const target = item.trim().toLowerCase();
    if (!target) return { present: true, valid: false, targets: [] };
    if (!seen.has(target)) {
      seen.add(target);
      targets.push(target);
    }
  }
  return { present: true, valid: targets.length > 0, targets };
}

function isListenerResult(message: AgoraMessage): boolean {
  const metadata = message.metadata;
  if (metadata?.listener !== 'agora-listener') return false;
  const statusResult = /^(DONE|BLOCKED|QA)\b/i.test(message.text.trim());
  return statusResult && typeof metadata.sourceMessageId === 'string' && typeof metadata.taskId === 'string' && typeof metadata.ok === 'boolean';
}

export function buildHermesPrompt(profileId: string, group: AgoraGroup, message: AgoraMessage, taskId: string): string {
  const groupMembers = [...group.memberProfileIds].sort().join(', ');
  return [
    `TASK ${taskId} recibido en Hermes Agora.`,
    `Perfil receptor: ${profileId}.`,
    `Grupo: ${group.name} (${group.id}).`,
    `Miembros del grupo: ${groupMembers}.`,
    `Autor: ${message.author.displayName} (${message.author.profileId}).`,
    '',
    'Mensaje original:',
    message.text,
    '',
    'Instrucciones:',
    '- Responde en español.',
    '- Usa protocolo DONE / BLOCKED / QA.',
    '- Si no puedes completar la tarea con seguridad, responde BLOCKED con motivo breve.',
    '- No reveles secretos ni tokens.',
    '- Devuelve una respuesta final breve para publicar en el grupo.',
    '',
    'Capacidad de coordinación por Agora:',
    '- Si la tarea pide explícitamente coordinar, delegar o pedir respuesta a otros perfiles, puedes publicar nuevos TASK en este mismo grupo de Agora.',
    '- Usa solo las variables de entorno HERMES_AGORA_URL y HUB_AGENT_TOKEN; nunca imprimas ni pegues el token.',
    `- Endpoint: POST $HERMES_AGORA_URL/api/v1/groups/${group.id}/messages con headers Authorization: Bearer $HUB_AGENT_TOKEN X-Hermes-Profile: ${profileId}, Content-Type: application/json.`,
    '- Para dirigir una tarea a perfiles concretos, envía JSON con metadata.targetProfileIds, por ejemplo: {"text":"TASK <id> — ...","metadata":{"targetProfileIds":["daneel-cto"]}}.',
    '- Evita bucles: no conviertas respuestas DONE/BLOCKED/QA en nuevos TASK salvo que el humano lo pida explícitamente.',
    '',
    'Capacidad de proyectos / kanban por Agora:',
    `- Puedes leer proyectos visibles: GET $HERMES_AGORA_URL/api/v1/projects con Authorization: Bearer $HUB_AGENT_TOKEN y X-Hermes-Profile: ${profileId}.`,
    '- Puedes leer tareas: GET $HERMES_AGORA_URL/api/v1/projects/<projectId>/tasks.',
    '- Puedes crear tareas: POST $HERMES_AGORA_URL/api/v1/projects/<projectId>/tasks con {"title":"...","description":"...","assigneeProfileIds":["..."]}.',
    '- Puedes mover tareas: PATCH $HERMES_AGORA_URL/api/v1/projects/<projectId>/tasks/<taskId> con {"status":"backlog|todo|in_progress|review|blocked|done"}.',
    '- Puedes documentar tareas: POST $HERMES_AGORA_URL/api/v1/projects/<projectId>/tasks/<taskId>/documents con {"kind":"note|result|blocker|qa","body":"..."}.',
    '- Puedes leer/actualizar whiteboards: GET/PATCH $HERMES_AGORA_URL/api/v1/projects/<projectId>/tasks/<taskId>/whiteboard con trazos/formas {kind:"rectangle|circle|arrow|freehand", points:[...]}.',
    '- Si el perfil tiene el MCP hermes-agora-whiteboard habilitado, prefiere sus tools agora_list_projects/agora_list_tasks/agora_set_task_whiteboard_shapes para crear esquemas visuales sin manipular JSON a mano.',
    '- No inventes projectId/taskId: lee primero la lista si no aparece claramente en el TASK.'
  ].join('\n');
}

function sanitizeAgentOutput(output: string): string {
  const trimmed = redactSensitive(output.trim());
  if (!trimmed) return 'BLOCKED AGORA-LISTENER — el perfil no devolvió contenido.';
  return trimmed.length > 6000 ? `${trimmed.slice(0, 5990)}…` : trimmed;
}

function blockedText(taskId: string, profileId: string, reason: string): string {
  const safeReason = redactSensitive(reason).trim().replace(/\s+/g, ' ').slice(0, 600) || 'error desconocido';
  return `BLOCKED ${taskId} — ${profileId} — ${safeReason}`;
}
