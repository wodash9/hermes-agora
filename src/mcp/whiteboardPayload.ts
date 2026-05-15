import type { WhiteboardDiagram, WhiteboardDiagramConnector, WhiteboardDiagramNode, WhiteboardStroke } from '../shared/types.js';

export type AgentDiagramElement =
  | { kind: 'rectangle'; id?: string; label?: string; x: number; y: number; width: number; height: number; color?: string; fill?: string; size?: number }
  | { kind: 'circle'; id?: string; label?: string; x: number; y: number; radius: number; color?: string; fill?: string; size?: number }
  | { kind: 'diamond'; id?: string; label?: string; x: number; y: number; width: number; height: number; color?: string; fill?: string; size?: number }
  | { kind: 'terminator'; id?: string; label?: string; x: number; y: number; width: number; height: number; color?: string; fill?: string; size?: number }
  | { kind: 'note'; id?: string; label?: string; x: number; y: number; width: number; height: number; color?: string; fill?: string; size?: number }
  | { kind: 'arrow'; label?: string; fromNodeId?: string; toNodeId?: string; x1: number; y1: number; x2: number; y2: number; color?: string; size?: number }
  | { kind: 'freehand'; label?: string; points: Array<{ x: number; y: number }>; color?: string; size?: number };

export interface WhiteboardDiagramInput {
  title?: string;
  elements: AgentDiagramElement[];
}

export interface WhiteboardDiagramPayload {
  title?: string;
  strokes: WhiteboardStroke[];
  diagram: WhiteboardDiagram;
}

const TOOL_NAMES = [
  'agora_list_projects',
  'agora_list_tasks',
  'agora_get_task_whiteboard',
  'agora_set_task_whiteboard_shapes',
  'agora_append_task_whiteboard_shapes',
  'agora_set_task_whiteboard_diagram',
  'agora_append_task_whiteboard_diagram'
] as const;

export function mcpToolNames(): string[] {
  return [...TOOL_NAMES];
}

export function buildWhiteboardDiagramPayload(input: WhiteboardDiagramInput): WhiteboardDiagramPayload {
  if (!Array.isArray(input.elements)) throw new Error('elements must be an array');
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().replace(/\s+/g, ' ').slice(0, 120) : undefined;
  const elements = input.elements.slice(-80);
  const strokes = elements.map((element, index) => elementToStroke(element, index));
  const diagram = elementsToDiagram(elements);
  return title ? { title, strokes, diagram } : { strokes, diagram };
}

function elementsToDiagram(elements: AgentDiagramElement[]): WhiteboardDiagram {
  const nodes: WhiteboardDiagramNode[] = [];
  const connectors: WhiteboardDiagramConnector[] = [];
  for (const [index, element] of elements.entries()) {
    if (isNodeElement(element)) nodes.push(elementToNode(element, index));
  }
  for (const [index, element] of elements.entries()) {
    if (element.kind !== 'arrow') continue;
    const fromNodeId = typeof element.fromNodeId === 'string' ? element.fromNodeId : nodes[0]?.id;
    const toNodeId = typeof element.toNodeId === 'string' ? element.toNodeId : nodes[1]?.id;
    if (!fromNodeId || !toNodeId) continue;
    connectors.push({
      id: `connector_${index + 1}`,
      fromNodeId,
      toNodeId,
      color: color(element.color, '#fbbf24'),
      ...(label(element.label) ? { label: label(element.label) } : {})
    });
  }
  return { nodes: nodes.slice(-60), connectors: connectors.slice(-80) };
}

function isNodeElement(element: AgentDiagramElement): element is Exclude<AgentDiagramElement, { kind: 'arrow' } | { kind: 'freehand' }> {
  return element.kind === 'rectangle' || element.kind === 'circle' || element.kind === 'diamond' || element.kind === 'terminator' || element.kind === 'note';
}

