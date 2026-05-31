import { ConnectorCategory, ConnectorDefinition } from './types';
import { CONNECTOR_CATEGORY_ORDER } from './constants';
import { ALL_CONNECTORS } from './definitions';

/**
 * Returns all registered connector definitions.
 */
export function getAllConnectors(): ConnectorDefinition[] {
  return ALL_CONNECTORS;
}

/**
 * Returns a single connector definition by its unique id.
 * Returns undefined if no connector matches.
 */
export function getConnectorById(id: string): ConnectorDefinition | undefined {
  return ALL_CONNECTORS.find((c) => c.id === id);
}

/**
 * Returns connectors grouped by category, ordered according to
 * CONNECTOR_CATEGORY_ORDER. Each group contains all connectors
 * whose category field matches the group key.
 */
export function getConnectorsByCategory(): Record<ConnectorCategory, ConnectorDefinition[]> {
  const grouped = {} as Record<ConnectorCategory, ConnectorDefinition[]>;

  for (const category of CONNECTOR_CATEGORY_ORDER) {
    grouped[category] = [];
  }

  for (const connector of ALL_CONNECTORS) {
    grouped[connector.category].push(connector);
  }

  return grouped;
}

/**
 * Filters connectors whose name or category contains the query string
 * (case-insensitive). Returns all connectors if query is empty.
 */
export function searchConnectors(query: string): ConnectorDefinition[] {
  if (!query.trim()) {
    return ALL_CONNECTORS;
  }

  const lowerQuery = query.toLowerCase();

  return ALL_CONNECTORS.filter((connector) => {
    const nameMatch = connector.name.toLowerCase().includes(lowerQuery);
    const categoryMatch = connector.category.toLowerCase().includes(lowerQuery);
    return nameMatch || categoryMatch;
  });
}
