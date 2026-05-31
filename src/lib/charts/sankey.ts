// ============================================================
// Sankey Chart Data Transformation
// ============================================================

export interface SankeyNode {
  id: string;
  name: string;
  value: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const MAX_NODES = 20;
const MAX_LINKS = 50;

/**
 * Transforms tabular data into Sankey diagram format.
 *
 * Aggregates values by unique source-target pairs (summing duplicates),
 * deduplicates nodes from both source and target columns, and limits
 * output to 20 nodes and 50 links (top by value).
 */
export function transformToSankey(
  rows: Record<string, unknown>[],
  sourceField: string,
  targetField: string,
  valueField: string,
): SankeyData {
  if (!rows || rows.length === 0) {
    return { nodes: [], links: [] };
  }

  // Aggregate values by source-target pairs
  const linkMap = new Map<string, number>();

  for (const row of rows) {
    const source = row[sourceField];
    const target = row[targetField];
    const rawValue = row[valueField];

    // Skip rows with null/empty source or target
    if (source == null || source === '' || target == null || target === '') {
      continue;
    }

    const sourceStr = String(source);
    const targetStr = String(target);
    const value = toNumber(rawValue);

    // Skip rows with non-positive or invalid values
    if (value <= 0 || !isFinite(value)) {
      continue;
    }

    const key = `${sourceStr}\0${targetStr}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + value);
  }

  // Convert to links array and sort by value descending
  let links: SankeyLink[] = Array.from(linkMap.entries())
    .map(([key, value]) => {
      const [source, target] = key.split('\0');
      return { source, target, value };
    })
    .sort((a, b) => b.value - a.value);

  // Limit links to MAX_LINKS
  links = links.slice(0, MAX_LINKS);

  // Collect unique node ids from the limited links
  const nodeValueMap = new Map<string, number>();

  for (const link of links) {
    nodeValueMap.set(link.source, (nodeValueMap.get(link.source) ?? 0) + link.value);
    nodeValueMap.set(link.target, (nodeValueMap.get(link.target) ?? 0) + link.value);
  }

  // Sort nodes by value descending and limit to MAX_NODES
  let nodes: SankeyNode[] = Array.from(nodeValueMap.entries())
    .map(([id, value]) => ({ id, name: id, value }))
    .sort((a, b) => b.value - a.value);

  if (nodes.length > MAX_NODES) {
    const topNodeIds = new Set(nodes.slice(0, MAX_NODES).map((n) => n.id));
    nodes = nodes.slice(0, MAX_NODES);

    // Filter links to only include those between top nodes
    links = links.filter(
      (link) => topNodeIds.has(link.source) && topNodeIds.has(link.target),
    );
  }

  return { nodes, links };
}

/**
 * Safely converts an unknown value to a number.
 * Returns 0 for null, undefined, empty string, or non-numeric values.
 */
function toNumber(value: unknown): number {
  if (value == null || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Number(value);
  return isNaN(parsed) ? 0 : parsed;
}
