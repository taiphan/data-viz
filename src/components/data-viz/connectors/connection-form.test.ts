import { describe, it, expect } from 'vitest';
import { generateFormSchema } from '@/lib/connectors/form-schema';
import type {
  ConnectorDefinition,
  FormFieldDefinition,
} from '@/lib/connectors/types';

/**
 * Tests for ConnectionForm logic: field visibility, validation,
 * initial values, and Zod schema integration.
 *
 * Validates: Requirements 2.1-2.6, 3.1, 3.4
 */

// ============================================================
// TEST FIXTURES
// ============================================================

const mockFields: FormFieldDefinition[] = [
  {
    id: 'host',
    label: 'Host',
    type: 'text',
    placeholder: 'localhost',
    required: true,
  },
  {
    id: 'port',
    label: 'Port',
    type: 'number',
    placeholder: '5432',
    required: true,
    defaultValue: 5432,
  },
  {
    id: 'database',
    label: 'Database',
    type: 'text',
    placeholder: 'mydb',
    required: true,
  },
  {
    id: 'username',
    label: 'Username',
    type: 'text',
    required: true,
  },
  {
    id: 'password',
    label: 'Password',
    type: 'password',
    required: true,
  },
  {
    id: 'ssl',
    label: 'Use SSL',
    type: 'checkbox',
    required: false,
    defaultValue: false,
  },
  {
    id: 'sslCert',
    label: 'SSL Certificate',
    type: 'file',
    required: true,
    dependsOn: { field: 'ssl', value: true },
  },
  {
    id: 'authMethod',
    label: 'Auth Method',
    type: 'select',
    required: true,
    options: [
      { label: 'Password', value: 'password' },
      { label: 'OAuth', value: 'oauth' },
    ],
  },
  {
    id: 'oauthToken',
    label: 'Sign in with OAuth',
    type: 'oauth-button',
    required: false,
    dependsOn: { field: 'authMethod', value: 'oauth' },
  },
  {
    id: 'notes',
    label: 'Notes',
    type: 'textarea',
    required: false,
  },
];

const mockConnector: ConnectorDefinition = {
  id: 'postgresql',
  name: 'PostgreSQL',
  category: 'database',
  icon: '🐘',
  description: 'Connect to PostgreSQL databases',
  authMethods: ['username-password', 'oauth2'],
  fields: mockFields,
  defaultPort: 5432,
  supportsSchemaDiscovery: true,
  supportsCustomQuery: true,
  proxyRequired: true,
};

// ============================================================
// HELPER FUNCTIONS (replicated from component for testing)
// ============================================================

function buildInitialValues(
  fields: FormFieldDefinition[],
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    if (overrides && field.id in overrides) {
      values[field.id] = overrides[field.id];
    } else if (field.defaultValue !== undefined) {
      values[field.id] = field.defaultValue;
    } else if (field.type === 'checkbox') {
      values[field.id] = false;
    } else if (field.type === 'number') {
      values[field.id] = undefined;
    } else {
      values[field.id] = '';
    }
  }

  return values;
}

function getVisibleFields(
  fields: FormFieldDefinition[],
  values: Record<string, unknown>,
): FormFieldDefinition[] {
  return fields.filter((field) => {
    if (!field.dependsOn) return true;
    const dependencyValue = values[field.dependsOn.field];
    return dependencyValue === field.dependsOn.value;
  });
}

// ============================================================
// TESTS
// ============================================================

