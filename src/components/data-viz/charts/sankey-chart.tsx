'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  sankey as d3Sankey,
  sankeyLinkHorizontal,
  SankeyNode as D3SankeyNode,
  SankeyLink as D3SankeyLink,
} from 'd3-sankey';
import type { SankeyData } from '@/lib/charts/sankey';
import { COLOR_PALETTES } from '@/lib/types';

// ============================================================
// Types
// ============================================================

interface SankeyNodeExtra {
  id: string;
  name: string;
  value: number;
}

interface SankeyLinkExtra {
  source: string;
  target: string;
  value: number;
}

type LayoutNode = D3SankeyNode<SankeyNodeExtra, SankeyLinkExtra>;
type LayoutLink = D3SankeyLink<SankeyNodeExtra, SankeyLinkExtra>;

interface TooltipState {
  x: number;
  y: number;
  content: string;
  visible: boolean;
}

export interface SankeyChartProps {
  data: SankeyData;
  width?: number;
  height?: number;
  colorPalette?: string[];
}

// ============================================================
// Constants
// ============================================================

const DEFAULT_WIDTH = 600;
const DEFAULT_HEIGHT = 400;
const NODE_WIDTH = 20;
const NODE_PADDING = 16;
const MARGIN = { top: 8, right: 8, bottom: 8, left: 8 };
const LINK_OPACITY = 0.4;
const LINK_HOVER_OPACITY = 0.7;

// ============================================================
// Component
// ============================================================

export function SankeyChart({
  data,
  width: propWidth,
  height: propHeight,
  colorPalette = COLOR_PALETTES.default,
}: SankeyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState>({
    x: 0,
    y: 0,
    content: '',
    visible: false,
  });
  const [hoveredLinkIndex, setHoveredLinkIndex] = useState<number | null>(null);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);

  // Responsive sizing via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const width = propWidth || containerSize.width || DEFAULT_WIDTH;
  const height = propHeight || containerSize.height || DEFAULT_HEIGHT;

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  // Compute Sankey layout
  const layout = useMemo(() => {
    if (!data.nodes.length || !data.links.length) {
      return null;
    }

    const nodeIds = new Set(data.nodes.map((n) => n.id));
    const nodes = data.nodes.map((node) => ({ ...node }));

    // Filter links to only include those referencing existing nodes
    const links = data.links
      .filter(
        (link) => nodeIds.has(link.source) && nodeIds.has(link.target),
      )
      .map((link) => ({
        source: link.source,
        target: link.target,
        value: link.value,
      }));

    if (links.length === 0) return null;

    const sankeyGenerator = d3Sankey<SankeyNodeExtra, SankeyLinkExtra>()
      .nodeId((d) => d.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ]);

    try {
      const graph = sankeyGenerator({
        nodes: nodes.map((n) => ({ ...n })),
        links: links.map((l) => ({ ...l })),
      });

      return graph;
    } catch {
      return null;
    }
  }, [data, innerWidth, innerHeight]);

  const linkPathGenerator = sankeyLinkHorizontal();

  // Color assignment: map node index to palette color
  const getNodeColor = useCallback(
    (index: number) => colorPalette[index % colorPalette.length],
    [colorPalette],
  );

  const handleNodeMouseEnter = useCallback(
    (event: React.MouseEvent, node: LayoutNode, index: number) => {
      const rect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
      if (!rect) return;
      setHoveredNodeIndex(index);
      setTooltip({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        content: `${node.name}: ${formatValue(node.value ?? 0)}`,
        visible: true,
      });
    },
    [],
  );

  const handleLinkMouseEnter = useCallback(
    (event: React.MouseEvent, link: LayoutLink, index: number) => {
      const rect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
      if (!rect) return;
      const sourceNode = link.source as LayoutNode;
      const targetNode = link.target as LayoutNode;
      setHoveredLinkIndex(index);
      setTooltip({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        content: `${sourceNode.name} → ${targetNode.name}: ${formatValue(link.value)}`,
        visible: true,
      });
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
    setHoveredLinkIndex(null);
    setHoveredNodeIndex(null);
  }, []);

  // Empty state
  if (!data.nodes.length || !data.links.length) {
    return (
      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center"
      >
        <p className="text-sm text-muted-foreground">
          No Sankey data available
        </p>
      </div>
    );
  }

  if (!layout) {
    return (
      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center"
      >
        <p className="text-sm text-muted-foreground">
          Unable to compute Sankey layout
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Sankey flow diagram"
        className="h-full w-full"
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Links */}
          <g aria-label="Flow links">
            {layout.links.map((link, i) => {
              const sourceNode = link.source as LayoutNode;
              const sourceIndex = layout.nodes.indexOf(sourceNode);
              const color = getNodeColor(sourceIndex);
              const isHovered = hoveredLinkIndex === i;
              const path = linkPathGenerator(link as never);

              return (
                <path
                  key={`link-${i}`}
                  d={path || ''}
                  fill="none"
                  stroke={color}
                  strokeWidth={Math.max(1, link.width ?? 1)}
                  strokeOpacity={isHovered ? LINK_HOVER_OPACITY : LINK_OPACITY}
                  aria-label={`Flow from ${sourceNode.name} to ${(link.target as LayoutNode).name}: ${formatValue(link.value)}`}
                  onMouseEnter={(e) => handleLinkMouseEnter(e, link, i)}
                  onMouseMove={(e) => {
                    const rect = (e.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
                    if (!rect) return;
                    setTooltip((prev) => ({
                      ...prev,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    }));
                  }}
                  onMouseLeave={handleMouseLeave}
                  style={{ transition: 'stroke-opacity 0.15s ease' }}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g aria-label="Flow nodes">
            {layout.nodes.map((node, i) => {
              const x0 = node.x0 ?? 0;
              const y0 = node.y0 ?? 0;
              const x1 = node.x1 ?? 0;
              const y1 = node.y1 ?? 0;
              const nodeHeight = y1 - y0;
              const color = getNodeColor(i);
              const isHovered = hoveredNodeIndex === i;

              return (
                <g key={`node-${node.id ?? i}`}>
                  <rect
                    x={x0}
                    y={y0}
                    width={x1 - x0}
                    height={Math.max(1, nodeHeight)}
                    fill={color}
                    opacity={isHovered ? 1 : 0.9}
                    rx={2}
                    aria-label={`${node.name}: ${formatValue(node.value ?? 0)}`}
                    onMouseEnter={(e) => handleNodeMouseEnter(e, node, i)}
                    onMouseMove={(e) => {
                      const rect = (e.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
                      if (!rect) return;
                      setTooltip((prev) => ({
                        ...prev,
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                      }));
                    }}
                    onMouseLeave={handleMouseLeave}
                    style={{ transition: 'opacity 0.15s ease', cursor: 'pointer' }}
                  />
                  {/* Node label */}
                  {nodeHeight > 12 && (
                    <text
                      x={x0 < innerWidth / 2 ? x1 + 6 : x0 - 6}
                      y={(y0 + y1) / 2}
                      dy="0.35em"
                      textAnchor={x0 < innerWidth / 2 ? 'start' : 'end'}
                      fontSize={11}
                      fill="currentColor"
                      className="pointer-events-none select-none"
                    >
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 28,
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function formatValue(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
