#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { buildWhiteboardDiagramPayload, type AgentDiagramElement } from './whiteboardPayload.js';

const TOOLS: Tool[] = [
  {
    name: 'agora_list_projects',
    description: 'Lista proyectos visibles para el perfil Hermes configurado en HERMES_AGORA_PROFILE_ID.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'agora_list_tasks',
    description: 'Lista tareas Kanban de un proyecto visible. Usa status=todo para coger una tarea de la columna To do.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'ID del proyecto en Agora' },
        status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done'], description: 'Filtro opcional por columna Kanban' }
      },
      required: ['projectId'],
      additionalProperties: false
    }
  },
  {
    name: 'agora_get_task_whiteboard',
    description: 'Lee el whiteboard asignado a una tarea/card.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        taskId: { type: 'string' }
      },
      required: ['projectId', 'taskId'],
      additionalProperties: false
    }
  },
  {
    name: 'agora_set_task_whiteboard_shapes',
    description: 'Reemplaza el whiteboard de una tarea/card por un esquema visual con rectángulos, círculos, flechas o trazos.',
    inputSchema: whiteboardShapeInputSchema()
  },
  {
    name: 'agora_append_task_whiteboard_shapes',
    description: 'Añade formas al whiteboard existente de una tarea/card conservando los elementos previos.',
    inputSchema: whiteboardShapeInputSchema()
  },
  {
    name: 'agora_set_task_whiteboard_diagram',
    description: 'Reemplaza el whiteboard de una tarea/card por un diagrama tipo Draw.io con nodos y conectores.',
    inputSchema: whiteboardShapeInputSchema()
  },
  {
    name: 'agora_append_task_whiteboard_diagram',
    description: 'Añade nodos y conectores tipo Draw.io al whiteboard existente de una tarea/card.',
    inputSchema: whiteboardShapeInputSchema()
  }
];

export function createAgoraWhiteboardMcpServer() {
  const server = new Server({ name: 'hermes-agora-whiteboard', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await callAgoraTool(request.params.name, asRecord(request.params.arguments ?? {}));
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: safeError(error) }] };
    }
  });
  return server;
}

async function callAgoraTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const client = new AgoraApiClient();
  if (name === 'agora_list_projects') return client.request('/api/v1/projects');
  if (name === 'agora_list_tasks') {
    const projectId = requiredString(args.projectId, 'projectId');
    const status = typeof args.status === 'string' ? `?status=${encodeURIComponent(args.status)}` : '';
    return client.request(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks${status}`);
  }
  if (name === 'agora_get_task_whiteboard') {
    const { projectId, taskId } = taskArgs(args);
    return client.request(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/whiteboard`);
  }
  if (name === 'agora_set_task_whiteboard_shapes' || name === 'agora_append_task_whiteboard_shapes' || name === 'agora_set_task_whiteboard_diagram' || name === 'agora_append_task_whiteboard_diagram') {
    const { projectId, taskId } = taskArgs(args);
    const payload = buildWhiteboardDiagramPayload({ title: typeof args.title === 'string' ? args.title : undefined, elements: parseElements(args.elements) });
    if (name === 'agora_append_task_whiteboard_shapes' || name === 'agora_append_task_whiteboard_diagram') {
      const current = await client.request<{ title?: string; strokes?: unknown[]; diagram?: { nodes?: unknown[]; connectors?: unknown[] } }>(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/whiteboard`);
      payload.strokes = [...(Array.isArray(current.strokes) ? current.strokes : []), ...payload.strokes].slice(-80) as typeof payload.strokes;
      payload.diagram = {
        nodes: [...(Array.isArray(current.diagram?.nodes) ? current.diagram.nodes : []), ...payload.diagram.nodes].slice(-60) as typeof payload.diagram.nodes,
        connectors: [...(Array.isArray(current.diagram?.connectors) ? current.diagram.connectors : []), ...payload.diagram.connectors].slice(-80) as typeof payload.diagram.connectors
      };
      payload.title ??= current.title;
    }
    return client.request(`/api/v1/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/whiteboard`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }
  throw new Error(`Unknown tool: ${name}`);
}

class AgoraApiClient {
  private readonly baseUrl = env('HERMES_AGORA_URL', 'http://localhost:3000').replace(/\/$/, '');
  private readonly token = env('HUB_AGENT_TOKEN');
  private readonly profileId = env('HERMES_AGORA_PROFILE_ID', 'seldon-ceo');

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'X-Hermes-Profile': this.profileId,
        'Content-Type': 'application/json',
        'User-Agent': 'hermes-agora-whiteboard-mcp/0.1',
        ...(init.headers ?? {})
      }
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Agora API ${response.status}${body ? ` — ${body}` : ''}`);
    return body ? JSON.parse(body) as T : undefined as T;
  }
}

function whiteboardShapeInputSchema(): Tool['inputSchema'] {
  return {
    type: 'object' as const,
    properties: {
      projectId: { type: 'string' },
      taskId: { type: 'string' },
      title: { type: 'string' },
      elements: {
        type: 'array',
        minItems: 1,
        maxItems: 80,
        items: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['rectangle', 'circle', 'diamond', 'terminator', 'note', 'arrow', 'freehand'] },
            id: { type: 'string' },
            label: { type: 'string' },
            fromNodeId: { type: 'string' },
            toNodeId: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            radius: { type: 'number' },
            x1: { type: 'number' },
            y1: { type: 'number' },
            x2: { type: 'number' },
            y2: { type: 'number' },
            color: { type: 'string' },
            fill: { type: 'string' },
            size: { type: 'number' },
            points: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } }
          },
          required: ['kind'],
          additionalProperties: false
        }
      }
    },
    required: ['projectId', 'taskId', 'elements'],
    additionalProperties: false
  };
}

function taskArgs(args: Record<string, unknown>) {
  return { projectId: requiredString(args.projectId, 'projectId'), taskId: requiredString(args.taskId, 'taskId') };
}

function parseElements(value: unknown): AgentDiagramElement[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('elements must be a non-empty array');
  return value as AgentDiagramElement[];
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]').replace(/(token|password|secret)=([^\s&]+)/gi, '$1=[REDACTED]');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createAgoraWhiteboardMcpServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((error) => {
    console.error(safeError(error));
    process.exit(1);
  });
}
