'use client';

import { useState } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { generateId } from '@/lib/data-engine';
import { DataField } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateBinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: DataField | null;
}

export function CreateBinDialog({
  open,
  onOpenChange,
  field,
}: CreateBinDialogProps) {
  const { addBin } = useWorkbookStore();
  const [binName, setBinName] = useState('');
  const [binSize, setBinSize] = useState('10');
  const [startAt, setStartAt] = useState('0');

  const resetForm = () => {
    setBinName('');
    setBinSize('10');
    setStartAt('0');
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleSave = () => {
    if (!field) return;

    const parsedBinSize = Number(binSize);
    const parsedStartAt = Number(startAt);

    if (!binName.trim() || isNaN(parsedBinSize) || parsedBinSize <= 0) return;

    addBin({
      id: generateId(),
      name: binName.trim(),
      sourceField: field.name,
      binSize: parsedBinSize,
      startAt: isNaN(parsedStartAt) ? 0 : parsedStartAt,
    });

    handleClose(false);
  };

  const parsedBinSize = Number(binSize);
  const parsedStartAt = Number(startAt);
  const isValid =
    binName.trim() && !isNaN(parsedBinSize) && parsedBinSize > 0;

  const previewBins = isValid
    ? Array.from({ length: 4 }, (_, i) => {
        const start = (isNaN(parsedStartAt) ? 0 : parsedStartAt) + i * parsedBinSize;
        const end = start + parsedBinSize;
        return `${start}-${end}`;
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Bin</DialogTitle>
          <DialogDescription>
            Segment &quot;{field?.name}&quot; into equal-sized numeric ranges.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bin-field-name">Bin field name</Label>
            <Input
              id="bin-field-name"
              value={binName}
              onChange={(e) => setBinName(e.target.value)}
              placeholder={`${field?.name} (binned)`}
              className="h-7 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bin-size">Bin size</Label>
            <Input
              id="bin-size"
              type="number"
              min="1"
              step="1"
              value={binSize}
              onChange={(e) => setBinSize(e.target.value)}
              placeholder="10"
              className="h-7 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bin-start">Start at</Label>
            <Input
              id="bin-start"
              type="number"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              placeholder="0"
              className="h-7 text-xs"
            />
          </div>

          {previewBins.length > 0 && (
            <div className="space-y-1">
              <Label className="text-muted-foreground">Preview</Label>
              <div className="flex flex-wrap gap-1">
                {previewBins.map((label) => (
                  <span
                    key={label}
                    className="rounded bg-green-100 dark:bg-green-900 px-1.5 py-0.5 text-[10px]"
                  >
                    {label}
                  </span>
                ))}
                <span className="text-[10px] text-muted-foreground">...</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => handleClose(false)}
          >
            Cancel
          </Button>
          <Button
            className="cursor-pointer"
            onClick={handleSave}
            disabled={!isValid}
          >
            Create Bin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