describe('ConnectionForm logic', () => {
  describe('buildInitialValues', () => {
    it('uses default values from field definitions', () => {
      const values = buildInitialValues(mockFields);
      expect(values.port).toBe(5432);
      expect(values.ssl).toBe(false);
    });

    it('uses empty string for text fields without defaults', () => {
      const values = buildInitialValues(mockFields);
      expect(values.host).toBe('');
      expect(values.database).toBe('');
      expect(values.username).toBe('');
      expect(values.password).toBe('');
    });

    it('uses undefined for number fields without defaults', () => {
      const fields: FormFieldDefinition[] = [
        { id: 'timeout', label: 'Timeout', type: 'number', required: false },
      ];
      const values = buildInitialValues(fields);
      expect(values.timeout).toBeUndefined();
    });

    it('applies overrides over defaults', () => {
      const overrides = { host: 'db.example.com', port: 3306 };
      const values = buildInitialValues(mockFields, overrides);
      expect(values.host).toBe('db.example.com');
      expect(values.port).toBe(3306);
    });

    it('initializes checkbox fields to false when no default', () => {
      const fields: FormFieldDefinition[] = [
        { id: 'flag', label: 'Flag', type: 'checkbox', required: false },
      ];
      const values = buildInitialValues(fields);
      expect(values.flag).toBe(false);
    });
  });

  describe('getVisibleFields (conditional fields)', () => {
    it('shows fields without dependsOn', () => {
      const values = buildInitialValues(mockFields);
      const visible = getVisibleFields(mockFields, values);
      const visibleIds = visible.map((f) => f.id);

      expect(visibleIds).toContain('host');
      expect(visibleIds).toContain('port');
      expect(visibleIds).toContain('database');
    });

    it('hides conditional fields when dependency is not met', () => {
      const values = buildInitialValues(mockFields);
      // ssl is false by default, so sslCert should be hidden
      const visible = getVisibleFields(mockFields, values);
      const visibleIds = visible.map((f) => f.id);

      expect(visibleIds).not.toContain('sslCert');
    });

    it('shows conditional fields when dependency is met', () => {
      const values = { ...buildInitialValues(mockFields), ssl: true };
      const visible = getVisibleFields(mockFields, values);
      const visibleIds = visible.map((f) => f.id);

      expect(visibleIds).toContain('sslCert');
    });

    it('shows oauth button when authMethod is oauth', () => {
      const values = { ...buildInitialValues(mockFields), authMethod: 'oauth' };
      const visible = getVisibleFields(mockFields, values);
      const visibleIds = visible.map((f) => f.id);

      expect(visibleIds).toContain('oauthToken');
    });

    it('hides oauth button when authMethod is password', () => {
      const values = {
        ...buildInitialValues(mockFields),
        authMethod: 'password',
      };
      const visible = getVisibleFields(mockFields, values);
      const visibleIds = visible.map((f) => f.id);

      expect(visibleIds).not.toContain('oauthToken');
    });
  });

  describe('Zod validation via generateFormSchema', () => {
    it('rejects missing required fields', () => {
      const schema = generateFormSchema(mockConnector.fields);
      const result = schema.safeParse({
        host: '',
        port: 5432,
        database: '',
        username: '',
        password: '',
        ssl: false,
        authMethod: 'password',
        notes: '',
      });

      expect(result.success).toBe(false);
    });

    it('accepts valid complete input', () => {
      const schema = generateFormSchema(mockConnector.fields);
      const result = schema.safeParse({
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'admin',
        password: 'secret123',
        ssl: false,
        authMethod: 'password',
        notes: '',
      });

      expect(result.success).toBe(true);
    });

    it('validates number fields with coercion', () => {
      const fields: FormFieldDefinition[] = [
        {
          id: 'port',
          label: 'Port',
          type: 'number',
          required: true,
          validation: { min: 1, max: 65535 },
        },
      ];
      const schema = generateFormSchema(fields);

      const valid = schema.safeParse({ port: 5432 });
      expect(valid.success).toBe(true);

      const tooLow = schema.safeParse({ port: 0 });
      expect(tooLow.success).toBe(false);

      const tooHigh = schema.safeParse({ port: 70000 });
      expect(tooHigh.success).toBe(false);
    });

    it('validates string pattern constraints', () => {
      const fields: FormFieldDefinition[] = [
        {
          id: 'host',
          label: 'Host',
          type: 'text',
          required: true,
          validation: {
            pattern: '^[a-zA-Z0-9.-]+$',
            message: 'Invalid hostname',
          },
        },
      ];
      const schema = generateFormSchema(fields);

      const valid = schema.safeParse({ host: 'db.example.com' });
      expect(valid.success).toBe(true);

      const invalid = schema.safeParse({ host: 'db host with spaces' });
      expect(invalid.success).toBe(false);
    });

    it('makes conditional required fields optional in base schema', () => {
      const schema = generateFormSchema(mockConnector.fields);
      // sslCert is required but has dependsOn, so it's optional in base schema
      const result = schema.safeParse({
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'admin',
        password: 'secret123',
        ssl: false,
        authMethod: 'password',
        notes: '',
      });

      expect(result.success).toBe(true);
    });

    it('enforces conditional required fields when dependency is met', () => {
      const schema = generateFormSchema(mockConnector.fields);
      // ssl is true, so sslCert should be required
      const result = schema.safeParse({
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'admin',
        password: 'secret123',
        ssl: true,
        sslCert: '',
        authMethod: 'password',
        notes: '',
      });

      expect(result.success).toBe(false);
    });

    it('passes when conditional required field is provided', () => {
      const schema = generateFormSchema(mockConnector.fields);
      const result = schema.safeParse({
        host: 'localhost',
        port: 5432,
        database: 'mydb',
        username: 'admin',
        password: 'secret123',
        ssl: true,
        sslCert: 'data:application/x-pem-file;base64,abc123',
        authMethod: 'password',
        notes: '',
      });

      expect(result.success).toBe(true);
    });

    it('validates select fields against allowed values', () => {
      const fields: FormFieldDefinition[] = [
        {
          id: 'authMethod',
          label: 'Auth',
          type: 'select',
          required: true,
          options: [
            { label: 'Password', value: 'password' },
            { label: 'OAuth', value: 'oauth' },
          ],
        },
      ];
      const schema = generateFormSchema(fields);

      const valid = schema.safeParse({ authMethod: 'password' });
      expect(valid.success).toBe(true);

      const invalid = schema.safeParse({ authMethod: 'invalid-method' });
      expect(invalid.success).toBe(false);
    });
  });
});
