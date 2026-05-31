import { describe, it, expect } from 'vitest';
import { generateFormSchema } from './form-schema';
import { FormFieldDefinition } from './types';

describe('generateFormSchema', () => {
  it('generates schema with required text field', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'host',
        label: 'Host',
        type: 'text',
        required: true,
      },
    ];

    const schema = generateFormSchema(fields);
    const result = schema.safeParse({ host: 'localhost' });
    expect(result.success).toBe(true);

    const invalid = schema.safeParse({ host: '' });
    expect(invalid.success).toBe(false);
  });

  it('generates schema with optional text field', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'description',
        label: 'Description',
        type: 'textarea',
        required: false,
      },
    ];

    const schema = generateFormSchema(fields);
    const result = schema.safeParse({});
    expect(result.success).toBe(true);

    const withValue = schema.safeParse({ description: 'test' });
    expect(withValue.success).toBe(true);
  });

  it('generates schema with number field and min/max validation', () => {
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

  it('generates schema with string pattern validation', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'email',
        label: 'Email',
        type: 'text',
        required: true,
        validation: {
          pattern: '^[^@]+@[^@]+\\.[^@]+$',
          message: 'Invalid email format',
        },
      },
    ];

    const schema = generateFormSchema(fields);

    const valid = schema.safeParse({ email: 'user@example.com' });
    expect(valid.success).toBe(true);

    const invalid = schema.safeParse({ email: 'not-an-email' });
    expect(invalid.success).toBe(false);
  });

  it('generates schema with select field and enum options', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'sslMode',
        label: 'SSL Mode',
        type: 'select',
        required: true,
        options: [
          { label: 'Disable', value: 'disable' },
          { label: 'Require', value: 'require' },
          { label: 'Verify CA', value: 'verify-ca' },
        ],
      },
    ];

    const schema = generateFormSchema(fields);

    const valid = schema.safeParse({ sslMode: 'require' });
    expect(valid.success).toBe(true);

    const invalid = schema.safeParse({ sslMode: 'invalid-option' });
    expect(invalid.success).toBe(false);
  });

  it('generates schema with checkbox field defaulting to false', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'useSSL',
        label: 'Use SSL',
        type: 'checkbox',
        required: false,
      },
    ];

    const schema = generateFormSchema(fields);

    const withTrue = schema.safeParse({ useSSL: true });
    expect(withTrue.success).toBe(true);

    const withFalse = schema.safeParse({ useSSL: false });
    expect(withFalse.success).toBe(true);
  });

  it('generates schema with password field (same as text)', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'password',
        label: 'Password',
        type: 'password',
        required: true,
      },
    ];

    const schema = generateFormSchema(fields);

    const valid = schema.safeParse({ password: 'secret123' });
    expect(valid.success).toBe(true);

    const empty = schema.safeParse({ password: '' });
    expect(empty.success).toBe(false);
  });

  it('handles conditional fields with dependsOn', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'authMethod',
        label: 'Auth Method',
        type: 'select',
        required: true,
        options: [
          { label: 'Password', value: 'password' },
          { label: 'API Key', value: 'api-key' },
        ],
      },
      {
        id: 'apiKey',
        label: 'API Key',
        type: 'text',
        required: true,
        dependsOn: { field: 'authMethod', value: 'api-key' },
      },
    ];

    const schema = generateFormSchema(fields);

    // When dependency is met, the field is required
    const missingApiKey = schema.safeParse({
      authMethod: 'api-key',
    });
    expect(missingApiKey.success).toBe(false);

    // When dependency is met and field is provided, it passes
    const withApiKey = schema.safeParse({
      authMethod: 'api-key',
      apiKey: 'my-key-123',
    });
    expect(withApiKey.success).toBe(true);

    // When dependency is NOT met, the field is not required
    const passwordAuth = schema.safeParse({
      authMethod: 'password',
    });
    expect(passwordAuth.success).toBe(true);
  });

  it('handles file field type', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'certFile',
        label: 'Certificate File',
        type: 'file',
        required: true,
      },
    ];

    const schema = generateFormSchema(fields);

    const valid = schema.safeParse({ certFile: '/path/to/cert.pem' });
    expect(valid.success).toBe(true);

    const empty = schema.safeParse({ certFile: '' });
    expect(empty.success).toBe(false);
  });

  it('handles oauth-button field type (always optional)', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'oauthToken',
        label: 'Connect with OAuth',
        type: 'oauth-button',
        required: false,
      },
    ];

    const schema = generateFormSchema(fields);

    const withoutToken = schema.safeParse({});
    expect(withoutToken.success).toBe(true);

    const withToken = schema.safeParse({ oauthToken: 'token-abc' });
    expect(withToken.success).toBe(true);
  });

  it('handles multiple fields together (realistic connector)', () => {
    const fields: FormFieldDefinition[] = [
      {
        id: 'host',
        label: 'Host',
        type: 'text',
        required: true,
        placeholder: 'localhost',
      },
      {
        id: 'port',
        label: 'Port',
        type: 'number',
        required: true,
        defaultValue: 5432,
        validation: { min: 1, max: 65535 },
      },
      {
        id: 'database',
        label: 'Database',
        type: 'text',
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
        id: 'useSSL',
        label: 'Use SSL',
        type: 'checkbox',
        required: false,
      },
    ];

    const schema = generateFormSchema(fields);

    const valid = schema.safeParse({
      host: 'db.example.com',
      port: 5432,
      database: 'mydb',
      username: 'admin',
      password: 'secret',
      useSSL: true,
    });
    expect(valid.success).toBe(true);

    const missingRequired = schema.safeParse({
      host: 'db.example.com',
      port: 5432,
    });
    expect(missingRequired.success).toBe(false);
  });
});
