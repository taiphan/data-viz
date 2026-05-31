'use client';

import { useState, useCallback, useMemo } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { parseCSVToDataSource, parseJSONToDataSource } from '@/lib/data-engine';
import { parseFile, getExcelSheets, FileConnectorOptions } from '@/lib/connectors/file-connectors';
import { DataSource } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConnectorFlowDialog } from '@/components/data-viz/connectors/connector-flow-dialog';
import {
  Upload,
  FileText,
  Database,
  AlertCircle,
  X,
  Eye,
  Loader2,
  CheckCircle2,
  PlugZap,
} from 'lucide-react';
import { ThemeSwitcher } from '@/components/theme-switcher';

// ============================================================
// SUPPORTED FILE EXTENSIONS
// ============================================================

const SUPPORTED_EXTENSIONS = [
  'csv', 'tsv', 'txt', 'xlsx', 'xls', 'pdf',
  'parquet', 'sav', 'dta', 'sas7bdat', 'json',
];

const ACCEPT_STRING = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',');

type FileCategory =
  | 'delimited'
  | 'excel'
  | 'pdf'
  | 'parquet'
  | 'statistical'
  | 'json';

const EXTENSION_TO_CATEGORY: Record<string, FileCategory> = {
  csv: 'delimited',
  tsv: 'delimited',
  txt: 'delimited',
  xlsx: 'excel',
  xls: 'excel',
  pdf: 'pdf',
  parquet: 'parquet',
  sav: 'statistical',
  dta: 'statistical',
  sas7bdat: 'statistical',
  json: 'json',
};

function getFileExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function getFileCategory(fileName: string): FileCategory | null {
  const ext = getFileExtension(fileName);
  return EXTENSION_TO_CATEGORY[ext] || null;
}

// ============================================================
// FILE OPTIONS PANEL
// ============================================================

interface FileOptionsProps {
  file: File;
  category: FileCategory;
  options: FileConnectorOptions;
  onOptionsChange: (options: FileConnectorOptions) => void;
  sheets: string[];
}

function FileOptionsPanel({
  file,
  category,
  options,
  onOptionsChange,
  sheets,
}: FileOptionsProps) {
  if (category === 'json') {
    return (
      <p className="text-xs text-muted-foreground">
        JSON files are parsed automatically. No additional options needed.
      </p>
    );
  }

  if (category === 'delimited') {
    const ext = getFileExtension(file.name);
    const defaultDelimiter = ext === 'tsv' ? '\t' : ',';
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="delimiter" className="text-xs">Delimiter</Label>
          <Select
            value={options.delimiter || defaultDelimiter}
            onValueChange={(v) => onOptionsChange({ ...options, delimiter: v ?? undefined })}
          >
            <SelectTrigger className="w-full" id="delimiter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=",">Comma (,)</SelectItem>
              <SelectItem value="&#9;">Tab (⇥)</SelectItem>
              <SelectItem value=";">Semicolon (;)</SelectItem>
              <SelectItem value="|">Pipe (|)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="quote-char" className="text-xs">Quote Character</Label>
          <Select
            value={options.quoteChar || '"'}
            onValueChange={(v) => onOptionsChange({ ...options, quoteChar: v ?? undefined })}
          >
            <SelectTrigger className="w-full" id="quote-char">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={'"'}>Double Quote (&quot;)</SelectItem>
              <SelectItem value="'">Single Quote (&apos;)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="encoding" className="text-xs">Encoding</Label>
          <Select
            value={options.encoding || 'UTF-8'}
            onValueChange={(v) => onOptionsChange({ ...options, encoding: v ?? undefined })}
          >
            <SelectTrigger className="w-full" id="encoding">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTF-8">UTF-8</SelectItem>
              <SelectItem value="ISO-8859-1">ISO-8859-1</SelectItem>
              <SelectItem value="Windows-1252">Windows-1252</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  if (category === 'excel') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="sheet-name" className="text-xs">Sheet</Label>
          {sheets.length > 0 ? (
            <Select
              value={options.sheetName || sheets[0]}
              onValueChange={(v) => onOptionsChange({ ...options, sheetName: v ?? undefined })}
            >
              <SelectTrigger className="w-full" id="sheet-name">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sheets.map((sheet) => (
                  <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-xs text-muted-foreground">Loading sheets...</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="header-row" className="text-xs">Header Row</Label>
          <Input
            id="header-row"
            type="number"
            min={0}
            value={options.headerRow ?? 0}
            onChange={(e) =>
              onOptionsChange({ ...options, headerRow: parseInt(e.target.value, 10) || 0 })
            }
            className="text-xs"
          />
        </div>
      </div>
    );
  }

  if (category === 'pdf') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="pdf-pages" className="text-xs">Pages (comma-separated, blank = all)</Label>
          <Input
            id="pdf-pages"
            type="text"
            placeholder="e.g. 1,2,3"
            value={options.pages?.join(',') || ''}
            onChange={(e) => {
              const val = e.target.value.trim();
              const pages = val
                ? val.split(',').map((p) => parseInt(p.trim(), 10)).filter((n) => !isNaN(n))
                : undefined;
              onOptionsChange({ ...options, pages });
            }}
            className="text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="header-row-pdf" className="text-xs">Header Row</Label>
          <Input
            id="header-row-pdf"
            type="number"
            min={0}
            value={options.headerRow ?? 0}
            onChange={(e) =>
              onOptionsChange({ ...options, headerRow: parseInt(e.target.value, 10) || 0 })
            }
            className="text-xs"
          />
        </div>
      </div>
    );
  }

  if (category === 'parquet') {
    return (
      <div className="space-y-1">
        <Label htmlFor="max-rows" className="text-xs">Max Rows (blank = all)</Label>
        <Input
          id="max-rows"
          type="number"
          min={1}
          placeholder="1000000"
          value={options.maxRows || ''}
          onChange={(e) => {
            const val = e.target.value.trim();
            onOptionsChange({ ...options, maxRows: val ? parseInt(val, 10) : undefined });
          }}
          className="text-xs w-40"
        />
      </div>
    );
  }

  if (category === 'statistical') {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="encoding-stat" className="text-xs">Encoding</Label>
          <Select
            value={options.encoding || 'UTF-8'}
            onValueChange={(v) => onOptionsChange({ ...options, encoding: v ?? undefined })}
          >
            <SelectTrigger className="w-full" id="encoding-stat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UTF-8">UTF-8</SelectItem>
              <SelectItem value="ISO-8859-1">ISO-8859-1</SelectItem>
              <SelectItem value="Windows-1252">Windows-1252</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="max-rows-stat" className="text-xs">Max Rows (blank = all)</Label>
          <Input
            id="max-rows-stat"
            type="number"
            min={1}
            placeholder="1000000"
            value={options.maxRows || ''}
            onChange={(e) => {
              const val = e.target.value.trim();
              onOptionsChange({ ...options, maxRows: val ? parseInt(val, 10) : undefined });
            }}
            className="text-xs"
          />
        </div>
      </div>
    );
  }

  return null;
}

