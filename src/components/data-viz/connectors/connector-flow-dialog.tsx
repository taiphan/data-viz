'use client';

import { useState, useCallback } from 'react';
import { useWorkbookStore } from '@/lib/store';
import { connectorEngine } from '@/lib/connectors/connector-engine';
import { getConnectorById } from '@/lib/connectors/registry';
import { generateId } from '@/lib/data-engine';
import {
  ConnectorDefinition,
  ConnectionProfile,
  SchemaInfo,
} from '@/lib/connectors/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConnectionForm } from './connection-form';
import { SchemaBrowser } from './schema-browser';
import { QueryBuilder } from './query-builder';
import { ProfileManager } from './profile-manager';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft,
  Database,
  FolderOpen,
} from 'lucide-react';

// ============================================================
// FLOW STEP TYPES
// ============================================================

type FlowStep =
  | 'catalog'
  | 'form'
  | 'schema-browser'
  | 'query-builder';

// ============================================================
// CONNECTOR FLOW DIALOG
// ============================================================

interface ConnectorFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectorFlowDialog({
  open,
  onOpenChange,
}: ConnectorFlowDialogProps) {
  const { addProfile, setActiveConnection, setConnectionStatus, setSchemaInfo } =
    useWorkbookStore();

  const [step, setStep] = useState<FlowStep>('catalog');
  const [selectedConnector, setSelectedConnector] = useState<ConnectorDefinition | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [initialFormValues, setInitialFormValues] = useState<Record<string, unknown> | undefined>(
    undefined,
  );
  const [activeTab, setActiveTab] = useState<string>('new');

  // ============================================================
  // RESET STATE
  // ============================================================

  const resetFlow = useCallback(() => {
    setStep('catalog');
    setSelectedConnector(null);
    setConnectionId(null);
    setSchema(null);
    setInitialFormValues(undefined);
    setActiveTab('new');
  }, []);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        resetFlow();
      }
      onOpenChange(isOpen);
    },
    [onOpenChange, resetFlow],
  );

  // ============================================================
  // CATALOG → FORM
  // ============================================================

  const handleConnectorSelect = useCallback((connector: ConnectorDefinition) => {
    setSelectedConnector(connector);
    setInitialFormValues(undefined);
    setStep('form');
  }, []);

  // ============================================================
  // PROFILE → FORM (pre-populated)
  // ============================================================

  const handleProfileSelect = useCallback((profile: ConnectionProfile) => {
    const connector = getConnectorById(profile.connectorId);
    if (!connector) return;

    setSelectedConnector(connector);
    setInitialFormValues(profile.parameters);
    setStep('form');
  }, []);

  // ============================================================
  // FORM → SCHEMA BROWSER (on successful connection)
  // ============================================================

  const handleConnect = useCallback(
    async (connId: string) => {
      setConnectionId(connId);
      setActiveConnection(connId);
      setConnectionStatus('connected');

      // Fetch schema for the connection
      try {
        const schemaInfo = await connectorEngine.getSchema(connId);
        setSchema(schemaInfo);
        setSchemaInfo(schemaInfo);
        setStep('schema-browser');
      } catch {
        // If schema fetch fails, still show schema browser with empty state
        setSchema({ schemas: [] });
        setSchemaInfo({ schemas: [] });
        setStep('schema-browser');
      }

      // Offer to save as profile
      if (selectedConnector) {
        const profile: ConnectionProfile = {
          id: generateId(),
          name: `${selectedConnector.name} Connection`,
          connectorId: selectedConnector.id,
          parameters: initialFormValues ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastConnectedAt: new Date().toISOString(),
        };
        addProfile(profile);
      }
    },
    [
      selectedConnector,
      initialFormValues,
      addProfile,
      setActiveConnection,
      setConnectionStatus,
      setSchemaInfo,
    ],
  );

  // ============================================================
  // SCHEMA BROWSER → QUERY BUILDER
  // ============================================================

  const handleCustomQuery = useCallback(() => {
    setStep('query-builder');
  }, []);

  // ============================================================
  // NAVIGATION
  // ============================================================

  const handleBack = useCallback(() => {
    switch (step) {
      case 'form':
        setStep('catalog');
        setSelectedConnector(null);
        setInitialFormValues(undefined);
        break;
      case 'schema-browser':
        setStep('form');
        break;
      case 'query-builder':
        setStep('schema-browser');
        break;
      default:
        break;
    }
  }, [step]);

  const handleClose = useCallback(() => {
    handleOpenChange(false);
  }, [handleOpenChange]);

  // ============================================================
  // RENDER — CATALOG STEP (with tabs for New / Saved)
  // ============================================================

  if (step === 'catalog') {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Connect to Data</DialogTitle>
            <DialogDescription>
              Choose a connector or select a saved connection profile.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(String(val))}>
            <TabsList>
              <TabsTrigger value="new">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                New Connection
              </TabsTrigger>
              <TabsTrigger value="saved">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Saved Profiles
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-3">
              <ConnectorCatalogInline onSelect={handleConnectorSelect} />
            </TabsContent>

            <TabsContent value="saved" className="mt-3">
              <div className="h-[50vh]">
                <ProfileManager onSelect={handleProfileSelect} />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    );
  }

  // ============================================================
  // RENDER — FORM STEP
  // ============================================================

  if (step === 'form' && selectedConnector) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="h-7 w-7 p-0 cursor-pointer"
              aria-label="Back to catalog"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Back to connectors
            </span>
          </div>

          <ConnectionForm
            connector={selectedConnector}
            initialValues={initialFormValues}
            onConnect={handleConnect}
            onCancel={handleBack}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // ============================================================
  // RENDER — SCHEMA BROWSER STEP
  // ============================================================

  if (step === 'schema-browser' && connectionId && schema) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-7 w-7 p-0 cursor-pointer"
                aria-label="Back to connection form"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <DialogTitle>Browse Schema</DialogTitle>
                <DialogDescription>
                  Select tables to import or write a custom query.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="h-[55vh]">
            <SchemaBrowser
              connectionId={connectionId}
              schemaInfo={schema}
              onCustomQuery={handleCustomQuery}
            />
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ============================================================
  // RENDER — QUERY BUILDER STEP
  // ============================================================

  if (step === 'query-builder' && connectionId) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-7 w-7 p-0 cursor-pointer"
                aria-label="Back to schema browser"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <DialogTitle>Custom Query</DialogTitle>
                <DialogDescription>
                  Write SQL to extract the data you need.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            <QueryBuilder connectionId={connectionId} />
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Fallback — should not reach here
  return null;
}

