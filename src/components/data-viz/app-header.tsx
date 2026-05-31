'use client';

import { useWorkbookStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { VersionHistoryPanel } from '@/components/data-viz/version-history-panel';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Pencil, Check, LogOut, User } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const APP_VERSION = '1.0.0';

export function AppHeader() {
  const { workbook, renameWorkbook } = useWorkbookStore();
  const { user, logout } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(workbook.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      renameWorkbook(trimmed);
    } else {
      setEditValue(workbook.name);
    }
    setIsEditing(false);
  };

  return (
    <header className="flex items-center justify-between border-b bg-card/50 backdrop-blur-sm px-4 py-2 shrink-0">
      {/* Left: Logo + Workbook name */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10">
            <BarChart3 className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-semibold tracking-tight hidden md:inline">
            DataViz
          </span>
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 hidden md:inline-flex">
            v{APP_VERSION}
          </Badge>
        </div>

        <div className="h-4 w-px bg-border hidden md:block" />

        {/* Editable workbook name */}
        <div className="flex items-center gap-1.5">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') {
                    setEditValue(workbook.name);
                    setIsEditing(false);
                  }
                }}
                className="h-6 w-48 rounded border bg-background px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={handleSave}
                className="rounded p-0.5 hover:bg-accent transition-colors"
                aria-label="Save name"
              >
                <Check className="h-3.5 w-3.5 text-primary" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setEditValue(workbook.name);
                setIsEditing(true);
              }}
              className="group flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent transition-colors"
              aria-label="Rename workbook"
            >
              <span className="text-xs font-medium truncate max-w-[200px]">
                {workbook.name}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <VersionHistoryPanel />
        <div className="h-4 w-px bg-border mx-1" />
        <ThemeSwitcher />
        <div className="h-4 w-px bg-border mx-1" />
        {/* User menu */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium hidden sm:inline">
                {user.displayName}
              </span>
            </div>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
