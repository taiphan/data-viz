'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { connectorEngine } from '@/lib/connectors/connector-engine';
import { QueryRequest, QueryResult } from '@/lib/connectors/types';
import { queryResultToDataSource } from '@/lib/connectors/transform';
import { useWorkbookStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Play, Download, Loader2, AlertCircle } from 'lucide-react';
import { ExplainButton } from '@/components/admin/explain-viewer';

// ============================================================
// CONSTANTS
// ============================================================

const PREVIEW_ROW_COUNT = 100;
const MAX_DISPLAY_CELL_LENGTH = 120;

// ============================================================
// SQL KEYWORD HIGHLIGHTING (CSS-based approach)
// ============================================================

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL',
  'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'ON',
  'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET',
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE',
  'TABLE', 'ALTER', 'DROP', 'INDEX', 'VIEW', 'AS', 'DISTINCT',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'BETWEEN', 'LIKE', 'EXISTS',
  'UNION', 'ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST',
  'WITH', 'RECURSIVE', 'FETCH', 'NEXT', 'ROWS', 'ONLY',
]);

function highlightSql(sql: string): string {
  return sql.replace(/\b(\w+)\b/g, (match) => {
    if (SQL_KEYWORDS.has(match.toUpperCase())) {
      return `<span class="text-blue-600 dark:text-blue-400 font-semibold">${match}</span>`;
    }
    return match;
  })
    .replace(/('(?:[^'\\]|\\.)*')/g,
      '<span class="text-green-600 dark:text-green-400">$1</span>')
    .replace(/(--[^\n]*)/g,
      '<span class="text-muted-foreground italic">$1</span>')
    .replace(/(\b\d+\.?\d*\b)/g,
      '<span class="text-orange-600 dark:text-orange-400">$1</span>');
}

// ============================================================
// ERROR SANITIZATION
// ============================================================

function sanitizeErrorMessage(error: string): string {
  // Remove potential credential patterns from error messages
  return error
    .replace(/password[=:]\s*\S+/gi, 'password=***')
    .replace(/token[=:]\s*\S+/gi, 'token=***')
    .replace(/secret[=:]\s*\S+/gi, 'secret=***')
    .replace(/key[=:]\s*\S+/gi, 'key=***')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]');
}

// ============================================================
// CELL VALUE FORMATTER
// ============================================================

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  const str = String(value);
  if (str.length > MAX_DISPLAY_CELL_LENGTH) {
    return str.slice(0, MAX_DISPLAY_CELL_LENGTH) + '…';
  }
  return str;
}

// ============================================================
// QUERY BUILDER COMPONENT
// ============================================================

interface QueryBuilderProps {
  connectionId: string;
  defaultSql?: string;
}

export function QueryBuilder({ connectionId, defaultSql = '' }: QueryBuilderProps) {
  const { addDataSource } = useWorkbookStore();

  const [sql, setSql] = useState(defaultSql);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Execute query
  const executeQuery = useCallback(async () => {
    const trimmedSql = sql.trim();
    if (!trimmedSql || isExecuting) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);
    setExecutionTimeMs(null);

    const request: QueryRequest = {
      connectionId,
      sql: trimmedSql,
      limit: PREVIEW_ROW_COUNT,
    };

    try {
      const startTime = performance.now();
      const queryResult = await connectorEngine.executeQuery(request);
      const elapsed = performance.now() - startTime;

      setResult(queryResult);
      setExecutionTimeMs(queryResult.executionTimeMs || Math.round(elapsed));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query execution failed';
      setError(sanitizeErrorMessage(message));
    } finally {
      setIsExecuting(false);
    }
  }, [sql, connectionId, isExecuting]);

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter to execute
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery();
      }
    },
    [executeQuery],
  );

  // Import results as DataSource
  const handleImportResults = useCallback(() => {
    if (!result) return;

    const dataSource = queryResultToDataSource(result, {
      name: 'Custom Query',
      sourceInfo: {
        connectorId: connectionId,
        query: sql.trim(),
      },
    });

    addDataSource(dataSource);
  }, [result, connectionId, sql, addDataSource]);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 240)}px`;
    }
  }, [sql]);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* SQL Editor */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="sql-editor"
          className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
        >
          SQL Query
        </label>

        <div className="relative rounded-lg border border-input bg-background">
          {/* Syntax highlight overlay */}
          <div
            ref={highlightRef}
            className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-3 font-mono text-sm leading-relaxed"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlightSql(sql) }}
          />

          {/* Editable textarea */}
          <textarea
            ref={textareaRef}
            id="sql-editor"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder="SELECT * FROM table_name LIMIT 100"
            className="relative z-10 w-full min-h-[120px] max-h-[240px] resize-y rounded-lg bg-transparent p-3 font-mono text-sm leading-relaxed text-transparent caret-foreground outline-none placeholder:text-muted-foreground"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            aria-label="SQL query editor"
          />
        </div>

        <p className="text-[10px] text-muted-foreground">
          Press <kbd className="rounded border px-1 py-0.5 text-[9px] font-mono">Ctrl+Enter</kbd> to execute
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          onClick={executeQuery}
          disabled={!sql.trim() || isExecuting}
          size="sm"
          className="gap-1.5"
        >
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {isExecuting ? 'Executing…' : 'Execute'}
        </Button>

        <ExplainButton
          connectionId={connectionId}
          sql={sql}
          disabled={!sql.trim() || isExecuting}
        />

        {result && (
          <Button
            onClick={handleImportResults}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Import Results
          </Button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-destructive">Query Error</p>
            <pre className="text-xs text-destructive/80 whitespace-pre-wrap font-mono break-words">
              {error}
            </pre>
          </div>
        </div>
      )}

      {/* Result metadata */}
      {result && executionTimeMs !== null && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {result.rowCount.toLocaleString()} row{result.rowCount !== 1 ? 's' : ''} returned
          </span>
          {result.totalRows > result.rowCount && (
            <span className="text-amber-600 dark:text-amber-400">
              ({result.totalRows.toLocaleString()} total, showing first {result.rowCount.toLocaleString()})
            </span>
          )}
          <span>•</span>
          <span>{executionTimeMs.toLocaleString()}ms</span>
          {result.truncated && (
            <>
              <span>•</span>
              <span className="text-amber-600 dark:text-amber-400">Results truncated</span>
            </>
          )}
        </div>
      )}

      {/* Result preview table */}
      {result && result.fields.length > 0 && (
        <div className="rounded-lg border">
          <ScrollArea className="max-h-[320px]">
            <Table>
              <TableHeader>
                <TableRow>
                  {result.fields.map((field) => (
                    <TableHead key={field.name} className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold">{field.name}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          {field.dataType}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.slice(0, PREVIEW_ROW_COUNT).map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    {result.fields.map((field) => (
                      <TableCell
                        key={`${rowIdx}-${field.name}`}
                        className="text-xs font-mono max-w-[200px] truncate"
                      >
                        <span
                          className={
                            row[field.name] === null || row[field.name] === undefined
                              ? 'text-muted-foreground italic'
                              : ''
                          }
                        >
                          {formatCellValue(row[field.name])}
                        </span>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {/* Loading state */}
      {isExecuting && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Executing query…</span>
        </div>
      )}
    </div>
  );
}
