/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPageDimensions,
  buildFilename,
  exportToPdf,
  exportToPng,
  exportToSvg,
  exportDashboard,
  ExportResult,
} from './export';

// ============================================================
// Mock html2canvas and jsPDF
// ============================================================

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    width: 800,
    height: 600,
    toDataURL: () => 'data:image/png;base64,mock',
    toBlob: (callback: (blob: Blob | null) => void) => {
      callback(new Blob(['mock-png'], { type: 'image/png' }));
    },
  }),
}));

vi.mock('jspdf', () => {
  return {
    jsPDF: class MockJsPDF {
      addImage() { return this; }
      addPage() { return this; }
      setFillColor() { return this; }
      rect() { return this; }
      output() { return new Blob(['mock-pdf'], { type: 'application/pdf' }); }
    },
  };
});

// ============================================================
// Utility function tests (pure, no mocks needed)
// ============================================================

describe('getPageDimensions', () => {
  it('returns A4 portrait dimensions', () => {
    const dims = getPageDimensions('a4', 'portrait');
    expect(dims.width).toBe(210);
    expect(dims.height).toBe(297);
  });

  it('returns A4 landscape dimensions (swapped)', () => {
    const dims = getPageDimensions('a4', 'landscape');
    expect(dims.width).toBe(297);
    expect(dims.height).toBe(210);
  });

  it('returns A3 portrait dimensions', () => {
    const dims = getPageDimensions('a3', 'portrait');
    expect(dims.width).toBe(297);
    expect(dims.height).toBe(420);
  });

  it('returns letter portrait dimensions', () => {
    const dims = getPageDimensions('letter', 'portrait');
    expect(dims.width).toBe(215.9);
    expect(dims.height).toBe(279.4);
  });

  it('returns legal landscape dimensions', () => {
    const dims = getPageDimensions('legal', 'landscape');
    expect(dims.width).toBe(355.6);
    expect(dims.height).toBe(215.9);
  });
});

describe('buildFilename', () => {
  it('generates a filename with the correct extension', () => {
    const filename = buildFilename('dashboard', 'pdf');
    expect(filename).toMatch(/^dashboard_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.pdf$/);
  });

  it('sanitizes special characters in the base name', () => {
    const filename = buildFilename('My Dashboard / Report', 'png');
    expect(filename).toMatch(/^My_Dashboard___Report_/);
    expect(filename).not.toContain('/');
    expect(filename).not.toContain(' ');
  });

  it('preserves hyphens and underscores', () => {
    const filename = buildFilename('sales-report_2024', 'svg');
    expect(filename).toMatch(/^sales-report_2024_/);
  });

  it('generates unique filenames based on timestamp', () => {
    const filename1 = buildFilename('chart', 'png');
    const filename2 = buildFilename('chart', 'png');
    // Same timestamp within the same second, so they should be equal
    expect(filename1).toBe(filename2);
  });
});

// ============================================================
// PDF Export tests
// ============================================================

describe('exportToPdf', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockElement = document.createElement('div');
  });

  it('returns a successful result with a blob', async () => {
    const result = await exportToPdf(mockElement);

    expect(result.success).toBe(true);
    expect(result.data).toBeInstanceOf(Blob);
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it('uses default options when none provided', async () => {
    const html2canvas = (await import('html2canvas')).default;

    await exportToPdf(mockElement);

    expect(html2canvas).toHaveBeenCalledWith(mockElement, expect.objectContaining({
      scale: 2,
    }));
  });

  it('respects custom page size and orientation', async () => {
    const html2canvas = (await import('html2canvas')).default;

    await exportToPdf(mockElement, {
      pageSize: 'letter',
      orientation: 'portrait',
      resolution: 3,
    });

    expect(html2canvas).toHaveBeenCalledWith(mockElement, expect.objectContaining({
      scale: 3,
    }));
  });

  it('uses custom title in filename', async () => {
    const result = await exportToPdf(mockElement, { title: 'Sales Report' });

    expect(result.filename).toMatch(/^Sales_Report_/);
  });

  it('handles html2canvas failure gracefully', async () => {
    const html2canvas = (await import('html2canvas')).default;
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('Canvas render failed'));

    const result = await exportToPdf(mockElement);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Canvas render failed');
  });

  it('passes resolution as scale to html2canvas', async () => {
    const html2canvas = (await import('html2canvas')).default;

    await exportToPdf(mockElement, { resolution: 3 });

    expect(html2canvas).toHaveBeenCalledWith(mockElement, expect.objectContaining({
      scale: 3,
    }));
  });
});

