import { describe, expect, it } from 'vitest';
import { buildWhiteboardDiagramPayload, mcpToolNames } from '../src/mcp/whiteboardPayload';

describe('Agora whiteboard MCP helpers', () => {
  it('builds safe visual schema payloads for agents using rectangles, circles and arrows', () => {
    const payload = buildWhiteboardDiagramPayload({
      title: 'Ejemplo agente visual',
      elements: [
        { kind: 'rectangle', label: 'Tarea To Do', x: 60, y: 80, width: 180, height: 90, color: '#93c5fd', fill: '#172033' },
        { kind: 'circle', label: 'Agente', x: 360, y: 125, radius: 48, color: '#a7f3d0' },
        { kind: 'arrow', label: 'actualiza whiteboard', x1: 240, y1: 125, x2: 312, y2: 125, color: '#fbbf24' }
      ]
    });

    expect(payload.title).toBe('Ejemplo agente visual');
    expect(payload.strokes.map((stroke) => stroke.kind)).toEqual(['rectangle', 'circle', 'arrow']);
    expect(payload.strokes[0]).toMatchObject({ label: 'Tarea To Do', fill: '#172033' });
    expect(payload.strokes[1].points).toEqual([{ x: 312, y: 77 }, { x: 408, y: 173 }]);
    expect(payload.strokes[2].points).toEqual([{ x: 240, y: 125 }, { x: 312, y: 125 }]);
  });

  it('exposes MCP tools that let agents find tasks and update assigned whiteboards', () => {
    expect(mcpToolNames()).toEqual([
      'agora_list_projects',
      'agora_list_tasks',
      'agora_get_task_whiteboard',
      'agora_set_task_whiteboard_shapes',
      'agora_append_task_whiteboard_shapes'
    ]);
  });
});
