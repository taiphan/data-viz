'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { generateId } from '@/lib/data-engine';
import type {
  FlowDefinition,
  FlowStep,
  FlowConnection,
  StepType,
  StepExecutionResult,
} from '@/lib/flows/types';
import {
  Database,
  Eraser,
  GitMerge,
  BarChart3,
  RotateCw,
  Layers,
  Download,
  GripVertical,
  X,
} from 'lucide-react';

// ============================================================
// CONSTANTS
// ============================================================

const NODE_WIDTH = 160;
const NODE_HEIGHT = 72;
const GRID_SIZE = 20;
const CONNECTOR_RADIUS = 6;

const STEP_TYPE_META: Record<StepType, { label: string; color: string }> = {
  input: { label: 'Input', color: '#3b82f6' },
  clean: { label: 'Clean', color: '#10b981' },
  join: { label: 'Join', color: '#8b5cf6' },
  aggregate: { label: 'Aggregate', color: '#f59e0b' },
  pivot: { label: 'Pivot', color: '#ec4899' },
  union: { label: 'Union', color: '#06b6d4' },
  output: { label: 'Output', color: '#6366f1' },
};

// ============================================================
// TYPES
// ============================================================

interface FlowCanvasProps {
  flow: FlowDefinition;
  stepResults?: StepExecutionResult[];
  onFlowChange: (flow: FlowDefinition) => void;
  onStepDoubleClick?: (step: FlowStep) => void;
}

interface DragState {
  type: 'move-node' | 'connect' | 'pan';
  stepId?: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

interface PendingConnection {
  sourceStepId: string;
  sourceX: number;
  sourceY: number;
  currentX: number;
  currentY: number;
}

// ============================================================
// STEP TYPE ICON MAP
// ============================================================

function StepIcon({ type, size = 16 }: { type: StepType; size?: number }) {
  const props = { width: size, height: size, 'aria-hidden': true as const };

  switch (type) {
    case 'input':
      return <Database {...props} />;
    case 'clean':
      return <Eraser {...props} />;
    case 'join':
      return <GitMerge {...props} />;
    case 'aggregate':
      return <BarChart3 {...props} />;
    case 'pivot':
      return <RotateCw {...props} />;
    case 'union':
      return <Layers {...props} />;
    case 'output':
      return <Download {...props} />;
    default:
      return <Database {...props} />;
  }
}

// ============================================================
// HELPERS
// ============================================================

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function getOutputPort(step: FlowStep): { x: number; y: number } {
  const pos = step.position || { x: 0, y: 0 };
  return {
    x: pos.x + NODE_WIDTH,
    y: pos.y + NODE_HEIGHT / 2,
  };
}

function getInputPort(step: FlowStep): { x: number; y: number } {
  const pos = step.position || { x: 0, y: 0 };
  return {
    x: pos.x,
    y: pos.y + NODE_HEIGHT / 2,
  };
}

function computeEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): string {
  const dx = targetX - sourceX;
  const controlOffset = Math.max(Math.abs(dx) * 0.4, 40);
  return `M ${sourceX} ${sourceY} C ${sourceX + controlOffset} ${sourceY}, ${targetX - controlOffset} ${targetY}, ${targetX} ${targetY}`;
}

// ============================================================
// FLOW CANVAS COMPONENT
// ============================================================

