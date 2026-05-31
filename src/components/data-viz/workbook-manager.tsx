'use client';

import { useState, useCallback } from 'react';
import { useWorkbookStore } from '@/lib/store';
import {
  WorkbookVersion,
} from '@/lib/workbook/versioning';
import {
  PublishedWorkbook,
  publishWorkbook,
  generateEmbedUrl,
  generateEmbedSnippet,
  isPublishValid,
  revokePublishedWorkbook,
} from '@/lib/workbook/publishing';
import {
  ExportFormat,
  PdfPageSize,
  PdfOrientation,
  exportDashboard,
  downloadExport,
} from '@/lib/workbook/export';
import {
  WorkbookTemplate,
  getAvailableTemplates,
  loadTemplate,
  saveAsTemplate,
  TemplateCategory,
} from '@/lib/workbook/templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  History,
  Globe,
  Download,
  LayoutTemplate,
  RotateCcw,
  Copy,
  Trash2,
  FileText,
  Image as ImageIcon,
  Code,
  Plus,
  ExternalLink,
  Check,
} from 'lucide-react';

// ============================================================
// CONSTANTS
// ============================================================

const BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'https://app.example.com';

// ============================================================
// VERSION HISTORY PANEL
// ============================================================

interface VersionHistoryPanelProps {
  versions: WorkbookVersion[];
  onRollback: (versionId: string) => void;
  onSaveVersion: (description: string) => void;
  onDeleteVersion: (versionId: string) => void;
}

