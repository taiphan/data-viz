import { ConnectorDefinition } from '../types';

export const restApiConnectors: ConnectorDefinition[] = [
  {
    id: 'rest-api',
    name: 'REST API',
    category: 'rest-api',
    icon: 'globe',
    description: 'Connect to any REST API endpoint with configurable auth and pagination.',
    authMethods: ['none', 'api-key', 'oauth2', 'username-password'],
    fields: [
      { id: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://api.example.com/v1/data', required: true, validation: { pattern: '^https?://', message: 'Must be a valid URL' } },
      { id: 'method', label: 'HTTP Method', type: 'select', required: true, defaultValue: 'GET', options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }] },
      { id: 'authType', label: 'Authentication', type: 'select', required: true, defaultValue: 'none', options: [{ label: 'None', value: 'none' }, { label: 'API Key', value: 'api-key' }, { label: 'Bearer Token', value: 'bearer' }, { label: 'Basic Auth', value: 'basic' }, { label: 'OAuth 2.0', value: 'oauth2' }] },
      { id: 'apiKey', label: 'API Key', type: 'password', required: false, dependsOn: { field: 'authType', value: 'api-key' } },
      { id: 'apiKeyHeader', label: 'API Key Header Name', type: 'text', required: false, defaultValue: 'X-API-Key', dependsOn: { field: 'authType', value: 'api-key' } },
      { id: 'bearerToken', label: 'Bearer Token', type: 'password', required: false, dependsOn: { field: 'authType', value: 'bearer' } },
      { id: 'basicUsername', label: 'Username', type: 'text', required: false, dependsOn: { field: 'authType', value: 'basic' } },
      { id: 'basicPassword', label: 'Password', type: 'password', required: false, dependsOn: { field: 'authType', value: 'basic' } },
      { id: 'headers', label: 'Custom Headers (JSON)', type: 'textarea', required: false, placeholder: '{"Content-Type": "application/json"}' },
      { id: 'responseDataPath', label: 'Data Path (JSONPath)', type: 'text', required: false, placeholder: 'data.results' },
      { id: 'paginationType', label: 'Pagination', type: 'select', required: false, defaultValue: 'none', options: [{ label: 'None', value: 'none' }, { label: 'Offset', value: 'offset' }, { label: 'Cursor', value: 'cursor' }, { label: 'Next Link', value: 'next-link' }] },
      { id: 'pageSize', label: 'Page Size', type: 'number', required: false, defaultValue: 100, dependsOn: { field: 'paginationType', value: 'offset' } },
    ],
    supportsSchemaDiscovery: false,
    supportsCustomQuery: false,
    proxyRequired: false,
  },
];
