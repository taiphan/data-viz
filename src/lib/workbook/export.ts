import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// ============================================================
// TYPES
// ============================================================

export type ExportFormat = 'pdf' | 'png' | 'svg';

export type PdfPageSize = 'a4' | 'a3' | 'letter' | 'legal';
export type PdfOrientation = 'portrait' | 'landscape';

export interface PdfExportOptions {
  format: 'pdf';
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  resolution: number; // DPI scale factor (1 = 96dpi, 2 = 192dpi)
  margin: number; // margin in mm
  title?: string;
}

export interface PngExportOptions {
  format: 'png';
  resolution: number; // DPI scale factor
  backgroundColor?: string;
}

export interface SvgExportOptions {
  format: 'svg';
}

export type ExportOptions = PdfExportOptions | PngExportOptions | SvgExportOptions;

export interface ExportResult {
  success: boolean;
  data?: Blob | string;
  filename: string;
  error?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const PAGE_DIMENSIONS: Record<PdfPageSize, { width: number; height: number }> = {
  a4: { width: 210, height: 297 },
  a3: { width: 297, height: 420 },
  letter: { width: 215.9, height: 279.4 },
  legal: { width: 215.9, height: 355.6 },
};

const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  format: 'pdf',
  pageSize: 'a4',
  orientation: 'landscape',
  resolution: 2,
  margin: 10,
};

const DEFAULT_PNG_OPTIONS: PngExportOptions = {
  format: 'png',
  resolution: 2,
  backgroundColor: '#ffffff',
};

// ============================================================
// PDF EXPORT
// ============================================================

/**
 * Captures a DOM element as a PDF document.
 * Uses html2canvas for rasterization and jsPDF for PDF generation.
 */