function VersionHistoryPanel({
  versions,
  onRollback,
  onSaveVersion,
  onDeleteVersion,
}: VersionHistoryPanelProps) {
  const [description, setDescription] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    if (!description.trim()) return;
    onSaveVersion(description.trim());
    setDescription('');
  }, [description, onSaveVersion]);

  const previewVersion = versions.find((v) => v.id === previewId);

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Version history">
      {/* Save new version */}
      <div className="p-3 border-b space-y-2">
        <Label htmlFor="version-description" className="text-xs font-medium">
          Save current state
        </Label>
        <div className="flex gap-2">
          <Input
            id="version-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Version description..."
            className="h-7 text-xs flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <Button
            size="sm"
            className="h-7 text-xs cursor-pointer"
            onClick={handleSave}
            disabled={!description.trim()}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Version list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1.5">
          {versions.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No versions saved yet
            </p>
          )}
          {versions.map((version) => (
            <div
              key={version.id}
              className={`rounded-md border p-2 space-y-1 transition-colors ${
                previewId === version.id ? 'border-primary bg-primary/5' : 'bg-background'
              }`}
              role="article"
              aria-label={`Version ${version.versionNumber}: ${version.description}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">
                  v{version.versionNumber}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatTimestamp(version.timestamp)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {version.description}
              </p>

              {/* Preview snapshot info */}
              {previewId === version.id && previewVersion && (
                <div className="mt-1.5 p-1.5 rounded bg-muted/50 text-[10px] space-y-0.5">
                  <p><strong>Sheets:</strong> {previewVersion.snapshot.sheets.length}</p>
                  <p><strong>Data sources:</strong> {previewVersion.snapshot.dataSources.length}</p>
                  <p><strong>Parameters:</strong> {previewVersion.snapshot.parameters.length}</p>
                </div>
              )}

              <div className="flex items-center gap-1 pt-0.5">
                <button
                  onClick={() => setPreviewId(previewId === version.id ? null : version.id)}
                  className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground underline"
                  aria-label={`Preview version ${version.versionNumber}`}
                >
                  {previewId === version.id ? 'Hide' : 'Preview'}
                </button>
                <button
                  onClick={() => onRollback(version.id)}
                  className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
                  title={`Rollback to version ${version.versionNumber}`}
                  aria-label={`Rollback to version ${version.versionNumber}`}
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  onClick={() => onDeleteVersion(version.id)}
                  className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-destructive"
                  title="Delete version"
                  aria-label={`Delete version ${version.versionNumber}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}


// ============================================================
// PUBLISH DIALOG
// ============================================================

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PublishDialog({ open, onOpenChange }: PublishDialogProps) {
  const { workbook } = useWorkbookStore();
  const [publishedLinks, setPublishedLinks] = useState<PublishedWorkbook[]>([]);
  const [title, setTitle] = useState(workbook.name);
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handlePublish = useCallback(() => {
    const published = publishWorkbook(workbook, {
      title: title.trim() || workbook.name,
      expiresInDays: expiresInDays ? Number(expiresInDays) : null,
      embedMode: 'full',
    });
    setPublishedLinks((prev) => [...prev, published]);
    setTitle(workbook.name);
    setExpiresInDays('');
  }, [workbook, title, expiresInDays]);

  const handleRevoke = useCallback((publishId: string) => {
    setPublishedLinks((prev) => revokePublishedWorkbook(prev, publishId));
  }, []);

  const handleCopyUrl = useCallback((token: string, publishId: string) => {
    const url = generateEmbedUrl(BASE_URL, token);
    navigator.clipboard.writeText(url);
    setCopiedId(publishId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleCopyEmbed = useCallback((token: string) => {
    const snippet = generateEmbedSnippet({
      token,
      baseUrl: BASE_URL,
      width: '100%',
      height: '600px',
    });
    navigator.clipboard.writeText(snippet);
  }, []);

  const activeLinks = publishedLinks.filter(isPublishValid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-labelledby="publish-dialog-title">
        <DialogHeader>
          <DialogTitle id="publish-dialog-title">Publish Workbook</DialogTitle>
          <DialogDescription>
            Generate a shareable URL or embed code for your workbook.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Publish form */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="publish-title" className="text-xs">
                Title
              </Label>
              <Input
                id="publish-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Published title"
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="publish-expires" className="text-xs">
                Expires in (days, leave empty for no expiry)
              </Label>
              <Input
                id="publish-expires"
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                placeholder="No expiry"
                className="h-7 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-7 text-xs w-full cursor-pointer"
              onClick={handlePublish}
            >
              <Globe className="h-3 w-3 mr-1" aria-hidden="true" />
              Generate Link
            </Button>
          </div>

          {/* Published links */}
          {activeLinks.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Published Links</Label>
              <ScrollArea className="max-h-48">
                <div className="space-y-1.5">
                  {activeLinks.map((link) => (
                    <div
                      key={link.id}
                      className="rounded border p-2 space-y-1 bg-background"
                      role="article"
                      aria-label={`Published link: ${link.title}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate flex-1">
                          {link.title}
                        </span>
                        <Badge variant="outline" className="text-[9px] ml-1">
                          {link.embedMode}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Published {formatTimestamp(link.publishedAt)}
                        {link.expiresAt && ` · Expires ${formatTimestamp(link.expiresAt)}`}
                      </p>
                      <div className="flex items-center gap-1 pt-0.5">
                        <button
                          onClick={() => handleCopyUrl(link.token, link.id)}
                          className="cursor-pointer flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                          aria-label="Copy URL"
                        >
                          {copiedId === link.id ? (
                            <Check className="h-2.5 w-2.5" />
                          ) : (
                            <Copy className="h-2.5 w-2.5" />
                          )}
                          URL
                        </button>
                        <button
                          onClick={() => handleCopyEmbed(link.token)}
                          className="cursor-pointer flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                          aria-label="Copy embed code"
                        >
                          <Code className="h-2.5 w-2.5" />
                          Embed
                        </button>
                        <button
                          onClick={() => handleRevoke(link.id)}
                          className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-destructive ml-auto"
                          title="Revoke link"
                          aria-label={`Revoke published link: ${link.title}`}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}


// ============================================================
// EXPORT MENU
// ============================================================

interface ExportMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ExportMenu({ open, onOpenChange }: ExportMenuProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [pageSize, setPageSize] = useState<PdfPageSize>('a4');
  const [orientation, setOrientation] = useState<PdfOrientation>('landscape');
  const [resolution, setResolution] = useState(2);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);

    // Target the main chart/dashboard container
    const element = document.querySelector('[data-export-target="dashboard"]') as HTMLElement;
    if (!element) {
      setExportError('No dashboard element found to export.');
      setIsExporting(false);
      return;
    }

    try {
      let result;
      switch (format) {
        case 'pdf':
          result = await exportDashboard(element, {
            format: 'pdf',
            pageSize,
            orientation,
            resolution,
            margin: 10,
          });
          break;
        case 'png':
          result = await exportDashboard(element, {
            format: 'png',
            resolution,
          });
          break;
        case 'svg':
          result = await exportDashboard(element, { format: 'svg' });
          break;
      }

      if (result.success) {
        downloadExport(result);
        onOpenChange(false);
      } else {
        setExportError(result.error || 'Export failed.');
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  }, [format, pageSize, orientation, resolution, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-labelledby="export-dialog-title">
        <DialogHeader>
          <DialogTitle id="export-dialog-title">Export Dashboard</DialogTitle>
          <DialogDescription>
            Export your dashboard as PDF, PNG, or SVG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Format selection */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">Format</Label>
            <div className="flex gap-1.5">
              <FormatButton
                active={format === 'pdf'}
                onClick={() => setFormat('pdf')}
                icon={<FileText className="h-3.5 w-3.5" />}
                label="PDF"
              />
              <FormatButton
                active={format === 'png'}
                onClick={() => setFormat('png')}
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                label="PNG"
              />
              <FormatButton
                active={format === 'svg'}
                onClick={() => setFormat('svg')}
                icon={<Code className="h-3.5 w-3.5" />}
                label="SVG"
              />
            </div>
          </div>

          {/* PDF-specific settings */}
          {format === 'pdf' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="export-page-size" className="text-xs">
                  Page Size
                </Label>
                <select
                  id="export-page-size"
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as PdfPageSize)}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                  aria-label="Page size"
                >
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="letter">Letter</option>
                  <option value="legal">Legal</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="export-orientation" className="text-xs">
                  Orientation
                </Label>
                <select
                  id="export-orientation"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as PdfOrientation)}
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                  aria-label="Orientation"
                >
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                </select>
              </div>
            </>
          )}

          {/* Resolution (PDF and PNG) */}
          {format !== 'svg' && (
            <div className="space-y-1">
              <Label htmlFor="export-resolution" className="text-xs">
                Resolution ({resolution}x — {resolution * 96} DPI)
              </Label>
              <input
                id="export-resolution"
                type="range"
                min="1"
                max="4"
                step="1"
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value))}
                className="w-full"
                aria-label="Export resolution"
              />
            </div>
          )}

          {/* Error message */}
          {exportError && (
            <p className="text-xs text-destructive" role="alert">
              {exportError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            size="sm"
            className="h-7 text-xs cursor-pointer"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : `Export as ${format.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FormatButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function FormatButton({ active, onClick, icon, label }: FormatButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer flex flex-col items-center gap-1 rounded-md border p-2 flex-1 transition-colors ${
        active
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-input bg-background text-muted-foreground hover:text-foreground'
      }`}
      aria-pressed={active}
      aria-label={`Export as ${label}`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}


// ============================================================
// TEMPLATE GALLERY
// ============================================================

interface TemplateGalleryProps {
  onLoadTemplate: (template: WorkbookTemplate) => void;
  onSaveAsTemplate: (name: string, description: string, category: TemplateCategory) => void;
}

function TemplateGallery({ onLoadTemplate, onSaveAsTemplate }: TemplateGalleryProps) {
  const [customTemplates] = useState<WorkbookTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [previewTemplate, setPreviewTemplate] = useState<WorkbookTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveCategory, setSaveCategory] = useState<TemplateCategory>('custom');

  const allTemplates = getAvailableTemplates(customTemplates);
  const filteredTemplates = selectedCategory === 'all'
    ? allTemplates
    : allTemplates.filter((t) => t.category === selectedCategory);

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;
    onSaveAsTemplate(saveName.trim(), saveDescription.trim(), saveCategory);
    setIsSaving(false);
    setSaveName('');
    setSaveDescription('');
  }, [saveName, saveDescription, saveCategory, onSaveAsTemplate]);

  const categories: { value: TemplateCategory | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'sales', label: 'Sales' },
    { value: 'marketing', label: 'Marketing' },
    { value: 'finance', label: 'Finance' },
    { value: 'general', label: 'General' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <div className="flex flex-col h-full" role="region" aria-label="Template gallery">
      {/* Category filter + save button */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Templates</Label>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] cursor-pointer"
            onClick={() => setIsSaving(!isSaving)}
          >
            <Plus className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
            Save as Template
          </Button>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`cursor-pointer rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
                selectedCategory === cat.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={selectedCategory === cat.value}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save as template form */}
      {isSaving && (
        <div className="p-3 border-b space-y-2 bg-muted/30">
          <div className="space-y-1">
            <Label htmlFor="template-name" className="text-[10px]">
              Template Name
            </Label>
            <Input
              id="template-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="My Template"
              className="h-7 text-xs"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="template-description" className="text-[10px]">
              Description
            </Label>
            <Input
              id="template-description"
              value={saveDescription}
              onChange={(e) => setSaveDescription(e.target.value)}
              placeholder="Brief description..."
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="template-category" className="text-[10px]">
              Category
            </Label>
            <select
              id="template-category"
              value={saveCategory}
              onChange={(e) => setSaveCategory(e.target.value as TemplateCategory)}
              className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
              aria-label="Template category"
            >
              <option value="sales">Sales</option>
              <option value="marketing">Marketing</option>
              <option value="finance">Finance</option>
              <option value="general">General</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              className="h-6 text-[10px] flex-1 cursor-pointer"
              onClick={handleSave}
              disabled={!saveName.trim()}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] cursor-pointer"
              onClick={() => setIsSaving(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Template grid */}
      <ScrollArea className="flex-1">
        <div className="p-2 grid grid-cols-1 gap-2">
          {filteredTemplates.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No templates in this category
            </p>
          )}
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`rounded-md border p-2.5 space-y-1 transition-colors cursor-pointer hover:border-primary/50 ${
                previewTemplate?.id === template.id ? 'border-primary bg-primary/5' : 'bg-background'
              }`}
              onClick={() => setPreviewTemplate(
                previewTemplate?.id === template.id ? null : template
              )}
              role="button"
              aria-label={`Template: ${template.name}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPreviewTemplate(
                    previewTemplate?.id === template.id ? null : template
                  );
                }
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{template.name}</span>
                <Badge variant="outline" className="text-[9px]">
                  {template.category}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground line-clamp-2">
                {template.description}
              </p>

              {/* Preview details */}
              {previewTemplate?.id === template.id && (
                <div className="mt-1.5 space-y-1.5">
                  <div className="p-1.5 rounded bg-muted/50 text-[10px] space-y-0.5">
                    <p><strong>Sheets:</strong> {template.sheets.length}</p>
                    <p><strong>Data sources:</strong> {template.placeholderDataSources.length}</p>
                    <p><strong>Parameters:</strong> {template.parameters.length}</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-6 text-[10px] w-full cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoadTemplate(template);
                    }}
                  >
                    <ExternalLink className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
                    Create from Template
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}


// ============================================================
// MAIN WORKBOOK MANAGER COMPONENT
// ============================================================

export function WorkbookManager() {
  const {
    workbook,
    saveVersion,
    rollbackToVersion,
    deleteVersion,
    getVersionHistory,
    resetWorkbook,
  } = useWorkbookStore();

  const [activeTab, setActiveTab] = useState('versions');
  const [publishOpen, setPublishOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const versionHistory = getVersionHistory();

  const handleRollback = useCallback((versionId: string) => {
    rollbackToVersion(versionId);
  }, [rollbackToVersion]);

  const handleSaveVersion = useCallback((description: string) => {
    saveVersion(description);
  }, [saveVersion]);

  const handleDeleteVersion = useCallback((versionId: string) => {
    deleteVersion(versionId);
  }, [deleteVersion]);

  const handleLoadTemplate = useCallback((template: WorkbookTemplate) => {
    const newWorkbook = loadTemplate(template);
    // Reset and load the template workbook
    resetWorkbook();
    // Apply template data via store
    useWorkbookStore.setState({
      workbook: newWorkbook,
      versions: [],
    });
  }, [resetWorkbook]);

  const handleSaveAsTemplate = useCallback((
    name: string,
    description: string,
    category: TemplateCategory
  ) => {
    saveAsTemplate(workbook, name, description, category);
    // In a full implementation, this would persist to storage
  }, [workbook]);

  return (
    <div
      className="flex flex-col border-l bg-muted/20 w-64 h-full"
      role="region"
      aria-label="Workbook manager"
    >
      {/* Tab navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="border-b px-2 pt-2">
          <TabsList variant="line" className="w-full">
            <TabsTrigger
              value="versions"
              className="flex-1 text-[10px] gap-1"
              aria-label="Version history"
            >
              <History className="h-3 w-3" aria-hidden="true" />
              Versions
            </TabsTrigger>
            <TabsTrigger
              value="templates"
              className="flex-1 text-[10px] gap-1"
              aria-label="Template gallery"
            >
              <LayoutTemplate className="h-3 w-3" aria-hidden="true" />
              Templates
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] flex-1 cursor-pointer"
            onClick={() => setPublishOpen(true)}
          >
            <Globe className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
            Publish
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] flex-1 cursor-pointer"
            onClick={() => setExportOpen(true)}
          >
            <Download className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
            Export
          </Button>
        </div>

        {/* Tab content */}
        <TabsContent value="versions" className="flex-1 overflow-hidden">
          <VersionHistoryPanel
            versions={versionHistory}
            onRollback={handleRollback}
            onSaveVersion={handleSaveVersion}
            onDeleteVersion={handleDeleteVersion}
          />
        </TabsContent>

        <TabsContent value="templates" className="flex-1 overflow-hidden">
          <TemplateGallery
            onLoadTemplate={handleLoadTemplate}
            onSaveAsTemplate={handleSaveAsTemplate}
          />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
      <ExportMenu open={exportOpen} onOpenChange={setExportOpen} />
    </div>
  );
}

// ============================================================
// UTILITIES
// ============================================================

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
