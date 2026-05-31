'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getConnectorsByCategory, searchConnectors } from '@/lib/connectors/registry';
import { CONNECTOR_CATEGORY_LABELS, CONNECTOR_CATEGORY_ORDER } from '@/lib/connectors/constants';
import { ConnectorCategory, ConnectorDefinition } from '@/lib/connectors/types';
import {
  Database,
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

interface ConnectorCatalogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (connector: ConnectorDefinition) => void;
}

export function ConnectorCatalog({
  open,
  onOpenChange,
  onSelect,
}: ConnectorCatalogProps) {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Connect to Data</DialogTitle>
          <DialogDescription>
            Select a data source connector to get started.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
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
      </DialogContent>
    </Dialog>
  );
}
