import { describe, it, expect } from 'vitest';
import {
  saveAsTemplate,
  loadTemplate,
  getAvailableTemplates,
  findTemplateById,
  filterTemplatesByCategory,
  BUILT_IN_TEMPLATES,
  WorkbookTemplate,
} from './templates';
import { Workbook } from '../types';

function createTestWorkbook(overrides: Partial<Workbook> = {}): Workbook {
  return {
    id: 'wb-1',
    name: 'Test Workbook',
    dataSources: [
      {
        id: 'ds-1',
        name: 'Sales Data',
        fileName: 'sales.csv',
        fields: [
          {
            id: 'f1',
            name: 'region',
            originalName: 'region',
            type: 'string',
            role: 'dimension',
            sampleValues: ['North', 'South'],
            nullCount: 0,
            uniqueCount: 4,
          },
          {
            id: 'f2',
            name: 'revenue',
            originalName: 'revenue',
            type: 'number',
            role: 'measure',
            sampleValues: ['100', '200'],
            nullCount: 0,
            uniqueCount: 50,
          },
        ],
        rows: [
          { region: 'North', revenue: 100 },
          { region: 'South', revenue: 200 },
          { region: 'East', revenue: 150 },
          { region: 'West', revenue: 300 },
          { region: 'Central', revenue: 250 },
          { region: 'Northeast', revenue: 175 },
        ],
        rowCount: 6,
        importedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    activeDataSourceId: 'ds-1',
    joins: [],
    transforms: [
      { id: 't1', type: 'sort', config: { field: 'revenue', order: 'desc' }, enabled: true },
    ],
    sheets: [
      {
        id: 'sheet-1',
        title: 'Dashboard',
        charts: [
          {
            id: 'chart-1',
            title: 'Revenue by Region',
            chartType: 'bar',
            xAxis: { field: 'region', aggregation: 'NONE' },
            yAxis: { field: 'revenue', aggregation: 'SUM' },
            color: { field: null, aggregation: 'NONE' },
            size: { field: null, aggregation: 'NONE' },
            label: { field: null, aggregation: 'NONE' },
            filters: [],
            sortBy: null,
            sortOrder: 'none',
            showTrendLine: false,
            showDataLabels: true,
            showLegend: true,
            colorPalette: ['#3B82F6'],
            width: 6,
            height: 4,
          },
        ],
        globalFilters: [],
        layout: 'auto',
      },
    ],
    activeSheetId: 'sheet-1',
    activeChartId: 'chart-1',
    parameters: [
      {
        id: 'p1',
        name: 'Region Filter',
        dataType: 'string',
        currentValue: 'North',
        defaultValue: 'North',
        allowedValues: ['North', 'South', 'East', 'West'],
      },
    ],
    parameterActions: [],
    groups: [
      {
        id: 'g1',
        name: 'Region Group',
        sourceField: 'region',
        groups: [{ name: 'Coastal', values: ['East', 'West'] }],
        otherGroupName: 'Inland',
      },
    ],
    bins: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('saveAsTemplate', () => {
  it('strips row data from data sources', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    // Template should not contain full rows
    expect(template.placeholderDataSources[0].sampleRows).toHaveLength(5);
    expect(template.placeholderDataSources[0]).not.toHaveProperty('rows');
    expect(template.placeholderDataSources[0]).not.toHaveProperty('rowCount');
  });

  it('preserves chart configuration in sheets', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    expect(template.sheets).toHaveLength(1);
    expect(template.sheets[0].charts).toHaveLength(1);
    expect(template.sheets[0].charts[0].title).toBe('Revenue by Region');
    expect(template.sheets[0].charts[0].chartType).toBe('bar');
  });

  it('preserves parameters and groups', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    expect(template.parameters).toHaveLength(1);
    expect(template.parameters[0].name).toBe('Region Filter');
    expect(template.groups).toHaveLength(1);
    expect(template.groups[0].name).toBe('Region Group');
  });

  it('preserves transforms', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    expect(template.transforms).toHaveLength(1);
    expect(template.transforms[0].type).toBe('sort');
  });

  it('preserves field definitions in placeholder data sources', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    const pds = template.placeholderDataSources[0];
    expect(pds.fields).toHaveLength(2);
    expect(pds.fields[0].name).toBe('region');
    expect(pds.fields[1].name).toBe('revenue');
    expect(pds.fields[0].type).toBe('string');
    expect(pds.fields[1].type).toBe('number');
  });

  it('assigns template metadata correctly', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(
      workbook,
      'Sales Template',
      'For sales teams',
      'sales'
    );

    expect(template.name).toBe('Sales Template');
    expect(template.description).toBe('For sales teams');
    expect(template.category).toBe('sales');
    expect(template.id).toBeTruthy();
    expect(template.createdAt).toBeTruthy();
  });

  it('defaults category to custom when not specified', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    expect(template.category).toBe('custom');
  });

  it('deep clones data to prevent mutation', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    workbook.sheets[0].title = 'Modified';
    workbook.parameters[0].name = 'Modified Param';

    expect(template.sheets[0].title).toBe('Dashboard');
    expect(template.parameters[0].name).toBe('Region Filter');
  });

  it('limits sample rows to 5', () => {
    const workbook = createTestWorkbook();
    // Workbook has 6 rows
    expect(workbook.dataSources[0].rows.length).toBe(6);

    const template = saveAsTemplate(workbook, 'My Template', 'A test template');
    expect(template.placeholderDataSources[0].sampleRows).toHaveLength(5);
  });
});

