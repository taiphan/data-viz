'use client';

import { useState, useMemo, useCallback } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { connectorEngine } from '@/lib/connectors/connector-engine';
import { queryResultToDataSource } from '@/lib/connectors/transform';
import { SchemaInfo, SchemaNode, ColumnInfo, QueryResult } from '@/lib/connectors/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ChevronRight,
  ChevronDown,
  Database,
  Table2,
  Eye,
  Columns3,
  Search,
  Import,
  Code,
  Loader2,
  KeyRound,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface ExpandedState {
  [nodeKey: string]: boolean;
}

interface PreviewState {
  loading: boolean;
  data: QueryResult | null;
  error: string | null;
  tableKey: string | null;
}

interface SchemaBrowserProps {
  connectionId: string;
  schemaInfo: SchemaInfo;
  onCustomQuery?: () => void;
}

// ============================================================
// HELPERS
// ============================================================

function getNodeKey(parentPath: string, node: SchemaNode): string {
  return parentPath ? `${parentPath}.${node.name}` : node.name;
}

function matchesSearch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

function filterSchemaTree(
  schemas: SchemaNode[],
  query: string,
): SchemaNode[] {
  if (!query.trim()) return schemas;

  return schemas
    .map((schema) => {
      const schemaMatches = matchesSearch(schema.name, query);

      const filteredChildren = (schema.children || [])
        .map((table) => {
          const tableMatches = matchesSearch(table.name, query);

          const filteredColumns = (table.columns || []).filter((col) =>
            matchesSearch(col.name, query),
          );

          if (tableMatches || filteredColumns.length > 0) {
            return { ...table, columns: filteredColumns.length > 0 ? filteredColumns : table.columns };
          }
          return null;
        })
        .filter(Boolean) as SchemaNode[];

      if (schemaMatches || filteredChildren.length > 0) {
        return {
          ...schema,
          children: schemaMatches ? schema.children : filteredChildren,
        };
      }
      return null;
    })
    .filter(Boolean) as SchemaNode[];
}

// ============================================================
// COLUMN ROW COMPONENT
// ============================================================

function ColumnRow({ column }: { column: ColumnInfo }) {
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 px-2 text-[11px] text-muted-foreground"
      role="treeitem"
      aria-label={`Column ${column.name}, type ${column.dataType}${column.nullable ? ', nullable' : ''}${column.primaryKey ? ', primary key' : ''}`}
    >
      <Columns3 className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
      <span className="truncate font-mono">{column.name}</span>
      <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
        {column.dataType}
      </Badge>
      {column.nullable && (
        <Badge variant="secondary" className="h-4 px-1 text-[9px] font-normal">
          null
        </Badge>
      )}
      {column.primaryKey && (
        <Badge variant="default" className="h-4 px-1 text-[9px] font-normal">
          <KeyRound className="h-2 w-2" aria-hidden="true" />
          PK
        </Badge>
      )}
    </div>
  );
}

// ============================================================
// TABLE NODE COMPONENT
// ============================================================