function elementToNode(element: Exclude<AgentDiagramElement, { kind: 'arrow' } | { kind: 'freehand' }>, index: number): WhiteboardDiagramNode {
  if (element.kind === 'circle') {
    const radius = finite(element.radius, 48, 4, 220);
    return {
      id: safeId(element.id, `${element.kind}_${index + 1}`),
      kind: 'circle',
      label: label(element.label) ?? 'Entidad',
      x: finite(element.x - radius, 0, 0, 760),
      y: finite(element.y - radius, 0, 0, 390),
      width: radius * 2,
      height: radius * 2,
      color: color(element.color, '#a7f3d0'),
      fill: color(element.fill, '#123026')
    };
  }
  const kind = element.kind;
  return {
    id: safeId(element.id, `${kind}_${index + 1}`),
    kind,
    label: label(element.label) ?? defaultNodeLabel(kind),
    x: finite(element.x, 0, 0, 760),
    y: finite(element.y, 0, 0, 390),
    width: finite(element.width, kind === 'terminator' ? 160 : 180, 36, 360),
    height: finite(element.height, kind === 'terminator' ? 72 : 90, 28, 240),
    color: color(element.color, defaultColor(kind)),
    fill: color(element.fill, defaultFill(kind))
  };
}

function elementToStroke(element: AgentDiagramElement, index: number): WhiteboardStroke {
  const base = {
    id: `${element.kind}_${index + 1}`,
    kind: element.kind === 'diamond' || element.kind === 'terminator' || element.kind === 'note' ? 'rectangle' : element.kind,
    color: color(element.color, defaultColor(element.kind)),
    size: size(element.size),
    label: label(element.label)
  } satisfies Partial<WhiteboardStroke>;

  if (isNodeElement(element) && element.kind !== 'circle') {
    const start = point(element.x, element.y);
    const end = point(element.x + element.width, element.y + element.height);
    return compactStroke({ ...base, fill: color(element.fill, defaultFill(element.kind)), points: [start, end] });
  }
  if (element.kind === 'circle') {
    const radius = finite(element.radius, 32, 4, 220);
    return compactStroke({
      ...base,
      fill: element.fill ? color(element.fill, '#172033') : undefined,
      points: [point(element.x - radius, element.y - radius), point(element.x + radius, element.y + radius)]
    });
  }
  if (element.kind === 'arrow') {
    return compactStroke({ ...base, kind: 'arrow', points: [point(element.x1, element.y1), point(element.x2, element.y2)] });
  }
  return compactStroke({ ...base, kind: 'freehand', points: element.points.slice(0, 120).map((item) => point(item.x, item.y)) });
}

function compactStroke(stroke: Partial<WhiteboardStroke> & Pick<WhiteboardStroke, 'id' | 'color' | 'size' | 'points'>): WhiteboardStroke {
  const next: WhiteboardStroke = { id: stroke.id, kind: stroke.kind, color: stroke.color, size: stroke.size, points: stroke.points };
  if (stroke.fill) next.fill = stroke.fill;
  if (stroke.label) next.label = stroke.label;
  return next;
}

function point(xRaw: number, yRaw: number) {
  return { x: finite(xRaw, 0, 0, 800), y: finite(yRaw, 0, 0, 420) };
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw * 10) / 10));
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function size(value: unknown): number {
  return Math.min(16, Math.max(1, Math.round(Number.isFinite(Number(value)) ? Number(value) : 3)));
}

function label(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 80);
  return normalized || undefined;
}

function safeId(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 80) : fallback;
}

function defaultNodeLabel(kind: WhiteboardDiagramNode['kind']): string {
  if (kind === 'diamond') return 'Decisión';
  if (kind === 'terminator') return 'Inicio / fin';
  if (kind === 'note') return 'Nota';
  if (kind === 'circle') return 'Entidad';
  return 'Proceso';
}

function defaultColor(kind: AgentDiagramElement['kind'] | WhiteboardDiagramNode['kind']): string {
  if (kind === 'circle') return '#a7f3d0';
  if (kind === 'arrow') return '#fbbf24';
  if (kind === 'diamond') return '#fbbf24';
  if (kind === 'terminator') return '#c4b5fd';
  if (kind === 'note') return '#bef264';
  return '#93c5fd';
}

function defaultFill(kind: AgentDiagramElement['kind'] | WhiteboardDiagramNode['kind']): string {
  if (kind === 'circle') return '#123026';
  if (kind === 'diamond') return '#312410';
  if (kind === 'terminator') return '#251b44';
  if (kind === 'note') return '#28331a';
  return '#172033';
}
