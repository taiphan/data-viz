'use client';

import { useState } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  History,
  Save,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Clock,
  GitBranch,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function VersionHistoryPanel() {
  const {
    versions,
    workbook,
    saveVersion,
    rollbackToVersion,
    deleteVersion,
    getVersionHistory,
  } = useWorkbookStore();

  const t = useT();
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);

  const history = getVersionHistory();

  const handleSave = () => {
    if (!description.trim()) return;
    saveVersion(description.trim());
    setDescription('');
  };

  const handleRollback = (versionId: string) => {
    rollbackToVersion(versionId);
    setConfirmRollback(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label={t('versions.title')}
      >
        <History className="h-4 w-4" />
        <span className="hidden sm:inline">{t('versions.button')}</span>
        {history.length > 0 && (
          <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
            {history.length}
          </Badge>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-80 border-l bg-background shadow-xl animate-in slide-in-from-right-full duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t('versions.title')}</h2>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded-md p-1 hover:bg-accent transition-colors"
          aria-label={t('versions.cancel')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Save new version */}
      <div className="border-b px-4 py-3 space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          {t('versions.saveLabel')}
        </label>
        <div className="flex gap-2">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('versions.savePlaceholder')}
            className="h-8 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!description.trim()}
            className="h-8 px-3 shrink-0"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {t('versions.save')}
          </Button>
        </div>
      </div>

      {/* Version list */}
      <ScrollArea className="flex-1">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <History className="h-8 w-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t('versions.noVersions')}</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {t('versions.noVersionsDesc')}
            </p>
          </div>
        ) : (
          <div className="px-2 py-2 space-y-1">
            {history.map((version) => (
              <div
                key={version.id}
                className="group rounded-lg border bg-card p-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {version.description}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(version.timestamp), { addSuffix: true })}
                      </span>
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        v{version.versionNumber}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {confirmRollback === version.id ? (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/20">
                    <span className="text-[10px] text-destructive flex-1">
                      {t('versions.confirmRestore')}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => handleRollback(version.id)}
                    >
                      {t('versions.confirm')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setConfirmRollback(null)}
                    >
                      {t('versions.cancel')}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setConfirmRollback(version.id)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      {t('versions.restore')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] text-destructive hover:text-destructive"
                      onClick={() => deleteVersion(version.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t('versions.delete')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t px-4 py-2">
        <p className="text-[10px] text-muted-foreground text-center">
          {history.length} / 50 {t('versions.saved')}
        </p>
      </div>
    </div>
  );
}