function TableNode({
  node,
  nodeKey,
  expanded,
  onToggle,
  onPreview,
  onImport,
  onCustomQuery,
  previewLoading,
}: {
  node: SchemaNode;
  nodeKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  onPreview: (schemaName: string, tableName: string) => void;
  onImport: (schemaName: string, tableName: string) => void;
  onCustomQuery?: () => void;
  previewLoading: boolean;
}) {
  const schemaName = nodeKey.split('.')[0];

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <div className="group flex items-center gap-1 py-1 px-1 hover:bg-muted/50 rounded-sm cursor-pointer">
        <button
          onClick={() => onToggle(nodeKey)}
          className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.type} ${node.name}`}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <Table2 className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
          <span className="text-xs truncate">{node.name}</span>
          {node.type === 'view' && (
            <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal ml-1">
              view
            </Badge>
          )}
        </button>
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 cursor-pointer"
            onClick={() => onPreview(schemaName, node.name)}
            disabled={previewLoading}
            title="Preview data"
          >
            {previewLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Eye className="h-3 w-3" aria-hidden="true" />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 cursor-pointer"
            onClick={() => onImport(schemaName, node.name)}
            title="Import table"
          >
            <Import className="h-3 w-3" aria-hidden="true" />
          </Button>
          {onCustomQuery && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 cursor-pointer"
              onClick={onCustomQuery}
              title="Custom query"
            >
              <Code className="h-3 w-3" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {expanded && node.columns && (
        <div className="ml-5 border-l pl-1" role="group" aria-label={`Columns of ${node.name}`}>
          {node.columns.map((col) => (
            <ColumnRow key={col.name} column={col} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SCHEMA BROWSER COMPONENT
// ============================================================

export function SchemaBrowser({
  connectionId,
  schemaInfo,
  onCustomQuery,
}: SchemaBrowserProps) {
  const { addDataSource } = useWorkbookStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [preview, setPreview] = useState<PreviewState>({
    loading: false,
    data: null,
    error: null,
    tableKey: null,
  });

  const filteredSchemas = useMemo(
    () => filterSchemaTree(schemaInfo.schemas, searchQuery),
    [schemaInfo.schemas, searchQuery],
  );

  const handleToggle = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handlePreview = useCallback(
    async (schemaName: string, tableName: string) => {
      const tableKey = `${schemaName}.${tableName}`;
      setPreview({ loading: true, data: null, error: null, tableKey });

      try {
        const result = await connectorEngine.previewTable(
          connectionId,
          schemaName,
          tableName,
          100,
        );
        setPreview({ loading: false, data: result, error: null, tableKey });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load preview';
        setPreview({ loading: false, data: null, error: message, tableKey });
      }
    },
    [connectionId],
  );

  const handleImport = useCallback(
    async (schemaName: string, tableName: string) => {
      try {
        const result = await connectorEngine.previewTable(
          connectionId,
          schemaName,
          tableName,
        );
        const dataSource = queryResultToDataSource(result, {
          name: tableName,
          sourceInfo: {
            connectorId: connectionId,
            tableName,
            schemaName,
            refreshedAt: new Date().toISOString(),
          },
        });
        addDataSource(dataSource);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import table';
        console.error('[schema-browser] Import failed:', message);
      }
    },
    [connectionId, addDataSource],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search schemas, tables, columns..."
            className="h-7 pl-7 text-xs"
            aria-label="Search schema"
          />
        </div>
      </div>

      {/* Tree View */}
      <ScrollArea className="flex-1">
        <div className="p-2" role="tree" aria-label="Database schema">
          {filteredSchemas.length === 0 && (
            <p className="text-[11px] text-muted-foreground text-center py-4">
              {searchQuery ? 'No matching schemas or tables' : 'No schemas available'}
            </p>
          )}

          {filteredSchemas.map((schema) => {
            const schemaKey = schema.name;
            const isSchemaExpanded = expanded[schemaKey] ?? false;

            return (
              <div key={schemaKey} role="treeitem" aria-expanded={isSchemaExpanded}>
                <button
                  onClick={() => handleToggle(schemaKey)}
                  className="flex items-center gap-1 w-full py-1 px-1 hover:bg-muted/50 rounded-sm cursor-pointer"
                  aria-label={`${isSchemaExpanded ? 'Collapse' : 'Expand'} schema ${schema.name}`}
                >
                  {isSchemaExpanded ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <Database className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                  <span className="text-xs font-medium truncate">{schema.name}</span>
                  {schema.children && (
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {schema.children.length}
                    </span>
                  )}
                </button>

                {isSchemaExpanded && schema.children && (
                  <div className="ml-4" role="group" aria-label={`Tables in ${schema.name}`}>
                    {schema.children.map((table) => {
                      const tableKey = getNodeKey(schemaKey, table);
                      const isTableExpanded = expanded[tableKey] ?? false;

                      return (
                        <TableNode
                          key={tableKey}
                          node={table}
                          nodeKey={tableKey}
                          expanded={isTableExpanded}
                          onToggle={handleToggle}
                          onPreview={handlePreview}
                          onImport={handleImport}
                          onCustomQuery={onCustomQuery}
                          previewLoading={
                            preview.loading && preview.tableKey === tableKey
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Preview Panel */}
      {preview.tableKey && (
        <div className="border-t">
          <div className="flex items-center justify-between px-2 py-1.5 bg-muted/30">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Preview: {preview.tableKey}
            </span>
            <button
              onClick={() =>
                setPreview({ loading: false, data: null, error: null, tableKey: null })
              }
              className="text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>

          {preview.loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="ml-2 text-xs text-muted-foreground">Loading preview...</span>
            </div>
          )}

          {preview.error && (
            <div className="p-2 text-xs text-destructive">{preview.error}</div>
          )}

          {preview.data && (
            <ScrollArea className="max-h-48">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/20">
                      {preview.data.fields.map((field) => (
                        <th
                          key={field.name}
                          className="px-2 py-1 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {field.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.data.rows.slice(0, 100).map((row, idx) => (
                      <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                        {preview.data!.fields.map((field) => (
                          <td
                            key={field.name}
                            className="px-2 py-0.5 whitespace-nowrap max-w-[200px] truncate"
                          >
                            {row[field.name] != null ? String(row[field.name]) : (
                              <span className="text-muted-foreground italic">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.data.rowCount > 0 && (
                <div className="px-2 py-1 text-[10px] text-muted-foreground border-t">
                  Showing {Math.min(preview.data.rows.length, 100)} of{' '}
                  {preview.data.totalRows.toLocaleString()} rows
                  {preview.data.truncated && ' (truncated)'}
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  );
}