describe('loadTemplate', () => {
  it('creates a new workbook with unique id', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'A test template');

    const loaded = loadTemplate(template);

    expect(loaded.id).toBeTruthy();
    expect(loaded.id).not.toBe(workbook.id);
  });

  it('names the workbook with template name suffix', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'Sales Template', 'desc');

    const loaded = loadTemplate(template);

    expect(loaded.name).toBe('Sales Template (from template)');
  });

  it('creates data sources from placeholder data', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'desc');

    const loaded = loadTemplate(template);

    expect(loaded.dataSources).toHaveLength(1);
    expect(loaded.dataSources[0].name).toBe('Sales Data');
    expect(loaded.dataSources[0].fields).toHaveLength(2);
    expect(loaded.dataSources[0].rows).toHaveLength(5); // sample rows
    expect(loaded.dataSources[0].rowCount).toBe(5);
  });

  it('restores sheets and chart configurations', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'desc');

    const loaded = loadTemplate(template);

    expect(loaded.sheets).toHaveLength(1);
    expect(loaded.sheets[0].title).toBe('Dashboard');
    expect(loaded.sheets[0].charts).toHaveLength(1);
    expect(loaded.sheets[0].charts[0].chartType).toBe('bar');
  });

  it('restores parameters and groups', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'desc');

    const loaded = loadTemplate(template);

    expect(loaded.parameters).toHaveLength(1);
    expect(loaded.parameters[0].name).toBe('Region Filter');
    expect(loaded.groups).toHaveLength(1);
    expect(loaded.groups[0].name).toBe('Region Group');
  });

  it('restores transforms', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'desc');

    const loaded = loadTemplate(template);

    expect(loaded.transforms).toHaveLength(1);
    expect(loaded.transforms[0].type).toBe('sort');
  });

  it('sets activeDataSourceId to first data source', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'desc');

    const loaded = loadTemplate(template);

    expect(loaded.activeDataSourceId).toBe(loaded.dataSources[0].id);
  });

  it('sets activeSheetId to first sheet', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'desc');

    const loaded = loadTemplate(template);

    expect(loaded.activeSheetId).toBe(loaded.sheets[0].id);
  });

  it('sets timestamps to current time', () => {
    const workbook = createTestWorkbook();
    const template = saveAsTemplate(workbook, 'My Template', 'desc');

    const before = new Date().toISOString();
    const loaded = loadTemplate(template);

    expect(loaded.createdAt >= before).toBe(true);
    expect(loaded.updatedAt >= before).toBe(true);
  });

  it('handles template with no data sources', () => {
    const template: WorkbookTemplate = {
      id: 'empty-template',
      name: 'Empty',
      description: 'Empty template',
      category: 'general',
      sheets: [
        { id: 's1', title: 'Sheet 1', charts: [], globalFilters: [], layout: 'auto' },
      ],
      parameters: [],
      parameterActions: [],
      groups: [],
      bins: [],
      joins: [],
      transforms: [],
      placeholderDataSources: [],
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const loaded = loadTemplate(template);

    expect(loaded.dataSources).toHaveLength(0);
    expect(loaded.activeDataSourceId).toBeNull();
  });

  it('handles template with no sheets by creating a default sheet', () => {
    const template: WorkbookTemplate = {
      id: 'no-sheets-template',
      name: 'No Sheets',
      description: 'Template without sheets',
      category: 'general',
      sheets: [],
      parameters: [],
      parameterActions: [],
      groups: [],
      bins: [],
      joins: [],
      transforms: [],
      placeholderDataSources: [],
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const loaded = loadTemplate(template);

    expect(loaded.sheets).toHaveLength(1);
    expect(loaded.sheets[0].title).toBe('Sheet 1');
    expect(loaded.activeSheetId).toBe(loaded.sheets[0].id);
  });
});

