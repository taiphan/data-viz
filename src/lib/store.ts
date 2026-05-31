import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Workbook,
  DataSource,
  DashboardSheet,
  ChartConfig,
  ChartType,
  ChartEncoding,
  ChartFilter,
  TransformStep,
  DataJoin,
  AggregationType,
  Parameter,
  ParameterAction,
  GroupDefinition,
  BinDefinition,
} from './types';
import {
  ConnectionProfile,
  SchemaInfo,
} from './connectors/types';
import { generateId } from './data-engine';
import {
  WorkbookVersion,
  VersionDiff,
  createVersion,
  enforceVersionLimit,
  rollbackToVersion,
  diffVersions,
  MAX_VERSIONS_PER_WORKBOOK,
} from './workbook/versioning';

function createDefaultChart(): ChartConfig {
  return {
    id: generateId(),
    title: 'New Chart',
    chartType: 'bar',
    xAxis: { field: null, aggregation: 'NONE' },
    yAxis: { field: null, aggregation: 'SUM' },
    color: { field: null, aggregation: 'NONE' },
    size: { field: null, aggregation: 'NONE' },
    label: { field: null, aggregation: 'NONE' },
    filters: [],
    sortBy: null,
    sortOrder: 'none',
    showTrendLine: false,
    showDataLabels: false,
    showLegend: true,
    colorPalette: [],
    width: 6,
    height: 4,
  };
}

function createDefaultSheet(index: number = 1): DashboardSheet {
  const chart = createDefaultChart();
  return {
    id: generateId(),
    title: `Sheet ${index}`,
    charts: [chart],
    globalFilters: [],
    layout: 'auto',
  };
}

interface ConnectorState {
  profiles: ConnectionProfile[];
  activeConnectionId: string | null;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'error';
  connectionError: string | null;
  schemaInfo: SchemaInfo | null;

  // Profile CRUD
  addProfile: (profile: ConnectionProfile) => void;
  updateProfile: (id: string, updates: Partial<ConnectionProfile>) => void;
  removeProfile: (id: string) => void;
  setActiveConnection: (id: string | null) => void;
  setConnectionStatus: (status: ConnectorState['connectionStatus']) => void;
  setConnectionError: (error: string | null) => void;
  setSchemaInfo: (info: SchemaInfo | null) => void;
}

interface ParameterState {
  // Parameter CRUD
  addParameter: (param: Parameter) => void;
  updateParameter: (id: string, updates: Partial<Parameter>) => void;
  updateParameterValue: (id: string, value: string | number) => void;
  removeParameter: (id: string) => void;

  // ParameterAction CRUD
  addParameterAction: (action: ParameterAction) => void;
  removeParameterAction: (id: string) => void;
}

interface VersioningState {
  versions: WorkbookVersion[];

  // Version management
  saveVersion: (description: string) => void;
  rollbackToVersion: (versionId: string) => void;
  deleteVersion: (versionId: string) => void;
  getVersionHistory: () => WorkbookVersion[];
  diffVersions: (versionAId: string, versionBId: string) => VersionDiff[];
}

interface WorkbookState {
  workbook: Workbook;

  // Data source management
  addDataSource: (ds: DataSource) => void;
  removeDataSource: (id: string) => void;
  setActiveDataSource: (id: string) => void;

  // Joins
  addJoin: (join: DataJoin) => void;
  removeJoin: (id: string) => void;

  // Transforms
  addTransform: (transform: TransformStep) => void;
  removeTransform: (id: string) => void;
  toggleTransform: (id: string) => void;

  // Sheet management
  addSheet: () => void;
  removeSheet: (sheetId: string) => void;
  setActiveSheet: (sheetId: string) => void;
  renameSheet: (sheetId: string, title: string) => void;

