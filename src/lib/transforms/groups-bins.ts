import type { GroupDefinition, BinDefinition } from '@/lib/types';

/**
 * Applies a group definition to rows, creating a new virtual field
 * that maps source field values to group names.
 *
 * For each row:
 * - If the sourceField value matches a group's values array, the virtual field
 *   is set to that group's name.
 * - If no match is found, the virtual field is set to otherGroupName.
 *
 * The virtual field name is the groupDef.name.
 */
export function applyGroup(
  rows: Record<string, unknown>[],
  groupDef: GroupDefinition
): Record<string, unknown>[] {
  const valueToGroupName = buildValueToGroupMap(groupDef);

  return rows.map((row) => {
    const sourceValue = String(row[groupDef.sourceField] ?? '');
    const groupName = valueToGroupName.get(sourceValue) ?? groupDef.otherGroupName;

    return {
      ...row,
      [groupDef.name]: groupName,
    };
  });
}

/**
 * Builds a lookup map from individual values to their group name
 * for O(1) lookups during row processing.
 */
function buildValueToGroupMap(groupDef: GroupDefinition): Map<string, string> {
  const map = new Map<string, string>();

  for (const group of groupDef.groups) {
    for (const value of group.values) {
      map.set(value, group.name);
    }
  }

  return map;
}

/**
 * Applies a bin definition to rows, creating a new virtual field
 * that segments continuous numeric values into equal-sized ranges.
 *
 * For each row:
 * - If the sourceField value is numeric, compute which bin it falls into
 *   and assign a label like "start-end" (e.g., "0-10", "10-20").
 * - If the value is null, undefined, or non-numeric, assign "N/A".
 *
 * The virtual field name is the binDef.name.
 * startAt defaults to 0 if not specified.
 */
export function applyBin(
  rows: Record<string, unknown>[],
  binDef: BinDefinition
): Record<string, unknown>[] {
  const startAt = binDef.startAt ?? 0;
  const { binSize, sourceField, name } = binDef;

  return rows.map((row) => {
    const label = computeBinLabel(row[sourceField], binSize, startAt);

    return {
      ...row,
      [name]: label,
    };
  });
}

/**
 * Computes the bin label for a single value.
 * Returns "N/A" for null, undefined, or non-numeric values.
 */
function computeBinLabel(
  value: unknown,
  binSize: number,
  startAt: number
): string {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (typeof value === 'string' && value.trim() === '') {
    return 'N/A';
  }

  const numericValue = typeof value === 'number' ? value : Number(value);

  if (isNaN(numericValue)) {
    return 'N/A';
  }

  const offset = numericValue - startAt;
  const binIndex = Math.floor(offset / binSize);
  const binStart = startAt + binIndex * binSize;
  const binEnd = binStart + binSize;

  return `${binStart}-${binEnd}`;
}
