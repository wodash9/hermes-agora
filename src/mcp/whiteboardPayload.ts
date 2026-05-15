import type { WhiteboardStroke } from '../shared/types.js';

export type AgentDiagramElement =
  | { kind: 'rectangle'; label?: string; x: number; y: number; width: number; height: number; color?: string; fill?: string; size?: number }
  | { kind: 'circle'; label?: string; x: number; y: number; radius: number; color?: string; fill?: string; size?: number }
  | { kind: 'arrow'; label?: string; x1: number; y1: number; x2: number; y2: number; color?: string; size?: number }
  | { kind: 'freehand'; label?: string; points: Array<{ x: number; y: number }>; color?: string; size?: number };

export interface WhiteboardDiagramInput {
  title?: string;
  elements: AgentDiagramElement[];
}

export interface WhiteboardDiagramPayload {
  title?: string;
  strokes: WhiteboardStroke[];
}

const TOOL_NAMES = [
  'agora_list_projects',
  'agora_list_tasks',
  'agora_get_task_whiteboard',
  'agora_set_task_whiteboard_shapes',
  'agora_append_task_whiteboard_shapes'
] as const;

export function mcpToolNames(): string[] {
  return [...TOOL_NAMES];
}

export function buildWhiteboardDiagramPayload(input: WhiteboardDiagramInput): WhiteboardDiagramPayload {
  if (!Array.isArray(input.elements)) throw new Error('elements must be an array');
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().replace(/\s+/g, ' ').slice(0, 120) : undefined;
  const strokes = input.elements.slice(-80).map((element, index) => elementToStroke(element, index));
  return title ? { title, strokes } : { strokes };
}

function elementToStroke(element: AgentDiagramElement, index: number): WhiteboardStroke {
  const base = {
    id: `${element.kind}_${index + 1}`,
    kind: element.kind,
    color: color(element.color, defaultColor(element.kind)),
    size: size(element.size),
    label: label(element.label)
  } satisfies Partial<WhiteboardStroke>;

  if (element.kind === 'rectangle') {
    const start = point(element.x, element.y);
    const end = point(element.x + element.width, element.y + element.height);
    return compactStroke({ ...base, fill: color(element.fill, '#172033'), points: [start, end] });
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
    return compactStroke({ ...base, points: [point(element.x1, element.y1), point(element.x2, element.y2)] });
  }
  return compactStroke({ ...base, points: element.points.slice(0, 120).map((item) => point(item.x, item.y)) });
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

function defaultColor(kind: AgentDiagramElement['kind']): string {
  if (kind === 'rectangle') return '#93c5fd';
  if (kind === 'circle') return '#a7f3d0';
  if (kind === 'arrow') return '#fbbf24';
  return '#e2e8f0';
}
