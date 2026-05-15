import { describe, expect, it } from 'vitest';
import { appendWhiteboardDiagramPayload, buildWhiteboardDiagramPayload, mcpToolNames } from '../src/mcp/whiteboardPayload';

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

  it('also builds a Draw.io-style diagram model with nodes and connectors for the assigned whiteboard', () => {
    const payload = buildWhiteboardDiagramPayload({
      title: 'Diagrama tipo Draw.io',
      elements: [
        { kind: 'rectangle', label: 'Card To Do', x: 60, y: 80, width: 180, height: 90, color: '#93c5fd', fill: '#172033' },
        { kind: 'circle', label: 'Agente MCP', x: 360, y: 125, radius: 48, color: '#a7f3d0' },
        { kind: 'arrow', label: 'crea esquema', x1: 240, y1: 125, x2: 312, y2: 125, color: '#fbbf24' }
      ]
    });

    expect(payload.diagram.nodes.map((node) => node.kind)).toEqual(['rectangle', 'circle']);
    expect(payload.diagram.nodes[0]).toMatchObject({ label: 'Card To Do', x: 60, y: 80, width: 180, height: 90 });
    expect(payload.diagram.connectors[0]).toMatchObject({ label: 'crea esquema', fromNodeId: 'rectangle_1', toNodeId: 'circle_2' });
    expect(payload.drawioXml).toContain('<mxfile');
    expect(payload.drawioXml).toContain('<mxGraphModel');
    expect(payload.drawioXml).toContain('Card To Do');
    expect(payload.drawioXml).toContain('Agente MCP');
    expect(payload.drawioXml).toContain('crea esquema');
  });

  it('keeps Draw.io XML synchronized when agents append diagram elements', () => {
    const current = buildWhiteboardDiagramPayload({
      title: 'Flujo existente',
      elements: [
        { kind: 'rectangle', id: 'card', label: 'Card existente', x: 60, y: 80, width: 180, height: 90 }
      ]
    });
    const next = buildWhiteboardDiagramPayload({
      elements: [
        { kind: 'circle', id: 'agent', label: 'Agente nuevo', x: 360, y: 125, radius: 48 },
        { kind: 'arrow', label: 'append', fromNodeId: 'card', toNodeId: 'agent', x1: 240, y1: 125, x2: 312, y2: 125 }
      ]
    });

    const merged = appendWhiteboardDiagramPayload(current, next);

    expect(merged.diagram.nodes.map((node) => node.id)).toEqual(['card', 'agent']);
    expect(merged.diagram.connectors[0]).toMatchObject({ fromNodeId: 'card', toNodeId: 'agent' });
    expect(merged.drawioXml).toContain('Card existente');
    expect(merged.drawioXml).toContain('Agente nuevo');
    expect(merged.drawioXml).toContain('append');
  });

  it('exposes MCP tools that let agents find tasks and update assigned whiteboards', () => {
    expect(mcpToolNames()).toEqual([
      'agora_list_projects',
      'agora_list_tasks',
      'agora_get_task_whiteboard',
      'agora_set_task_whiteboard_shapes',
      'agora_append_task_whiteboard_shapes',
      'agora_set_task_whiteboard_diagram',
      'agora_append_task_whiteboard_diagram'
    ]);
  });
});