export async function exportToPdf(
  element: HTMLElement,
  options: Partial<PdfExportOptions> = {}
): Promise<ExportResult> {
  const opts: PdfExportOptions = { ...DEFAULT_PDF_OPTIONS, ...options, format: 'pdf' };
  const filename = buildFilename(opts.title || 'dashboard', 'pdf');

  try {
    const canvas = await html2canvas(element, {
      scale: opts.resolution,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const pageDims = getPageDimensions(opts.pageSize, opts.orientation);
    const contentWidth = pageDims.width - opts.margin * 2;
    const contentHeight = pageDims.height - opts.margin * 2;

    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * contentWidth) / canvas.width;

    const pdf = new jsPDF({
      orientation: opts.orientation,
      unit: 'mm',
      format: opts.pageSize,
    });

    const imgData = canvas.toDataURL('image/png');

    if (imgHeight <= contentHeight) {
      pdf.addImage(imgData, 'PNG', opts.margin, opts.margin, imgWidth, imgHeight);
    } else {
      // Multi-page: split the canvas across pages
      let remainingHeight = imgHeight;
      let yOffset = 0;

      while (remainingHeight > 0) {
        if (yOffset > 0) {
          pdf.addPage();
        }

        const sliceHeight = Math.min(remainingHeight, contentHeight);
        pdf.addImage(
          imgData,
          'PNG',
          opts.margin,
          opts.margin - yOffset,
          imgWidth,
          imgHeight
        );

        // Clip to content area by adding a white rectangle over overflow
        if (remainingHeight > contentHeight) {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(
            0,
            opts.margin + contentHeight,
            pageDims.width,
            pageDims.height - opts.margin - contentHeight,
            'F'
          );
        }

        yOffset += contentHeight;
        remainingHeight -= sliceHeight;
      }
    }

    const blob = pdf.output('blob');
    return { success: true, data: blob, filename };
  } catch (error) {
    return {
      success: false,
      filename,
      error: error instanceof Error ? error.message : 'PDF export failed',
    };
  }
}

// ============================================================
// PNG EXPORT
// ============================================================

/**
 * Captures a DOM element as a PNG image.
 * Supports configurable resolution for high-DPI output.
 */
export async function exportToPng(
  element: HTMLElement,
  options: Partial<PngExportOptions> = {}
): Promise<ExportResult> {
  const opts: PngExportOptions = { ...DEFAULT_PNG_OPTIONS, ...options, format: 'png' };
  const filename = buildFilename('chart', 'png');

  try {
    const canvas = await html2canvas(element, {
      scale: opts.resolution,
      useCORS: true,
      logging: false,
      backgroundColor: opts.backgroundColor || '#ffffff',
    });

    const blob = await canvasToBlob(canvas);
    return { success: true, data: blob, filename };
  } catch (error) {
    return {
      success: false,
      filename,
      error: error instanceof Error ? error.message : 'PNG export failed',
    };
  }
}

// ============================================================
// SVG EXPORT
// ============================================================

/**
 * Serializes an SVG element from the DOM into a standalone SVG string.
 * Inlines computed styles to ensure the exported SVG renders correctly
 * outside the application context.
 */
export function exportToSvg(
  svgElement: SVGElement
): ExportResult {
  const filename = buildFilename('chart', 'svg');

  try {
    const clonedSvg = svgElement.cloneNode(true) as SVGElement;

    // Ensure the SVG has proper namespace
    if (!clonedSvg.getAttribute('xmlns')) {
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    if (!clonedSvg.getAttribute('xmlns:xlink')) {
      clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    }

    // Set viewBox if not present
    if (!clonedSvg.getAttribute('viewBox')) {
      const width = svgElement.getAttribute('width')
        || svgElement.getBoundingClientRect().width.toString();
      const height = svgElement.getAttribute('height')
        || svgElement.getBoundingClientRect().height.toString();
      clonedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    // Inline computed styles for portability
    inlineStyles(svgElement, clonedSvg);

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(clonedSvg);
    const svgWithDeclaration = `<?xml version="1.0" encoding="UTF-8"?>\n${svgString}`;

    const blob = new Blob([svgWithDeclaration], { type: 'image/svg+xml;charset=utf-8' });
    return { success: true, data: blob, filename };
  } catch (error) {
    return {
      success: false,
      filename,
      error: error instanceof Error ? error.message : 'SVG export failed',
    };
  }
}

// ============================================================
// UNIFIED EXPORT
// ============================================================

/**
 * Unified export function that dispatches to the appropriate format handler.
 */
export async function exportDashboard(
  element: HTMLElement,
  options: ExportOptions
): Promise<ExportResult> {
  switch (options.format) {
    case 'pdf':
      return exportToPdf(element, options);
    case 'png':
      return exportToPng(element, options);
    case 'svg': {
      const svgElement = element.querySelector('svg');
      if (!svgElement) {
        return {
          success: false,
          filename: buildFilename('chart', 'svg'),
          error: 'No SVG element found in the provided container',
        };
      }
      return exportToSvg(svgElement);
    }
    default:
      return {
        success: false,
        filename: 'export',
        error: `Unsupported export format`,
      };
  }
}

// ============================================================
// DOWNLOAD HELPER
// ============================================================

/**
 * Triggers a browser download for the exported file.
 */
export function downloadExport(result: ExportResult): void {
  if (!result.success || !result.data) {
    return;
  }

  const blob = result.data instanceof Blob
    ? result.data
    : new Blob([result.data], { type: 'image/svg+xml' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Returns page dimensions in mm, accounting for orientation.
 */
export function getPageDimensions(
  pageSize: PdfPageSize,
  orientation: PdfOrientation
): { width: number; height: number } {
  const dims = PAGE_DIMENSIONS[pageSize];
  if (orientation === 'landscape') {
    return { width: dims.height, height: dims.width };
  }
  return { ...dims };
}

/**
 * Builds a filename with timestamp.
 */
export function buildFilename(baseName: string, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sanitized = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${sanitized}_${timestamp}.${extension}`;
}

/**
 * Converts a canvas element to a Blob.
 */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/png');
  });
}

/**
 * Recursively inlines computed styles from the source element
 * onto the cloned element for SVG export portability.
 */
function inlineStyles(source: Element, target: Element): void {
  if (!(source instanceof SVGElement) || !(target instanceof SVGElement)) {
    return;
  }

  const computedStyle = window.getComputedStyle(source);
  const relevantProperties = [
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'opacity',
    'font-family',
    'font-size',
    'font-weight',
    'text-anchor',
    'dominant-baseline',
    'visibility',
    'display',
  ];

  for (const prop of relevantProperties) {
    const value = computedStyle.getPropertyValue(prop);
    if (value && value !== 'initial' && value !== '') {
      (target as SVGElement).style.setProperty(prop, value);
    }
  }

  const sourceChildren = source.children;
  const targetChildren = target.children;

  for (let i = 0; i < sourceChildren.length && i < targetChildren.length; i++) {
    inlineStyles(sourceChildren[i], targetChildren[i]);
  }
}
