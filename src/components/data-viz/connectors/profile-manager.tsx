'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { generateId } from '@/lib/data-engine';
import { ConnectionProfile } from '@/lib/connectors/types';
import { getConnectorById } from '@/lib/connectors/registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Database,
  FolderOpen,
} from 'lucide-react';

// ============================================================
// PROFILE LIST ITEM
// ============================================================

interface ProfileItemProps {
  profile: ConnectionProfile;
  isRenaming: boolean;
  onSelect: (profile: ConnectionProfile) => void;
  onRename: (id: string, newName: string) => void;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onDuplicate: (profile: ConnectionProfile) => void;
  onDelete: (id: string) => void;
}

function ProfileItem({
  profile,
  isRenaming,
  onSelect,
  onRename,
  onStartRename,
  onCancelRename,
  onDuplicate,
  onDelete,
}: ProfileItemProps) {
  const [editName, setEditName] = useState(profile.name);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const connector = getConnectorById(profile.connectorId);
  const connectorName = connector?.name ?? profile.connectorId;

  const lastConnected = profile.lastConnectedAt
    ? new Date(profile.lastConnectedAt).toLocaleDateString()
    : 'Never';

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== profile.name) {
      onRename(profile.id, trimmed);
    } else {
      onCancelRename();
    }
  }, [editName, profile.id, profile.name, onRename, onCancelRename]);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenameSubmit();
      } else if (e.key === 'Escape') {
        setEditName(profile.name);
        onCancelRename();
      }
    },
    [handleRenameSubmit, profile.name, onCancelRename],
  );

  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    onDelete(profile.id);
    setShowDeleteConfirm(false);
  }, [onDelete, profile.id]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);

  return (
    <div
      className="group relative rounded-md border bg-background p-2.5 hover:border-primary/50 transition-colors"
      role="listitem"
      aria-label={`Connection profile: ${profile.name}`}
    >
      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/95 border border-destructive/30"
          role="alertdialog"
          aria-label="Confirm deletion"
        >
          <div className="text-center space-y-1.5 px-2">
            <p className="text-xs text-muted-foreground">
              Delete &quot;{profile.name}&quot;?
            </p>
            <div className="flex gap-1 justify-center">
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[10px] cursor-pointer"
                onClick={handleDeleteConfirm}
                aria-label="Confirm delete"
              >
                Delete
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] cursor-pointer"
                onClick={handleDeleteCancel}
                aria-label="Cancel delete"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex items-start justify-between gap-2">
        <button
          className="flex-1 text-left cursor-pointer min-w-0"
          onClick={() => onSelect(profile)}
          onDoubleClick={() => onStartRename(profile.id)}
          aria-label={`Select profile ${profile.name}`}
        >
          {isRenaming ? (
            <Input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleRenameKeyDown}
              className="h-6 text-xs font-medium"
              aria-label="Rename profile"
            />
          ) : (
            <span className="text-xs font-medium truncate block">
              {profile.name}
            </span>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <Database className="h-2.5 w-2.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground truncate">
              {connectorName}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">
            Last connected: {lastConnected}
          </span>
        </button>

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer transition-opacity"
            aria-label={`Actions for ${profile.name}`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuItem onClick={() => onStartRename(profile.id)}>
              <Pencil className="h-3.5 w-3.5" />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(profile)}>
              <Copy className="h-3.5 w-3.5" />
              <span>Duplicate</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={handleDeleteClick}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ============================================================
// PROFILE MANAGER
// ============================================================

export interface ProfileManagerProps {
  onSelect: (profile: ConnectionProfile) => void;
}

export function ProfileManager({ onSelect }: ProfileManagerProps) {
  const { profiles, updateProfile, removeProfile, addProfile } =
    useWorkbookStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const filteredProfiles = profiles.filter((profile) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const connector = getConnectorById(profile.connectorId);
    const connectorName = connector?.name ?? profile.connectorId;
    return (
      profile.name.toLowerCase().includes(query) ||
      connectorName.toLowerCase().includes(query)
    );
  });

  const handleSelect = useCallback(
    (profile: ConnectionProfile) => {
      if (renamingId === profile.id) return;
      onSelect(profile);
    },
    [onSelect, renamingId],
  );

  const handleRename = useCallback(
    (id: string, newName: string) => {
      updateProfile(id, { name: newName });
      setRenamingId(null);
    },
    [updateProfile],
  );

  const handleStartRename = useCallback((id: string) => {
    setRenamingId(id);
  }, []);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
  }, []);

  const handleDuplicate = useCallback(
    (profile: ConnectionProfile) => {
      const duplicate: ConnectionProfile = {
        ...profile,
        id: generateId(),
        name: `${profile.name} (copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastConnectedAt: undefined,
      };
      addProfile(duplicate);
    },
    [addProfile],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeProfile(id);
    },
    [removeProfile],
  );

  return (
    <div
      className="flex flex-col h-full"
      role="region"
      aria-label="Connection profiles"
    >
      {/* Search */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search profiles..."
            className="h-7 text-xs pl-7"
            aria-label="Search connection profiles"
          />
        </div>
      </div>

      {/* Profile list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1.5" role="list" aria-label="Saved connection profiles">
          {filteredProfiles.length === 0 && profiles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FolderOpen
                className="h-8 w-8 text-muted-foreground/50 mb-2"
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground">
                No saved profiles
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                Connect to a data source to save a profile
              </p>
            </div>
          )}

          {filteredProfiles.length === 0 && profiles.length > 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No profiles match &quot;{searchQuery}&quot;
            </p>
          )}

          {filteredProfiles.map((profile) => (
            <ProfileItem
              key={profile.id}
              profile={profile}
              isRenaming={renamingId === profile.id}
              onSelect={handleSelect}
              onRename={handleRename}
              onStartRename={handleStartRename}
              onCancelRename={handleCancelRename}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
