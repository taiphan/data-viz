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
import { Plus, X } from 'lucide-react';

interface GroupEntry {
  name: string;
  values: string[];
}

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: DataField | null;
  sampleValues: string[];
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  field,
  sampleValues,
}: CreateGroupDialogProps) {
  const { addGroup } = useWorkbookStore();
  const [groupName, setGroupName] = useState('');
  const [otherGroupName, setOtherGroupName] = useState('Other');
  const [groups, setGroups] = useState<GroupEntry[]>([
    { name: '', values: [] },
  ]);
  const [valueInput, setValueInput] = useState<Record<number, string>>({});

  const resetForm = () => {
    setGroupName('');
    setOtherGroupName('Other');
    setGroups([{ name: '', values: [] }]);
    setValueInput({});
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleAddGroup = () => {
    setGroups([...groups, { name: '', values: [] }]);
  };

  const handleRemoveGroup = (index: number) => {
    setGroups(groups.filter((_, i) => i !== index));
  };

  const handleGroupNameChange = (index: number, name: string) => {
    setGroups(groups.map((g, i) => (i === index ? { ...g, name } : g)));
  };

  const handleAddValue = (index: number) => {
    const value = (valueInput[index] || '').trim();
    if (!value) return;
    setGroups(
      groups.map((g, i) =>
        i === index ? { ...g, values: [...g.values, value] } : g
      )
    );
    setValueInput({ ...valueInput, [index]: '' });
  };

  const handleRemoveValue = (groupIndex: number, valueIndex: number) => {
    setGroups(
      groups.map((g, i) =>
        i === groupIndex
          ? { ...g, values: g.values.filter((_, vi) => vi !== valueIndex) }
          : g
      )
    );
  };

  const handleSelectSampleValue = (groupIndex: number, value: string) => {
    const group = groups[groupIndex];
    if (group.values.includes(value)) return;
    setGroups(
      groups.map((g, i) =>
        i === groupIndex ? { ...g, values: [...g.values, value] } : g
      )
    );
  };

  const handleSave = () => {
    if (!field || !groupName.trim()) return;

    const validGroups = groups.filter(
      (g) => g.name.trim() && g.values.length > 0
    );
    if (validGroups.length === 0) return;

    addGroup({
      id: generateId(),
      name: groupName.trim(),
      sourceField: field.name,
      groups: validGroups.map((g) => ({
        name: g.name.trim(),
        values: g.values,
      })),
      otherGroupName: otherGroupName.trim() || 'Other',
    });

    handleClose(false);
  };

  const isValid =
    groupName.trim() &&
    groups.some((g) => g.name.trim() && g.values.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>
            Group values from &quot;{field?.name}&quot; into custom categories.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="group-field-name">Group field name</Label>
            <Input
              id="group-field-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={`${field?.name} (grouped)`}
              className="h-7 text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label>Groups</Label>
            {groups.map((group, index) => (
              <div
                key={index}
                className="rounded border p-2 space-y-1.5 bg-muted/30"
              >
                <div className="flex items-center gap-1">
                  <Input
                    value={group.name}
                    onChange={(e) =>
                      handleGroupNameChange(index, e.target.value)
                    }
                    placeholder="Group name"
                    className="h-6 text-xs flex-1"
                  />
                  {groups.length > 1 && (
                    <button
                      onClick={() => handleRemoveGroup(index)}
                      className="cursor-pointer p-0.5 text-muted-foreground hover:text-destructive"
                      title="Remove group"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {group.values.map((val, vi) => (
                    <span
                      key={vi}
                      className="inline-flex items-center gap-0.5 rounded bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 text-[10px]"
                    >
                      {val}
                      <button
                        onClick={() => handleRemoveValue(index, vi)}
                        className="cursor-pointer text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-1">
                  <Input
                    value={valueInput[index] || ''}
                    onChange={(e) =>
                      setValueInput({ ...valueInput, [index]: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddValue(index);
                      }
                    }}
                    placeholder="Add value..."
                    className="h-6 text-[10px] flex-1"
                  />
                  <Button
                    size="xs"
                    variant="outline"
                    className="h-6 cursor-pointer"
                    onClick={() => handleAddValue(index)}
                  >
                    Add
                  </Button>
                </div>

                {sampleValues.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 pt-0.5">
                    {sampleValues.slice(0, 8).map((val) => (
                      <button
                        key={val}
                        onClick={() => handleSelectSampleValue(index, val)}
                        className="cursor-pointer rounded bg-muted px-1 py-0.5 text-[9px] hover:bg-accent"
                        title={`Add "${val}" to this group`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] w-full cursor-pointer"
              onClick={handleAddGroup}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Group
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="other-group-name">
              Label for ungrouped values
            </Label>
            <Input
              id="other-group-name"
              value={otherGroupName}
              onChange={(e) => setOtherGroupName(e.target.value)}
              placeholder="Other"
              className="h-7 text-xs"
            />
          </div>
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
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