// ============================================================
// DATA PREVIEW TABLE
// ============================================================

interface DataPreviewProps {
  dataSource: DataSource;
}

function DataPreview({ dataSource }: DataPreviewProps) {
  const previewRows = dataSource.rows.slice(0, 10);
  const fields = dataSource.fields;

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No data to preview.</p>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <div className="max-h-48 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {fields.map((field) => (
                <TableHead key={field.id} className="text-[10px] h-7 px-2">
                  <span className="font-semibold">{field.name}</span>
                  <Badge variant="secondary" className="ml-1 text-[8px] px-1 py-0">
                    {field.type}
                  </Badge>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {fields.map((field) => (
                  <TableCell key={field.id} className="text-[10px] py-1 px-2">
                    {row[field.name] != null ? String(row[field.name]) : '—'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-2 py-1 bg-muted/30 text-[10px] text-muted-foreground">
        Showing {previewRows.length} of {dataSource.rowCount.toLocaleString()} rows
        • {fields.length} fields
      </div>
    </div>
  );
}

// ============================================================
// IMPORT STEP STATES
// ============================================================

type ImportStep = 'idle' | 'options' | 'preview' | 'importing';

// ============================================================
// MAIN COMPONENT
// ============================================================

export function DataImport() {
  const { addDataSource, workbook } = useWorkbookStore();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [connectorDialogOpen, setConnectorDialogOpen] = useState(false);

  // Extended state for file options flow
  const [step, setStep] = useState<ImportStep>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileCategory, setFileCategory] = useState<FileCategory | null>(null);
  const [fileOptions, setFileOptions] = useState<FileConnectorOptions>({});
  const [excelSheets, setExcelSheets] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<DataSource | null>(null);

  const resetImportState = useCallback(() => {
    setStep('idle');
    setSelectedFile(null);
    setFileCategory(null);
    setFileOptions({});
    setExcelSheets([]);
    setPreviewData(null);
    setError(null);
  }, []);

  // Handle file selection — detect type and show options
  const handleFileSelected = useCallback(async (file: File) => {
    const ext = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setError(
        `Unsupported file type: ".${ext}". Supported: ${SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(', ')}`,
      );
      return;
    }

    setError(null);
    const category = getFileCategory(file.name);
    setSelectedFile(file);
    setFileCategory(category);
    setFileOptions({});
    setPreviewData(null);

    // For Excel files, load sheet names
    if (category === 'excel') {
      try {
        const sheets = await getExcelSheets(file);
        setExcelSheets(sheets);
        if (sheets.length > 0) {
          setFileOptions((prev) => ({ ...prev, sheetName: sheets[0] }));
        }
      } catch {
        setExcelSheets([]);
      }
    }

    setStep('options');
  }, []);

  // Parse file with current options and show preview
  const handlePreview = useCallback(async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setError(null);

    try {
      const dataSource = await parseFile(selectedFile, fileOptions);
      setPreviewData(dataSource);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, fileOptions]);

  // Import the previewed data into the workbook
  const handleImport = useCallback(async () => {
    if (!previewData) return;

    setStep('importing');

    try {
      addDataSource(previewData);

      // Auto-assign first dimension to X and first measure to Y
      const store = useWorkbookStore.getState();
      const activeChart = store.getActiveChart();
      if (activeChart) {
        const firstDimension = previewData.fields.find((f) => f.role === 'dimension');
        const firstMeasure = previewData.fields.find((f) => f.role === 'measure');
        if (firstDimension) {
          store.setEncoding(activeChart.id, 'xAxis', {
            field: firstDimension.name,
            aggregation: 'NONE',
          });
        }
        if (firstMeasure) {
          store.setEncoding(activeChart.id, 'yAxis', {
            field: firstMeasure.name,
            aggregation: 'SUM',
          });
        }
      }

      resetImportState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import data');
      setStep('preview');
    }
  }, [previewData, addDataSource, resetImportState]);

  // Quick import for simple files (backward compat with drag-and-drop)
  const handleQuickImport = useCallback(async (file: File) => {
    const ext = getFileExtension(file.name);

    // For CSV/JSON, maintain backward-compatible quick import
    if (ext === 'csv' || ext === 'json') {
      setIsProcessing(true);
      setError(null);
      try {
        const dataSource = ext === 'json'
          ? await parseJSONToDataSource(file)
          : await parseCSVToDataSource(file);
        addDataSource(dataSource);

        const store = useWorkbookStore.getState();
        const activeChart = store.getActiveChart();
        if (activeChart) {
          const firstDimension = dataSource.fields.find((f) => f.role === 'dimension');
          const firstMeasure = dataSource.fields.find((f) => f.role === 'measure');
          if (firstDimension) {
            store.setEncoding(activeChart.id, 'xAxis', {
              field: firstDimension.name,
              aggregation: 'NONE',
            });
          }
          if (firstMeasure) {
            store.setEncoding(activeChart.id, 'yAxis', {
              field: firstMeasure.name,
              aggregation: 'SUM',
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to parse file');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // For all other file types, go through the options flow
    handleFileSelected(file);
  }, [addDataSource, handleFileSelected]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleQuickImport(file);
  }, [handleQuickImport]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [handleFileSelected]);

  const handleFileInputCompact = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = '';
  }, [handleFileSelected]);

  const hasData = workbook.dataSources.length > 0;

  const categoryLabel = useMemo(() => {
    if (!fileCategory) return '';
    const labels: Record<FileCategory, string> = {
      delimited: 'Delimited Text',
      excel: 'Excel',
      pdf: 'PDF',
      parquet: 'Parquet',
      statistical: 'Statistical',
      json: 'JSON',
    };
    return labels[fileCategory];
  }, [fileCategory]);

  // ============================================================
  // OPTIONS / PREVIEW PANEL (shown as overlay when file selected)
  // ============================================================

  if (step !== 'idle') {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Import File</h2>
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  {selectedFile.name}
                  <Badge variant="secondary" className="ml-2 text-[9px]">
                    {categoryLabel}
                  </Badge>
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetImportState}
              className="cursor-pointer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Options Section */}
          {step === 'options' && selectedFile && fileCategory && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-medium">Parsing Options</h3>
                <FileOptionsPanel
                  file={selectedFile}
                  category={fileCategory}
                  options={fileOptions}
                  onOptionsChange={setFileOptions}
                  sheets={excelSheets}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetImportState}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handlePreview}
                  disabled={isProcessing}
                  className="cursor-pointer gap-1.5"
                >
                  {isProcessing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  Preview Data
                </Button>
              </div>
            </div>
          )}

          {/* Preview Section */}
          {step === 'preview' && previewData && (
            <div className="space-y-4">
              <DataPreview dataSource={previewData} />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('options')}
                  className="cursor-pointer"
                >
                  Back to Options
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  className="cursor-pointer gap-1.5"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Import {previewData.rowCount.toLocaleString()} Rows
                </Button>
              </div>
            </div>
          )}

          {/* Importing state */}
          {step === 'importing' && (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Importing data...</span>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto cursor-pointer">
                <X className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Compact bar when data is loaded
  if (hasData) {
    return (
      <div className="flex items-center gap-2 border-b px-4 py-2 bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline">Sources</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {workbook.dataSources.map((ds) => (
            <Badge
              key={ds.id}
              variant={ds.id === workbook.activeDataSourceId ? 'default' : 'secondary'}
              className="text-[11px] cursor-pointer shrink-0 h-6 px-2.5 rounded-full transition-all hover:scale-105"
              onClick={() => useWorkbookStore.getState().setActiveDataSource(ds.id)}
            >
              {ds.name}
              <span className="ml-1 opacity-70">({ds.rowCount.toLocaleString()})</span>
            </Badge>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer text-xs h-7 px-3 gap-1.5 rounded-full"
            onClick={() => setConnectorDialogOpen(true)}
            aria-label="Connect to data source"
          >
            <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Connect</span>
          </Button>
          <div className="relative">
            <Button variant="outline" size="sm" className="cursor-pointer text-xs h-7 px-3 gap-1.5 rounded-full">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Add Source</span>
            </Button>
            <input
              type="file"
              accept={ACCEPT_STRING}
              onChange={handleFileInputCompact}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Add data source"
            />
          </div>
        </div>
        <ConnectorFlowDialog
          open={connectorDialogOpen}
          onOpenChange={setConnectorDialogOpen}
        />
      </div>
    );
  }

  // Full landing page — Pro UI
  return (
    <div className="relative flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-8">
        {/* Hero section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Ready to visualize
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text">
            Data Viz
          </h1>
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            Self-service analytics platform. Upload data, build interactive charts, create stunning dashboards.
          </p>
        </div>

        {/* Drop zone */}
        <div
          className={`
            relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12
            transition-all duration-300 ease-out
            ${isDragging
              ? 'border-primary bg-primary/5 scale-[1.02] shadow-lg shadow-primary/10'
              : 'border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30'
            }
          `}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className={`mb-5 rounded-2xl p-4 transition-colors duration-300 ${
            isDragging ? 'bg-primary/10' : 'bg-muted/50'
          }`}>
            <Upload className={`h-10 w-10 transition-colors duration-300 ${
              isDragging ? 'text-primary' : 'text-muted-foreground/50'
            }`} aria-hidden="true" />
          </div>
          <p className="mb-1.5 text-base font-semibold">
            {isProcessing ? 'Processing your file...' : 'Drop your data file here'}
          </p>
          <p className="text-sm text-muted-foreground">
            or <span className="text-primary font-medium cursor-pointer hover:underline">browse</span> to choose a file
          </p>
          <p className="text-xs text-muted-foreground/70 mt-3">
            Supports CSV, JSON, Excel, PDF, Parquet, TSV, and statistical formats
          </p>
          <input
            type="file"
            accept={ACCEPT_STRING}
            onChange={handleFileInput}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Upload data file"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
            <span className="text-sm text-destructive">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto cursor-pointer rounded p-0.5 hover:bg-destructive/10">
              <X className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: '📁', label: 'Drag & Drop', desc: 'All major file formats' },
            { icon: '🔍', label: 'Auto-Detect', desc: 'Types, roles & patterns' },
            { icon: '🔗', label: 'Multi-Source', desc: 'Join & blend datasets' },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border bg-card/50 p-4 text-center hover:bg-card hover:shadow-sm transition-all duration-200">
              <span className="text-2xl mb-2 block">{item.icon}</span>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            className="gap-2 cursor-pointer h-10 px-5"
            onClick={() => setConnectorDialogOpen(true)}
            aria-label="Connect to data source"
          >
            <PlugZap className="h-4 w-4" aria-hidden="true" />
            Connect to Database
          </Button>
          <span className="text-xs text-muted-foreground">or</span>
          <Button
            variant="ghost"
            className="gap-2 cursor-pointer h-10 px-5 text-muted-foreground"
            onClick={() => {
              // Load sample data
              const link = document.createElement('a');
              link.href = '/sample-sales-dashboard.csv';
              link.download = 'sample-sales-dashboard.csv';
              link.click();
            }}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Try Sample Data
          </Button>
        </div>

        <ConnectorFlowDialog
          open={connectorDialogOpen}
          onOpenChange={setConnectorDialogOpen}
        />
      </div>
    </div>
  );
}