describe('BUILT_IN_TEMPLATES', () => {
  it('includes three built-in templates', () => {
    expect(BUILT_IN_TEMPLATES).toHaveLength(3);
  });

  it('includes Sales Dashboard template', () => {
    const sales = BUILT_IN_TEMPLATES.find((t) => t.id === 'builtin-sales-dashboard');
    expect(sales).toBeDefined();
    expect(sales!.name).toBe('Sales Dashboard');
    expect(sales!.category).toBe('sales');
    expect(sales!.sheets.length).toBeGreaterThan(0);
    expect(sales!.placeholderDataSources.length).toBeGreaterThan(0);
  });

  it('includes Marketing Funnel template', () => {
    const marketing = BUILT_IN_TEMPLATES.find(
      (t) => t.id === 'builtin-marketing-funnel'
    );
    expect(marketing).toBeDefined();
    expect(marketing!.name).toBe('Marketing Funnel');
    expect(marketing!.category).toBe('marketing');
    expect(marketing!.sheets.length).toBeGreaterThan(0);
  });

  it('includes Financial Report template', () => {
    const finance = BUILT_IN_TEMPLATES.find(
      (t) => t.id === 'builtin-financial-report'
    );
    expect(finance).toBeDefined();
    expect(finance!.name).toBe('Financial Report');
    expect(finance!.category).toBe('finance');
    expect(finance!.sheets.length).toBeGreaterThan(0);
  });

  it('all built-in templates can be loaded into workbooks', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      const workbook = loadTemplate(template);
      expect(workbook.id).toBeTruthy();
      expect(workbook.sheets.length).toBeGreaterThan(0);
      expect(workbook.name).toContain('(from template)');
    }
  });

  it('all built-in templates have valid chart configurations', () => {
    for (const template of BUILT_IN_TEMPLATES) {
      for (const sheet of template.sheets) {
        for (const chart of sheet.charts) {
          expect(chart.id).toBeTruthy();
          expect(chart.title).toBeTruthy();
          expect(chart.chartType).toBeTruthy();
          expect(chart.width).toBeGreaterThan(0);
          expect(chart.height).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('getAvailableTemplates', () => {
  it('returns built-in templates when no custom templates provided', () => {
    const templates = getAvailableTemplates();
    expect(templates).toHaveLength(3);
  });

  it('combines built-in and custom templates', () => {
    const custom: WorkbookTemplate = {
      id: 'custom-1',
      name: 'Custom Template',
      description: 'A custom template',
      category: 'custom',
      sheets: [],
      parameters: [],
      parameterActions: [],
      groups: [],
      bins: [],
      joins: [],
      transforms: [],
      placeholderDataSources: [],
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const templates = getAvailableTemplates([custom]);
    expect(templates).toHaveLength(4);
    expect(templates[3].id).toBe('custom-1');
  });
});

describe('findTemplateById', () => {
  it('finds a built-in template by id', () => {
    const template = findTemplateById('builtin-sales-dashboard');
    expect(template).toBeDefined();
    expect(template!.name).toBe('Sales Dashboard');
  });

  it('finds a custom template by id', () => {
    const custom: WorkbookTemplate = {
      id: 'custom-find-me',
      name: 'Find Me',
      description: 'desc',
      category: 'custom',
      sheets: [],
      parameters: [],
      parameterActions: [],
      groups: [],
      bins: [],
      joins: [],
      transforms: [],
      placeholderDataSources: [],
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const template = findTemplateById('custom-find-me', [custom]);
    expect(template).toBeDefined();
    expect(template!.name).toBe('Find Me');
  });

  it('returns undefined for non-existent id', () => {
    const template = findTemplateById('non-existent');
    expect(template).toBeUndefined();
  });
});

describe('filterTemplatesByCategory', () => {
  it('filters templates by sales category', () => {
    const templates = filterTemplatesByCategory('sales');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.category === 'sales')).toBe(true);
  });

  it('filters templates by marketing category', () => {
    const templates = filterTemplatesByCategory('marketing');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.category === 'marketing')).toBe(true);
  });

  it('filters templates by finance category', () => {
    const templates = filterTemplatesByCategory('finance');
    expect(templates.length).toBeGreaterThan(0);
    expect(templates.every((t) => t.category === 'finance')).toBe(true);
  });

  it('includes custom templates in filter results', () => {
    const custom: WorkbookTemplate = {
      id: 'custom-sales',
      name: 'Custom Sales',
      description: 'desc',
      category: 'sales',
      sheets: [],
      parameters: [],
      parameterActions: [],
      groups: [],
      bins: [],
      joins: [],
      transforms: [],
      placeholderDataSources: [],
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const templates = filterTemplatesByCategory('sales', [custom]);
    expect(templates.length).toBe(2);
  });

  it('returns empty array for category with no templates', () => {
    const templates = filterTemplatesByCategory('general');
    expect(templates).toHaveLength(0);
  });
});
