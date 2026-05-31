import { Workbook, DashboardSheet, ChartConfig, DataSource, DataField } from '../types';
import { generateId } from '../data-engine';

// ============================================================
// TYPES
// ============================================================

export interface WorkbookTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  sheets: DashboardSheet[];
  parameters: Workbook['parameters'];
  parameterActions: Workbook['parameterActions'];
  groups: Workbook['groups'];
  bins: Workbook['bins'];
  joins: Workbook['joins'];
  transforms: Workbook['transforms'];
  placeholderDataSources: PlaceholderDataSource[];
  createdAt: string;
}

export type TemplateCategory =
  | 'sales'
  | 'marketing'
  | 'finance'
  | 'general'
  | 'custom';

export interface PlaceholderDataSource {
  id: string;
  name: string;
  fileName: string;
  fields: DataField[];
  sampleRows: Record<string, unknown>[];
}

// ============================================================
// TEMPLATE CREATION — Save workbook as template
// ============================================================

/**
 * Saves a workbook as a template by stripping all row data
 * and keeping only structure and configuration.
 */
export function saveAsTemplate(
  workbook: Workbook,
  templateName: string,
  description: string,
  category: TemplateCategory = 'custom'
): WorkbookTemplate {
  return {
    id: generateId(),
    name: templateName,
    description,
    category,
    sheets: structuredClone(workbook.sheets),
    parameters: structuredClone(workbook.parameters),
    parameterActions: structuredClone(workbook.parameterActions),
    groups: structuredClone(workbook.groups),
    bins: structuredClone(workbook.bins),
    joins: structuredClone(workbook.joins),
    transforms: structuredClone(workbook.transforms),
    placeholderDataSources: workbook.dataSources.map((ds) =>
      createPlaceholderDataSource(ds)
    ),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Creates a placeholder data source from a real data source.
 * Keeps field definitions and a small sample of rows for preview.
 */
function createPlaceholderDataSource(dataSource: DataSource): PlaceholderDataSource {
  const sampleRows = dataSource.rows.slice(0, 5).map((row) => {
    const sample: Record<string, unknown> = {};
    dataSource.fields.forEach((field) => {
      sample[field.name] = row[field.name] ?? null;
    });
    return sample;
  });

  return {
    id: dataSource.id,
    name: dataSource.name,
    fileName: dataSource.fileName,
    fields: structuredClone(dataSource.fields),
    sampleRows,
  };
}

// ============================================================
// TEMPLATE LOADING — Create workbook from template
// ============================================================

/**
 * Creates a new workbook from a template, using placeholder data
 * so the user can see the structure before importing real data.
 */
export function loadTemplate(template: WorkbookTemplate): Workbook {
  const now = new Date().toISOString();
  const workbookId = generateId();

  const dataSources: DataSource[] = template.placeholderDataSources.map((pds) => ({
    id: generateId(),
    name: pds.name,
    fileName: pds.fileName,
    fields: structuredClone(pds.fields),
    rows: structuredClone(pds.sampleRows),
    rowCount: pds.sampleRows.length,
    importedAt: now,
  }));

  const activeDataSourceId = dataSources.length > 0 ? dataSources[0].id : null;
  const activeSheetId = template.sheets.length > 0
    ? template.sheets[0].id
    : generateId();

  const sheets: DashboardSheet[] = template.sheets.length > 0
    ? structuredClone(template.sheets)
    : [{ id: activeSheetId, title: 'Sheet 1', charts: [], globalFilters: [], layout: 'auto' }];

  return {
    id: workbookId,
    name: `${template.name} (from template)`,
    dataSources,
    activeDataSourceId,
    joins: structuredClone(template.joins),
    transforms: structuredClone(template.transforms),
    sheets,
    activeSheetId: sheets[0].id,
    activeChartId: sheets[0].charts.length > 0 ? sheets[0].charts[0].id : null,
    parameters: structuredClone(template.parameters),
    parameterActions: structuredClone(template.parameterActions),
    groups: structuredClone(template.groups),
    bins: structuredClone(template.bins),
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================
// BUILT-IN TEMPLATES
// ============================================================

import salesDashboardTemplate from './built-in-templates/sales-dashboard.json';
import marketingFunnelTemplate from './built-in-templates/marketing-funnel.json';
import financialReportTemplate from './built-in-templates/financial-report.json';

export const BUILT_IN_TEMPLATES: WorkbookTemplate[] = [
  salesDashboardTemplate as WorkbookTemplate,
  marketingFunnelTemplate as WorkbookTemplate,
  financialReportTemplate as WorkbookTemplate,
];

/**
 * Returns all available templates (built-in + custom).
 */
export function getAvailableTemplates(
  customTemplates: WorkbookTemplate[] = []
): WorkbookTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...customTemplates];
}

/**
 * Finds a template by its ID.
 */
export function findTemplateById(
  templateId: string,
  customTemplates: WorkbookTemplate[] = []
): WorkbookTemplate | undefined {
  return getAvailableTemplates(customTemplates).find((t) => t.id === templateId);
}

/**
 * Filters templates by category.
 */
export function filterTemplatesByCategory(
  category: TemplateCategory,
  customTemplates: WorkbookTemplate[] = []
): WorkbookTemplate[] {
  return getAvailableTemplates(customTemplates).filter((t) => t.category === category);
}