  // Chart management
  addChart: (sheetId: string) => void;
  removeChart: (sheetId: string, chartId: string) => void;
  setActiveChart: (chartId: string | null) => void;
  updateChart: (sheetId: string, chartId: string, updates: Partial<ChartConfig>) => void;
  duplicateChart: (sheetId: string, chartId: string) => void;

  // Chart encoding shortcuts
  setChartType: (chartId: string, chartType: ChartType) => void;
  setEncoding: (chartId: string, channel: 'xAxis' | 'yAxis' | 'color' | 'size' | 'label', encoding: ChartEncoding) => void;
  addChartFilter: (chartId: string, filter: ChartFilter) => void;
  removeChartFilter: (chartId: string, filterId: string) => void;
  toggleChartFilter: (chartId: string, filterId: string) => void;

  // Global filters
  addGlobalFilter: (sheetId: string, filter: ChartFilter) => void;
  removeGlobalFilter: (sheetId: string, filterId: string) => void;

  // Groups and Bins
  addGroup: (group: GroupDefinition) => void;
  removeGroup: (id: string) => void;
  addBin: (bin: BinDefinition) => void;
  removeBin: (id: string) => void;

  // Helpers
  getActiveSheet: () => DashboardSheet | undefined;
  getActiveChart: () => ChartConfig | undefined;
  getActiveDataSource: () => DataSource | undefined;

  // Workbook
  renameWorkbook: (name: string) => void;
  resetWorkbook: () => void;
  exportWorkbook: () => string;
}

const initialSheet = createDefaultSheet();