export function FlowCanvas({
  flow,
  stepResults,
  onFlowChange,
  onStepDoubleClick,
}: FlowCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  const stepMap = useMemo(
    () => new Map(flow.steps.map((s) => [s.id, s])),
    [flow.steps]
  );

  const resultMap = useMemo(
    () => new Map((stepResults || []).map((r) => [r.stepId, r])),
    [stepResults]
  );

  // ----------------------------------------------------------
  // STEP MANAGEMENT
  // ----------------------------------------------------------

  const addStep = useCallback(
    (type: StepType, x: number, y: number) => {
      const newStep: FlowStep = {
        id: generateId(),
        name: `${STEP_TYPE_META[type].label} ${flow.steps.filter((s) => s.type === type).length + 1}`,
        type,
        config: getDefaultConfig(type),
        enabled: true,
        position: { x: snapToGrid(x), y: snapToGrid(y) },
      };

      onFlowChange({
        ...flow,
        steps: [...flow.steps, newStep],
        updatedAt: new Date().toISOString(),
      });
    },
    [flow, onFlowChange]
  );

  const removeStep = useCallback(
    (stepId: string) => {
      onFlowChange({
        ...flow,
        steps: flow.steps.filter((s) => s.id !== stepId),
        connections: flow.connections.filter(
          (c) => c.sourceStepId !== stepId && c.targetStepId !== stepId
        ),
        updatedAt: new Date().toISOString(),
      });
      if (selectedStepId === stepId) setSelectedStepId(null);
    },
    [flow, onFlowChange, selectedStepId]
  );

  const addConnection = useCallback(
    (sourceStepId: string, targetStepId: string) => {
      // Prevent duplicate connections
      const exists = flow.connections.some(
        (c) => c.sourceStepId === sourceStepId && c.targetStepId === targetStepId
      );
      if (exists || sourceStepId === targetStepId) return;

      const newConnection: FlowConnection = {
        id: generateId(),
        sourceStepId,
        targetStepId,
      };

      onFlowChange({
        ...flow,
        connections: [...flow.connections, newConnection],
        updatedAt: new Date().toISOString(),
      });
    },
    [flow, onFlowChange]
  );

  // ----------------------------------------------------------
  // MOUSE HANDLERS
  // ----------------------------------------------------------

  const getSvgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: clientX - rect.left - viewOffset.x,
        y: clientY - rect.top - viewOffset.y,
      };
    },
    [viewOffset]
  );

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, stepId: string) => {
      e.stopPropagation();
      if (e.button !== 0) return;

      const step = stepMap.get(stepId);
      if (!step) return;

      const pos = step.position || { x: 0, y: 0 };
      const point = getSvgPoint(e.clientX, e.clientY);

      setDragState({
        type: 'move-node',
        stepId,
        startX: point.x,
        startY: point.y,
        offsetX: point.x - pos.x,
        offsetY: point.y - pos.y,
      });
      setSelectedStepId(stepId);
    },
    [stepMap, getSvgPoint]
  );

  const handleOutputPortMouseDown = useCallback(
    (e: React.MouseEvent, stepId: string) => {
      e.stopPropagation();
      if (e.button !== 0) return;

      const step = stepMap.get(stepId);
      if (!step) return;

      const port = getOutputPort(step);
      setPendingConnection({
        sourceStepId: stepId,
        sourceX: port.x,
        sourceY: port.y,
        currentX: port.x,
        currentY: port.y,
      });
    },
    [stepMap]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (e.target === svgRef.current || (e.target as SVGElement).classList.contains('canvas-bg')) {
        setSelectedStepId(null);
        const point = getSvgPoint(e.clientX, e.clientY);
        setDragState({
          type: 'pan',
          startX: e.clientX,
          startY: e.clientY,
          offsetX: viewOffset.x,
          offsetY: viewOffset.y,
        });
      }
    },
    [getSvgPoint, viewOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (pendingConnection) {
        const point = getSvgPoint(e.clientX, e.clientY);
        setPendingConnection({
          ...pendingConnection,
          currentX: point.x,
          currentY: point.y,
        });
        return;
      }

      if (!dragState) return;

      if (dragState.type === 'move-node' && dragState.stepId) {
        const point = getSvgPoint(e.clientX, e.clientY);
        const newX = snapToGrid(point.x - dragState.offsetX);
        const newY = snapToGrid(point.y - dragState.offsetY);

        onFlowChange({
          ...flow,
          steps: flow.steps.map((s) =>
            s.id === dragState.stepId
              ? { ...s, position: { x: newX, y: newY } }
              : s
          ),
        });
      } else if (dragState.type === 'pan') {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        setViewOffset({
          x: dragState.offsetX + dx,
          y: dragState.offsetY + dy,
        });
      }
    },
    [dragState, pendingConnection, flow, onFlowChange, getSvgPoint]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (pendingConnection) {
        // Check if we're over an input port
        const point = getSvgPoint(e.clientX, e.clientY);
        for (const step of flow.steps) {
          if (step.id === pendingConnection.sourceStepId) continue;
          const inputPort = getInputPort(step);
          const dist = Math.hypot(point.x - inputPort.x, point.y - inputPort.y);
          if (dist < CONNECTOR_RADIUS * 3) {
            addConnection(pendingConnection.sourceStepId, step.id);
            break;
          }
        }
        setPendingConnection(null);
      }
      setDragState(null);
    },
    [pendingConnection, flow.steps, addConnection, getSvgPoint]
  );

  const handleNodeDoubleClick = useCallback(
    (e: React.MouseEvent, stepId: string) => {
      e.stopPropagation();
      const step = stepMap.get(stepId);
      if (step && onStepDoubleClick) {
        onStepDoubleClick(step);
      }
    },
    [stepMap, onStepDoubleClick]
  );

  // ----------------------------------------------------------
  // DRAG-AND-DROP FROM PALETTE
  // ----------------------------------------------------------

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const stepType = e.dataTransfer.getData('application/flow-step-type') as StepType;
      if (!stepType || !STEP_TYPE_META[stepType]) return;

      const point = getSvgPoint(e.clientX, e.clientY);
      addStep(stepType, point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2);
    },
    [addStep, getSvgPoint]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Step palette toolbar */}
      <StepPalette />

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden border rounded-md bg-muted/20">
        <svg
          ref={svgRef}
          className="h-full w-full cursor-crosshair"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          role="application"
          aria-label="Flow editor canvas"
        >
          {/* Grid pattern */}
          <defs>
            <pattern
              id="flow-grid"
              width={GRID_SIZE}
              height={GRID_SIZE}
              patternUnits="userSpaceOnUse"
              x={viewOffset.x % GRID_SIZE}
              y={viewOffset.y % GRID_SIZE}
            >
              <circle cx={1} cy={1} r={0.5} fill="currentColor" className="text-border" />
            </pattern>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#flow-grid)"
            className="canvas-bg"
          />

          {/* Translated group for pan */}
          <g transform={`translate(${viewOffset.x}, ${viewOffset.y})`}>
            {/* Edges */}
            {flow.connections.map((conn) => {
              const source = stepMap.get(conn.sourceStepId);
              const target = stepMap.get(conn.targetStepId);
              if (!source || !target) return null;

              const sourcePort = getOutputPort(source);
              const targetPort = getInputPort(target);
              const path = computeEdgePath(
                sourcePort.x,
                sourcePort.y,
                targetPort.x,
                targetPort.y
              );

              return (
                <path
                  key={conn.id}
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="text-muted-foreground/50"
                  markerEnd="url(#arrowhead)"
                />
              );
            })}

            {/* Pending connection line */}
            {pendingConnection && (
              <path
                d={computeEdgePath(
                  pendingConnection.sourceX,
                  pendingConnection.sourceY,
                  pendingConnection.currentX,
                  pendingConnection.currentY
                )}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeDasharray="6 3"
                className="text-primary"
              />
            )}

            {/* Step nodes */}
            {flow.steps.map((step) => (
              <FlowStepNode
                key={step.id}
                step={step}
                isSelected={selectedStepId === step.id}
                result={resultMap.get(step.id)}
                onMouseDown={(e) => handleNodeMouseDown(e, step.id)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, step.id)}
                onOutputPortMouseDown={(e) => handleOutputPortMouseDown(e, step.id)}
                onRemove={() => removeStep(step.id)}
              />
            ))}

            {/* Arrow marker */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon
                  points="0 0, 8 3, 0 6"
                  fill="currentColor"
                  className="text-muted-foreground/50"
                />
              </marker>
            </defs>
          </g>
        </svg>

        {/* Empty state */}
        {flow.steps.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              Drag step types from the toolbar to build your flow
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STEP NODE (SVG foreignObject)
// ============================================================

interface FlowStepNodeProps {
  step: FlowStep;
  isSelected: boolean;
  result?: StepExecutionResult;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onOutputPortMouseDown: (e: React.MouseEvent) => void;
  onRemove: () => void;
}

function FlowStepNode({
  step,
  isSelected,
  result,
  onMouseDown,
  onDoubleClick,
  onOutputPortMouseDown,
  onRemove,
}: FlowStepNodeProps) {
  const pos = step.position || { x: 0, y: 0 };
  const meta = STEP_TYPE_META[step.type];
  const rowCount = result?.rowCount;

  return (
    <g>
      {/* Node body */}
      <foreignObject
        x={pos.x}
        y={pos.y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
      >
        <div
          className={`
            flex h-full flex-col rounded-lg border bg-card shadow-sm
            transition-shadow select-none cursor-grab active:cursor-grabbing
            ${isSelected ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-md'}
            ${!step.enabled ? 'opacity-50' : ''}
          `}
          style={{ borderTopColor: meta.color, borderTopWidth: 3 }}
        >
          {/* Header */}
          <div className="flex items-center gap-1.5 px-2 pt-1.5">
            <span style={{ color: meta.color }}>
              <StepIcon type={step.type} size={14} />
            </span>
            <span className="flex-1 truncate text-[11px] font-medium">
              {step.name}
            </span>
            {isSelected && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${step.name}`}
              >
                <X width={10} height={10} />
              </button>
            )}
          </div>

          {/* Footer info */}
          <div className="mt-auto flex items-center gap-1 px-2 pb-1.5">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
              {meta.label}
            </span>
            {rowCount != null && (
              <span className="ml-auto text-[9px] font-mono text-muted-foreground">
                {rowCount.toLocaleString()} rows
              </span>
            )}
            {result?.status === 'error' && (
              <span className="ml-auto text-[9px] text-destructive">Error</span>
            )}
          </div>
        </div>
      </foreignObject>

      {/* Input port (left) */}
      {step.type !== 'input' && (
        <circle
          cx={pos.x}
          cy={pos.y + NODE_HEIGHT / 2}
          r={CONNECTOR_RADIUS}
          fill="currentColor"
          className="text-muted-foreground/60 hover:text-primary"
          stroke="currentColor"
          strokeWidth={1.5}
        />
      )}

      {/* Output port (right) */}
      {step.type !== 'output' && (
        <circle
          cx={pos.x + NODE_WIDTH}
          cy={pos.y + NODE_HEIGHT / 2}
          r={CONNECTOR_RADIUS}
          fill="currentColor"
          className="text-muted-foreground/60 hover:text-primary cursor-pointer"
          stroke="currentColor"
          strokeWidth={1.5}
          onMouseDown={onOutputPortMouseDown}
        />
      )}
    </g>
  );
}

// ============================================================
// STEP PALETTE (drag source)
// ============================================================

function StepPalette() {
  const stepTypes: StepType[] = [
    'input',
    'clean',
    'join',
    'aggregate',
    'pivot',
    'union',
    'output',
  ];

  const handleDragStart = (e: React.DragEvent, type: StepType) => {
    e.dataTransfer.setData('application/flow-step-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex items-center gap-1 border-b px-3 py-2 overflow-x-auto">
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground mr-1" aria-hidden="true" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-2">
        Steps
      </span>
      {stepTypes.map((type) => {
        const meta = STEP_TYPE_META[type];
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            className="flex cursor-grab items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-accent active:cursor-grabbing"
            title={`Drag to add ${meta.label} step`}
          >
            <span style={{ color: meta.color }}>
              <StepIcon type={type} size={12} />
            </span>
            {meta.label}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// DEFAULT CONFIGS
// ============================================================

function getDefaultConfig(type: StepType): FlowStep['config'] {
  switch (type) {
    case 'input':
      return { sourceType: 'datasource' } as FlowStep<'input'>['config'];
    case 'clean':
      return { operations: [] } as FlowStep<'clean'>['config'];
    case 'join':
      return {
        joinType: 'inner',
        rightInputStepId: '',
        leftField: '',
        rightField: '',
      } as FlowStep<'join'>['config'];
    case 'aggregate':
      return {
        groupByFields: [],
        aggregations: [],
      } as FlowStep<'aggregate'>['config'];
    case 'pivot':
      return {
        mode: 'rows-to-columns',
        pivotField: '',
        valueField: '',
        groupByFields: [],
      } as FlowStep<'pivot'>['config'];
    case 'union':
      return {
        inputStepIds: [],
        matchBy: 'name',
      } as FlowStep<'union'>['config'];
    case 'output':
      return {
        outputName: 'Output',
        outputType: 'datasource',
        overwriteExisting: false,
      } as FlowStep<'output'>['config'];
    default:
      return {} as FlowStep['config'];
  }
}
