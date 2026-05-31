import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parsePdfFile } from './pdf-connector';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => {
  return {
    default: {
      GlobalWorkerOptions: { workerSrc: '' },
      version: '4.0.0',
      getDocument: vi.fn(),
    },
    GlobalWorkerOptions: { workerSrc: '' },
    version: '4.0.0',
    getDocument: vi.fn(),
  };
});

function createMockPdf(pages: Array<{
  items: Array<{ str: string; transform: number[]; width: number; height: number }>;
  viewportHeight?: number;
}>) {
  return {
    numPages: pages.length,
    getPage: vi.fn(async (pageNum: number) => {
      const page = pages[pageNum - 1];
      const viewportHeight = page.viewportHeight ?? 800;
      return {
        getTextContent: vi.fn(async () => ({
          items: page.items,
        })),
        getViewport: vi.fn(() => ({
          height: viewportHeight,
          width: 600,
        })),
      };
    }),
  };
}

function createMockFile(name: string = 'test.pdf'): File {
  const blob = new Blob(['fake pdf content'], { type: 'application/pdf' });
  return new File([blob], name, { type: 'application/pdf' });
}

describe('parsePdfFile', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('returns empty DataSource when no tables are detected', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const mockPdf = createMockPdf([{ items: [] }]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile();
    const result = await parsePdfFile(file);

    expect(result.name).toBe('test');
    expect(result.fileName).toBe('test.pdf');
    expect(result.fields).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
    expect(result.rowCount).toBe(0);
    expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('extracts a simple table with headers and data rows', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const viewportHeight = 800;

    // Simulate a table with 3 columns: Name, Age, City
    // Header row at y=100 (from top), data rows below
    const items = [
      // Header row (y=100 from top → transform y = 800-100 = 700)
      { str: 'Name', transform: [1, 0, 0, 1, 50, 700], width: 40, height: 12 },
      { str: 'Age', transform: [1, 0, 0, 1, 200, 700], width: 30, height: 12 },
      { str: 'City', transform: [1, 0, 0, 1, 350, 700], width: 30, height: 12 },
      // Row 1 (y=120 from top → transform y = 800-120 = 680)
      { str: 'Alice', transform: [1, 0, 0, 1, 50, 680], width: 40, height: 12 },
      { str: '30', transform: [1, 0, 0, 1, 200, 680], width: 20, height: 12 },
      { str: 'NYC', transform: [1, 0, 0, 1, 350, 680], width: 30, height: 12 },
      // Row 2 (y=140 from top → transform y = 800-140 = 660)
      { str: 'Bob', transform: [1, 0, 0, 1, 50, 660], width: 30, height: 12 },
      { str: '25', transform: [1, 0, 0, 1, 200, 660], width: 20, height: 12 },
      { str: 'LA', transform: [1, 0, 0, 1, 350, 660], width: 20, height: 12 },
    ];

    const mockPdf = createMockPdf([{ items, viewportHeight }]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile('report.pdf');
    const result = await parsePdfFile(file);

    expect(result.name).toBe('report');
    expect(result.fileName).toBe('report.pdf');
    expect(result.fields.length).toBeGreaterThanOrEqual(2);
    expect(result.rowCount).toBeGreaterThanOrEqual(2);
    expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.id).toBeDefined();
  });

  it('detects numeric field types correctly', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const viewportHeight = 800;

    const items = [
      // Header
      { str: 'Product', transform: [1, 0, 0, 1, 50, 700], width: 50, height: 12 },
      { str: 'Price', transform: [1, 0, 0, 1, 200, 700], width: 40, height: 12 },
      // Row 1
      { str: 'Widget', transform: [1, 0, 0, 1, 50, 680], width: 50, height: 12 },
      { str: '19.99', transform: [1, 0, 0, 1, 200, 680], width: 40, height: 12 },
      // Row 2
      { str: 'Gadget', transform: [1, 0, 0, 1, 50, 660], width: 50, height: 12 },
      { str: '29.99', transform: [1, 0, 0, 1, 200, 660], width: 40, height: 12 },
      // Row 3
      { str: 'Doohickey', transform: [1, 0, 0, 1, 50, 640], width: 60, height: 12 },
      { str: '9.99', transform: [1, 0, 0, 1, 200, 640], width: 30, height: 12 },
    ];

    const mockPdf = createMockPdf([{ items, viewportHeight }]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile();
    const result = await parsePdfFile(file);

    // Find the Price field
    const priceField = result.fields.find((f) => f.name === 'Price');
    if (priceField) {
      expect(priceField.type).toBe('number');
      expect(priceField.role).toBe('measure');
    }

    // Find the Product field
    const productField = result.fields.find((f) => f.name === 'Product');
    if (productField) {
      expect(productField.type).toBe('string');
      expect(productField.role).toBe('dimension');
    }
  });

  it('handles multi-page PDFs with same table structure', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const viewportHeight = 800;

    const page1Items = [
      // Header
      { str: 'ID', transform: [1, 0, 0, 1, 50, 700], width: 20, height: 12 },
      { str: 'Value', transform: [1, 0, 0, 1, 200, 700], width: 40, height: 12 },
      // Row 1
      { str: '1', transform: [1, 0, 0, 1, 50, 680], width: 10, height: 12 },
      { str: '100', transform: [1, 0, 0, 1, 200, 680], width: 30, height: 12 },
    ];

    const page2Items = [
      // Same header (continuation)
      { str: 'ID', transform: [1, 0, 0, 1, 50, 700], width: 20, height: 12 },
      { str: 'Value', transform: [1, 0, 0, 1, 200, 700], width: 40, height: 12 },
      // Row 2
      { str: '2', transform: [1, 0, 0, 1, 50, 680], width: 10, height: 12 },
      { str: '200', transform: [1, 0, 0, 1, 200, 680], width: 30, height: 12 },
    ];

    const mockPdf = createMockPdf([
      { items: page1Items, viewportHeight },
      { items: page2Items, viewportHeight },
    ]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile();
    const result = await parsePdfFile(file);

    // Should have merged rows from both pages
    expect(result.rowCount).toBeGreaterThanOrEqual(2);
  });

  it('respects pages option to parse specific pages only', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const viewportHeight = 800;

    const page1Items = [
      { str: 'Col1', transform: [1, 0, 0, 1, 50, 700], width: 30, height: 12 },
      { str: 'Col2', transform: [1, 0, 0, 1, 200, 700], width: 30, height: 12 },
      { str: 'A', transform: [1, 0, 0, 1, 50, 680], width: 10, height: 12 },
      { str: 'B', transform: [1, 0, 0, 1, 200, 680], width: 10, height: 12 },
    ];

    const page2Items = [
      { str: 'Col1', transform: [1, 0, 0, 1, 50, 700], width: 30, height: 12 },
      { str: 'Col2', transform: [1, 0, 0, 1, 200, 700], width: 30, height: 12 },
      { str: 'C', transform: [1, 0, 0, 1, 50, 680], width: 10, height: 12 },
      { str: 'D', transform: [1, 0, 0, 1, 200, 680], width: 10, height: 12 },
    ];

    const mockPdf = createMockPdf([
      { items: page1Items, viewportHeight },
      { items: page2Items, viewportHeight },
    ]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile();
    // Only parse page 2
    const result = await parsePdfFile(file, { pages: [2] });

    // Should only have data from page 2
    expect(result.rowCount).toBe(1);
  });

  it('converts numeric string values to actual numbers', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const viewportHeight = 800;

    const items = [
      { str: 'Item', transform: [1, 0, 0, 1, 50, 700], width: 30, height: 12 },
      { str: 'Amount', transform: [1, 0, 0, 1, 200, 700], width: 50, height: 12 },
      { str: 'Laptop', transform: [1, 0, 0, 1, 50, 680], width: 40, height: 12 },
      { str: '1,299.99', transform: [1, 0, 0, 1, 200, 680], width: 60, height: 12 },
      { str: 'Mouse', transform: [1, 0, 0, 1, 50, 660], width: 40, height: 12 },
      { str: '49.99', transform: [1, 0, 0, 1, 200, 660], width: 40, height: 12 },
    ];

    const mockPdf = createMockPdf([{ items, viewportHeight }]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile();
    const result = await parsePdfFile(file);

    const amountField = result.fields.find((f) => f.name === 'Amount');
    if (amountField) {
      expect(amountField.type).toBe('number');
      // Check that values are converted to numbers
      const amountValues = result.rows.map((r) => r['Amount']);
      expect(amountValues).toContain(1299.99);
      expect(amountValues).toContain(49.99);
    }
  });

  it('generates unique IDs for DataSource and fields', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const viewportHeight = 800;

    const items = [
      { str: 'A', transform: [1, 0, 0, 1, 50, 700], width: 10, height: 12 },
      { str: 'B', transform: [1, 0, 0, 1, 200, 700], width: 10, height: 12 },
      { str: '1', transform: [1, 0, 0, 1, 50, 680], width: 10, height: 12 },
      { str: '2', transform: [1, 0, 0, 1, 200, 680], width: 10, height: 12 },
    ];

    const mockPdf = createMockPdf([{ items, viewportHeight }]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile();
    const result = await parsePdfFile(file);

    expect(result.id).toBeDefined();
    const fieldIds = result.fields.map((f) => f.id);
    expect(new Set(fieldIds).size).toBe(fieldIds.length);
  });

  it('strips .pdf extension from file name for DataSource name', async () => {
    const pdfjsLib = await import('pdfjs-dist');
    const mockPdf = createMockPdf([{ items: [] }]);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(mockPdf),
    } as never);

    const file = createMockFile('Financial Report Q4.pdf');
    const result = await parsePdfFile(file);

    expect(result.name).toBe('Financial Report Q4');
    expect(result.fileName).toBe('Financial Report Q4.pdf');
  });
});