export const useWorkbookStore = create<WorkbookState & ConnectorState & ParameterState & VersioningState>()(
  persist(
    (set, get) => ({
      workbook: {
        id: generateId(),
        name: 'Untitled Workbook',
        dataSources: [],
        activeDataSourceId: null,
        joins: [],
        transforms: [],
        sheets: [initialSheet],
        activeSheetId: initialSheet.id,
        activeChartId: initialSheet.charts[0].id,
        parameters: [],
        parameterActions: [],
        groups: [],
        bins: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },

      // ---- Connector State ----
      profiles: [],
      activeConnectionId: null,
      connectionStatus: 'idle',
      connectionError: null,
      schemaInfo: null,

      // ---- Versioning State ----
      versions: [],

      // ---- Profile CRUD ----
      addProfile: (profile) =>
        set((state) => ({
          profiles: [...state.profiles, profile],
        })),

      updateProfile: (id, updates) =>
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
          ),
        })),

      removeProfile: (id) =>
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
          activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
        })),

      setActiveConnection: (id) =>
        set(() => ({ activeConnectionId: id })),

      setConnectionStatus: (status) =>
        set(() => ({ connectionStatus: status })),

      setConnectionError: (error) =>
        set(() => ({ connectionError: error })),

      setSchemaInfo: (info) =>
        set(() => ({ schemaInfo: info })),

      // ---- Parameter CRUD ----
      addParameter: (param) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            parameters: [...state.workbook.parameters, param],
            updatedAt: new Date().toISOString(),
          },
        })),

      updateParameter: (id, updates) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            parameters: state.workbook.parameters.map((p) =>
              p.id === id ? { ...p, ...updates } : p
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      updateParameterValue: (id, value) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            parameters: state.workbook.parameters.map((p) =>
              p.id === id ? { ...p, currentValue: value } : p
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      removeParameter: (id) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            parameters: state.workbook.parameters.filter((p) => p.id !== id),
            parameterActions: state.workbook.parameterActions.filter((a) => a.parameterId !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ---- ParameterAction CRUD ----
      addParameterAction: (action) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            parameterActions: [...state.workbook.parameterActions, action],
            updatedAt: new Date().toISOString(),
          },
        })),

      removeParameterAction: (id) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            parameterActions: state.workbook.parameterActions.filter((a) => a.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ---- Versioning ----
      saveVersion: (description) =>
        set((state) => {
          const version = createVersion(state.workbook, description, state.versions);
          const updatedVersions = enforceVersionLimit(
            [...state.versions, version],
            state.workbook.id
          );
          return { versions: updatedVersions };
        }),

      rollbackToVersion: (versionId) =>
        set((state) => {
          const version = state.versions.find((v) => v.id === versionId);
          if (!version) return state;
          const restoredWorkbook = rollbackToVersion(state.workbook, version);
          return { workbook: restoredWorkbook };
        }),

      deleteVersion: (versionId) =>
        set((state) => ({
          versions: state.versions.filter((v) => v.id !== versionId),
        })),

      getVersionHistory: () => {
        const { workbook, versions } = get();
        return versions
          .filter((v) => v.workbookId === workbook.id)
          .sort((a, b) => b.versionNumber - a.versionNumber);
      },

      diffVersions: (versionAId, versionBId) => {
        const { versions } = get();
        const versionA = versions.find((v) => v.id === versionAId);
        const versionB = versions.find((v) => v.id === versionBId);
        if (!versionA || !versionB) return [];
        return diffVersions(versionA, versionB);
      },

      // ---- Data Sources ----
      addDataSource: (ds) =>
        set((state) => {
          const activeSheetId = state.workbook.activeSheetId || state.workbook.sheets[0]?.id || '';
          const activeChartId = state.workbook.activeChartId || state.workbook.sheets[0]?.charts[0]?.id || null;
          return {
            workbook: {
              ...state.workbook,
              dataSources: [...state.workbook.dataSources, ds],
              activeDataSourceId: ds.id,
              activeSheetId,
              activeChartId,
              name: state.workbook.dataSources.length === 0 ? ds.name : state.workbook.name,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      removeDataSource: (id) =>
        set((state) => {
          const remaining = state.workbook.dataSources.filter((d) => d.id !== id);
          return {
            workbook: {
              ...state.workbook,
              dataSources: remaining,
              activeDataSourceId: remaining[0]?.id || null,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      setActiveDataSource: (id) =>
        set((state) => ({
          workbook: { ...state.workbook, activeDataSourceId: id },
        })),

      // ---- Joins ----
      addJoin: (join) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            joins: [...state.workbook.joins, join],
            updatedAt: new Date().toISOString(),
          },
        })),

      removeJoin: (id) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            joins: state.workbook.joins.filter((j) => j.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ---- Transforms ----
      addTransform: (transform) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            transforms: [...state.workbook.transforms, transform],
            updatedAt: new Date().toISOString(),
          },
        })),

      removeTransform: (id) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            transforms: state.workbook.transforms.filter((t) => t.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      toggleTransform: (id) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            transforms: state.workbook.transforms.map((t) =>
              t.id === id ? { ...t, enabled: !t.enabled } : t
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ---- Sheets ----
      addSheet: () =>
        set((state) => {
          const newSheet = createDefaultSheet(state.workbook.sheets.length + 1);
          return {
            workbook: {
              ...state.workbook,
              sheets: [...state.workbook.sheets, newSheet],
              activeSheetId: newSheet.id,
              activeChartId: newSheet.charts[0].id,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      removeSheet: (sheetId) =>
        set((state) => {
          if (state.workbook.sheets.length <= 1) return state;
          const sheets = state.workbook.sheets.filter((s) => s.id !== sheetId);
          return {
            workbook: {
              ...state.workbook,
              sheets,
              activeSheetId: sheets[0].id,
              activeChartId: sheets[0].charts[0]?.id || null,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      setActiveSheet: (sheetId) =>
        set((state) => {
          const sheet = state.workbook.sheets.find((s) => s.id === sheetId);
          return {
            workbook: {
              ...state.workbook,
              activeSheetId: sheetId,
              activeChartId: sheet?.charts[0]?.id || null,
            },
          };
        }),

      renameSheet: (sheetId, title) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            sheets: state.workbook.sheets.map((s) =>
              s.id === sheetId ? { ...s, title } : s
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ---- Charts ----
      addChart: (sheetId) =>
        set((state) => {
          const newChart = createDefaultChart();
          return {
            workbook: {
              ...state.workbook,
              sheets: state.workbook.sheets.map((s) =>
                s.id === sheetId ? { ...s, charts: [...s.charts, newChart] } : s
              ),
              activeChartId: newChart.id,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      removeChart: (sheetId, chartId) =>
        set((state) => {
          const sheet = state.workbook.sheets.find((s) => s.id === sheetId);
          if (!sheet || sheet.charts.length <= 1) return state;
          const charts = sheet.charts.filter((c) => c.id !== chartId);
          return {
            workbook: {
              ...state.workbook,
              sheets: state.workbook.sheets.map((s) =>
                s.id === sheetId ? { ...s, charts } : s
              ),
              activeChartId: charts[0]?.id || null,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      setActiveChart: (chartId) =>
        set((state) => ({
          workbook: { ...state.workbook, activeChartId: chartId },
        })),

      updateChart: (sheetId, chartId, updates) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            sheets: state.workbook.sheets.map((s) =>
              s.id === sheetId
                ? { ...s, charts: s.charts.map((c) => c.id === chartId ? { ...c, ...updates } : c) }
                : s
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      duplicateChart: (sheetId, chartId) =>
        set((state) => {
          const sheet = state.workbook.sheets.find((s) => s.id === sheetId);
          const chart = sheet?.charts.find((c) => c.id === chartId);
          if (!chart) return state;
          const newChart = { ...chart, id: generateId(), title: `${chart.title} (copy)` };
          return {
            workbook: {
              ...state.workbook,
              sheets: state.workbook.sheets.map((s) =>
                s.id === sheetId ? { ...s, charts: [...s.charts, newChart] } : s
              ),
              activeChartId: newChart.id,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      // ---- Encoding shortcuts ----
      setChartType: (chartId, chartType) => {
        const { workbook, updateChart } = get();
        const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);
        if (sheet) updateChart(sheet.id, chartId, { chartType });
      },

      setEncoding: (chartId, channel, encoding) => {
        const { workbook, updateChart } = get();
        const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);
        if (sheet) updateChart(sheet.id, chartId, { [channel]: encoding });
      },

      addChartFilter: (chartId, filter) => {
        const { workbook, updateChart } = get();
        const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);
        const chart = sheet?.charts.find((c) => c.id === chartId);
        if (sheet && chart) {
          updateChart(sheet.id, chartId, { filters: [...chart.filters, filter] });
        }
      },

      removeChartFilter: (chartId, filterId) => {
        const { workbook, updateChart } = get();
        const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);
        const chart = sheet?.charts.find((c) => c.id === chartId);
        if (sheet && chart) {
          updateChart(sheet.id, chartId, { filters: chart.filters.filter((f) => f.id !== filterId) });
        }
      },

      toggleChartFilter: (chartId, filterId) => {
        const { workbook, updateChart } = get();
        const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);
        const chart = sheet?.charts.find((c) => c.id === chartId);
        if (sheet && chart) {
          updateChart(sheet.id, chartId, {
            filters: chart.filters.map((f) => f.id === filterId ? { ...f, enabled: !f.enabled } : f),
          });
        }
      },

      // ---- Global filters ----
      addGlobalFilter: (sheetId, filter) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            sheets: state.workbook.sheets.map((s) =>
              s.id === sheetId ? { ...s, globalFilters: [...s.globalFilters, filter] } : s
            ),
          },
        })),

      removeGlobalFilter: (sheetId, filterId) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            sheets: state.workbook.sheets.map((s) =>
              s.id === sheetId
                ? { ...s, globalFilters: s.globalFilters.filter((f) => f.id !== filterId) }
                : s
            ),
          },
        })),

      // ---- Groups and Bins ----
      addGroup: (group) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            groups: [...state.workbook.groups, group],
            updatedAt: new Date().toISOString(),
          },
        })),

      removeGroup: (id) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            groups: state.workbook.groups.filter((g) => g.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      addBin: (bin) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            bins: [...state.workbook.bins, bin],
            updatedAt: new Date().toISOString(),
          },
        })),

      removeBin: (id) =>
        set((state) => ({
          workbook: {
            ...state.workbook,
            bins: state.workbook.bins.filter((b) => b.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ---- Helpers ----
      getActiveSheet: () => {
        const { workbook } = get();
        return workbook.sheets.find((s) => s.id === workbook.activeSheetId);
      },

      getActiveChart: () => {
        const { workbook } = get();
        const sheet = workbook.sheets.find((s) => s.id === workbook.activeSheetId);
        return sheet?.charts.find((c) => c.id === workbook.activeChartId);
      },

      getActiveDataSource: () => {
        const { workbook } = get();
        return workbook.dataSources.find((d) => d.id === workbook.activeDataSourceId);
      },

      // ---- Workbook ----
      renameWorkbook: (name) =>
        set((state) => ({
          workbook: { ...state.workbook, name, updatedAt: new Date().toISOString() },
        })),

      resetWorkbook: () => {
        const sheet = createDefaultSheet();
        set({
          workbook: {
            id: generateId(),
            name: 'Untitled Workbook',
            dataSources: [],
            activeDataSourceId: null,
            joins: [],
            transforms: [],
            sheets: [sheet],
            activeSheetId: sheet.id,
            activeChartId: sheet.charts[0].id,
            parameters: [],
            parameterActions: [],
            groups: [],
            bins: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          profiles: [],
          activeConnectionId: null,
          connectionStatus: 'idle',
          connectionError: null,
          schemaInfo: null,
          versions: [],
        });
      },

      exportWorkbook: () => {
        const { workbook } = get();
        // Export without row data (too large)
        const exportable = {
          ...workbook,
          dataSources: workbook.dataSources.map((ds) => ({
            ...ds,
            rows: [],
            rowCount: ds.rowCount,
          })),
        };
        return JSON.stringify(exportable, null, 2);
      },
    }),
    {
      name: 'data-viz-workbook-v4',
      partialize: (state) => ({
        workbook: {
          ...state.workbook,
          dataSources: state.workbook.dataSources.map((ds) => ({
            ...ds,
            rows: [], // Don't persist rows
          })),
        },
        profiles: state.profiles,
        versions: state.versions,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<WorkbookState & ConnectorState & ParameterState & VersioningState>;
        const merged = { ...current, ...persistedState };
        // Fix stale activeSheetId/activeChartId
        if (merged.workbook) {
          const wb = merged.workbook;
          if (!wb.activeSheetId || !wb.sheets.find((s: DashboardSheet) => s.id === wb.activeSheetId)) {
            wb.activeSheetId = wb.sheets[0]?.id || '';
          }
          const activeSheet = wb.sheets.find((s: DashboardSheet) => s.id === wb.activeSheetId);
          if (!wb.activeChartId || !activeSheet?.charts.find((c: ChartConfig) => c.id === wb.activeChartId)) {
            wb.activeChartId = activeSheet?.charts[0]?.id || null;
          }
          // Ensure new arrays exist for backward compatibility
          if (!wb.parameters) wb.parameters = [];
          if (!wb.parameterActions) wb.parameterActions = [];
          if (!wb.groups) wb.groups = [];
          if (!wb.bins) wb.bins = [];
        }
        // Ensure connector state defaults
        if (!merged.profiles) merged.profiles = [];
        merged.activeConnectionId = null;
        merged.connectionStatus = 'idle';
        merged.connectionError = null;
        merged.schemaInfo = null;
        // Ensure versioning state
        if (!merged.versions) merged.versions = [];
        return merged as WorkbookState & ConnectorState & ParameterState & VersioningState;
      },
    }
  )
);
