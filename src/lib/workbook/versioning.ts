import { Workbook } from '../types';
import { generateId } from '../data-engine';

// ============================================================
// TYPES
// ============================================================

export interface WorkbookVersion {
  id: string;
  workbookId: string;
  versionNumber: number;
  timestamp: string;
  description: string;
  snapshot: WorkbookSnapshot;
}

/**
 * A lightweight snapshot of the workbook state (excludes row data
 * to keep version history storage manageable).
 */
export type WorkbookSnapshot = Omit<Workbook, 'dataSources'> & {
  dataSources: {
    id: string;
    name: string;
    fileName: string;
    fieldCount: number;
    rowCount: number;
    importedAt: string;
  }[];
};

export interface VersionDiff {
  field: string;
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
}

export const MAX_VERSIONS_PER_WORKBOOK = 50;

// ============================================================
// SNAPSHOT CREATION
// ============================================================

/**
 * Creates a lightweight snapshot of the workbook state.
 * Strips row data and field details to keep storage small.
 */
export function createSnapshot(workbook: Workbook): WorkbookSnapshot {
  return {
    id: workbook.id,
    name: workbook.name,
    activeDataSourceId: workbook.activeDataSourceId,
    joins: structuredClone(workbook.joins),
    transforms: structuredClone(workbook.transforms),
    sheets: structuredClone(workbook.sheets),
    activeSheetId: workbook.activeSheetId,
    activeChartId: workbook.activeChartId,
    parameters: structuredClone(workbook.parameters),
    parameterActions: structuredClone(workbook.parameterActions),
    groups: structuredClone(workbook.groups),
    bins: structuredClone(workbook.bins),
    createdAt: workbook.createdAt,
    updatedAt: workbook.updatedAt,
    dataSources: workbook.dataSources.map((ds) => ({
      id: ds.id,
      name: ds.name,
      fileName: ds.fileName,
      fieldCount: ds.fields.length,
      rowCount: ds.rowCount,
      importedAt: ds.importedAt,
    })),
  };
}

// ============================================================
// VERSION MANAGEMENT
// ============================================================

/**
 * Creates a new version entry from the current workbook state.
 */
export function createVersion(
  workbook: Workbook,
  description: string,
  existingVersions: WorkbookVersion[]
): WorkbookVersion {
  const workbookVersions = existingVersions.filter(
    (v) => v.workbookId === workbook.id
  );
  const nextVersionNumber = workbookVersions.length > 0
    ? Math.max(...workbookVersions.map((v) => v.versionNumber)) + 1
    : 1;

  return {
    id: generateId(),
    workbookId: workbook.id,
    versionNumber: nextVersionNumber,
    timestamp: new Date().toISOString(),
    description,
    snapshot: createSnapshot(workbook),
  };
}

/**
 * Enforces the max version limit by trimming oldest versions.
 * Returns a new array with at most MAX_VERSIONS_PER_WORKBOOK entries
 * per workbook.
 */
export function enforceVersionLimit(
  versions: WorkbookVersion[],
  workbookId: string
): WorkbookVersion[] {
  const workbookVersions = versions
    .filter((v) => v.workbookId === workbookId)
    .sort((a, b) => a.versionNumber - b.versionNumber);

  const otherVersions = versions.filter((v) => v.workbookId !== workbookId);

  if (workbookVersions.length <= MAX_VERSIONS_PER_WORKBOOK) {
    return versions;
  }

  const trimmed = workbookVersions.slice(
    workbookVersions.length - MAX_VERSIONS_PER_WORKBOOK
  );

  return [...otherVersions, ...trimmed];
}

// ============================================================
// ROLLBACK
// ============================================================

/**
 * Restores a workbook to a previous version's snapshot.
 * Preserves the current dataSources rows (since snapshots don't store them)
 * but restores all structural configuration.
 */
export function rollbackToVersion(
  currentWorkbook: Workbook,
  version: WorkbookVersion
): Workbook {
  const { snapshot } = version;

  return {
    ...currentWorkbook,
    name: snapshot.name,
    activeDataSourceId: snapshot.activeDataSourceId,
    joins: structuredClone(snapshot.joins),
    transforms: structuredClone(snapshot.transforms),
    sheets: structuredClone(snapshot.sheets),
    activeSheetId: snapshot.activeSheetId,
    activeChartId: snapshot.activeChartId,
    parameters: structuredClone(snapshot.parameters),
    parameterActions: structuredClone(snapshot.parameterActions),
    groups: structuredClone(snapshot.groups),
    bins: structuredClone(snapshot.bins),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================
// DIFF UTILITY
// ============================================================

/**
 * Compares two version snapshots and returns a list of changes.
 * Performs a shallow structural comparison of top-level fields
 * and array-level diffs for collections.
 */
export function diffVersions(
  versionA: WorkbookVersion,
  versionB: WorkbookVersion
): VersionDiff[] {
  const diffs: VersionDiff[] = [];
  const a = versionA.snapshot;
  const b = versionB.snapshot;

  // Compare scalar fields
  if (a.name !== b.name) {
    diffs.push({
      field: 'name',
      path: 'name',
      type: 'changed',
      oldValue: a.name,
      newValue: b.name,
    });
  }

  if (a.activeDataSourceId !== b.activeDataSourceId) {
    diffs.push({
      field: 'activeDataSourceId',
      path: 'activeDataSourceId',
      type: 'changed',
      oldValue: a.activeDataSourceId,
      newValue: b.activeDataSourceId,
    });
  }

  // Compare data sources
  diffArrayById(diffs, 'dataSources', a.dataSources, b.dataSources);

  // Compare sheets
  diffArrayById(diffs, 'sheets', a.sheets, b.sheets);

  // Compare joins
  diffArrayById(diffs, 'joins', a.joins, b.joins);

  // Compare transforms
  diffArrayById(diffs, 'transforms', a.transforms, b.transforms);

  // Compare parameters
  diffArrayById(diffs, 'parameters', a.parameters, b.parameters);

  // Compare parameterActions
  diffArrayById(diffs, 'parameterActions', a.parameterActions, b.parameterActions);

  // Compare groups
  diffArrayById(diffs, 'groups', a.groups, b.groups);

  // Compare bins
  diffArrayById(diffs, 'bins', a.bins, b.bins);

  return diffs;
}

/**
 * Compares two arrays of objects by their `id` field and records
 * additions, removals, and changes.
 */
function diffArrayById(
  diffs: VersionDiff[],
  field: string,
  oldArr: { id: string }[],
  newArr: { id: string }[]
): void {
  const oldIds = new Set(oldArr.map((item) => item.id));
  const newIds = new Set(newArr.map((item) => item.id));

  // Added items
  for (const item of newArr) {
    if (!oldIds.has(item.id)) {
      diffs.push({
        field,
        path: `${field}[${item.id}]`,
        type: 'added',
        newValue: item,
      });
    }
  }

  // Removed items
  for (const item of oldArr) {
    if (!newIds.has(item.id)) {
      diffs.push({
        field,
        path: `${field}[${item.id}]`,
        type: 'removed',
        oldValue: item,
      });
    }
  }

  // Changed items
  for (const newItem of newArr) {
    if (oldIds.has(newItem.id)) {
      const oldItem = oldArr.find((o) => o.id === newItem.id);
      if (oldItem && JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
        diffs.push({
          field,
          path: `${field}[${newItem.id}]`,
          type: 'changed',
          oldValue: oldItem,
          newValue: newItem,
        });
      }
    }
  }
}