// ============================================================
// INLINE CATALOG (without its own Dialog wrapper)
// ============================================================

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getConnectorsByCategory, searchConnectors } from '@/lib/connectors/registry';
import { CONNECTOR_CATEGORY_LABELS, CONNECTOR_CATEGORY_ORDER } from '@/lib/connectors/constants';
import { ConnectorCategory } from '@/lib/connectors/types';
import {
  Cloud,
  FileText,
  HardDrive,
  Globe,
  Cable,
  Server,
  Search,
} from 'lucide-react';

const CATEGORY_ICONS: Record<ConnectorCategory, React.ElementType> = {
  'cloud-warehouse': Cloud,
  'database': Database,
  'cloud-service': Server,
  'file': FileText,
  'cloud-storage': HardDrive,
  'rest-api': Globe,
  'connectivity': Cable,
};

function getConnectorIcon(icon: string): React.ElementType {
  switch (icon) {
    case 'database':
      return Database;
    case 'cloud':
      return Cloud;
    case 'file':
    case 'file-text':
      return FileText;
    case 'hard-drive':
      return HardDrive;
    case 'globe':
      return Globe;
    case 'cable':
      return Cable;
    case 'server':
      return Server;
    default:
      return Database;
  }
}

interface ConnectorCatalogInlineProps {
  onSelect: (connector: ConnectorDefinition) => void;
}

function ConnectorCatalogInline({ onSelect }: ConnectorCatalogInlineProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) {
      return getConnectorsByCategory();
    }

    const results = searchConnectors(searchQuery);
    const grouped = {} as Record<ConnectorCategory, ConnectorDefinition[]>;

    for (const category of CONNECTOR_CATEGORY_ORDER) {
      grouped[category] = [];
    }

    for (const connector of results) {
      grouped[connector.category].push(connector);
    }

    return grouped;
  }, [searchQuery]);

  const hasResults = useMemo(
    () => CONNECTOR_CATEGORY_ORDER.some((cat) => filteredGroups[cat].length > 0),
    [filteredGroups],
  );

  return (
    <div>
      <div className="relative mb-3">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          placeholder="Search connectors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          aria-label="Search connectors"
        />
      </div>

      <ScrollArea className="h-[50vh]">
        {!hasResults && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No connectors found for &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        )}

        {CONNECTOR_CATEGORY_ORDER.map((category) => {
          const connectors = filteredGroups[category];
          if (connectors.length === 0) return null;

          const CategoryIcon = CATEGORY_ICONS[category];

          return (
            <div key={category} className="mb-6">
              <div className="flex items-center gap-2 mb-3 px-1">
                <CategoryIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {CONNECTOR_CATEGORY_LABELS[category]}
                </h3>
                <span className="text-xs text-muted-foreground/60">
                  ({connectors.length})
                </span>
              </div>

              <div
                className="grid grid-cols-2 sm:grid-cols-3 gap-2"
                role="list"
                aria-label={`${CONNECTOR_CATEGORY_LABELS[category]} connectors`}
              >
                {connectors.map((connector) => {
                  const ConnectorIcon = getConnectorIcon(connector.icon);

                  return (
                    <button
                      key={connector.id}
                      role="listitem"
                      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent hover:border-accent-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                      onClick={() => onSelect(connector)}
                      aria-label={`${connector.name} - ${connector.description}`}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <ConnectorIcon className="h-4 w-4 text-foreground/70" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight truncate">
                          {connector.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {connector.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </ScrollArea>
    </div>
  );
}