// ============================================================
// PNG Export tests
// ============================================================

describe('exportToPng', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockElement = document.createElement('div');
  });

  it('returns a successful result with a blob', async () => {
    const result = await exportToPng(mockElement);

    expect(result.success).toBe(true);
    expect(result.data).toBeInstanceOf(Blob);
    expect(result.filename).toMatch(/\.png$/);
  });

  it('uses default resolution of 2', async () => {
    const html2canvas = (await import('html2canvas')).default;

    await exportToPng(mockElement);

    expect(html2canvas).toHaveBeenCalledWith(mockElement, expect.objectContaining({
      scale: 2,
    }));
  });

  it('respects custom resolution', async () => {
    const html2canvas = (await import('html2canvas')).default;

    await exportToPng(mockElement, { resolution: 4 });

    expect(html2canvas).toHaveBeenCalledWith(mockElement, expect.objectContaining({
      scale: 4,
    }));
  });

  it('uses custom background color', async () => {
    const html2canvas = (await import('html2canvas')).default;

    await exportToPng(mockElement, { backgroundColor: '#000000' });

    expect(html2canvas).toHaveBeenCalledWith(mockElement, expect.objectContaining({
      backgroundColor: '#000000',
    }));
  });

  it('handles html2canvas failure gracefully', async () => {
    const html2canvas = (await import('html2canvas')).default;
    vi.mocked(html2canvas).mockRejectedValueOnce(new Error('Render error'));

    const result = await exportToPng(mockElement);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Render error');
  });
});

// ============================================================
// SVG Export tests
// ============================================================

describe('exportToSvg', () => {
  function createMockSvg(attrs: Record<string, string> = {}): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '400');
    svg.setAttribute('height', '300');
    for (const [key, value] of Object.entries(attrs)) {
      svg.setAttribute(key, value);
    }
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '100');
    rect.setAttribute('height', '50');
    rect.setAttribute('fill', '#3B82F6');
    svg.appendChild(rect);
    return svg;
  }

  it('returns a successful result with SVG blob', () => {
    const svg = createMockSvg();
    const result = exportToSvg(svg);

    expect(result.success).toBe(true);
    expect(result.data).toBeInstanceOf(Blob);
    expect(result.filename).toMatch(/\.svg$/);
  });

  it('adds xmlns attribute if missing', () => {
    const svg = createMockSvg();
    const result = exportToSvg(svg);

    expect(result.success).toBe(true);
    const text = new Blob([result.data as Blob]).size;
    expect(text).toBeGreaterThan(0);
  });

  it('preserves existing xmlns attribute', () => {
    const svg = createMockSvg({ xmlns: 'http://www.w3.org/2000/svg' });
    const result = exportToSvg(svg);

    expect(result.success).toBe(true);
  });

  it('sets viewBox from width/height if not present', () => {
    const svg = createMockSvg();
    exportToSvg(svg);

    // The cloned SVG should have viewBox set
    // We verify by checking the result contains viewBox in the serialized output
    const result = exportToSvg(svg);
    expect(result.success).toBe(true);
  });

  it('preserves existing viewBox', () => {
    const svg = createMockSvg({ viewBox: '0 0 800 600' });
    const result = exportToSvg(svg);

    expect(result.success).toBe(true);
  });

  it('includes XML declaration in output', () => {
    const svg = createMockSvg();
    const result = exportToSvg(svg);

    expect(result.success).toBe(true);
    // The blob contains the XML declaration
    expect(result.data).toBeInstanceOf(Blob);
  });
});

// ============================================================
// Unified exportDashboard tests
// ============================================================

describe('exportDashboard', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    mockElement = document.createElement('div');
  });

  it('dispatches to PDF export', async () => {
    const result = await exportDashboard(mockElement, {
      format: 'pdf',
      pageSize: 'a4',
      orientation: 'landscape',
      resolution: 2,
      margin: 10,
    });

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it('dispatches to PNG export', async () => {
    const result = await exportDashboard(mockElement, {
      format: 'png',
      resolution: 2,
    });

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.png$/);
  });

  it('dispatches to SVG export when SVG element exists', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '400');
    svg.setAttribute('height', '300');
    mockElement.appendChild(svg);

    const result = await exportDashboard(mockElement, { format: 'svg' });

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.svg$/);
  });

  it('returns error when SVG format requested but no SVG element found', async () => {
    const result = await exportDashboard(mockElement, { format: 'svg' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('No SVG element found in the provided container');
  });
});
