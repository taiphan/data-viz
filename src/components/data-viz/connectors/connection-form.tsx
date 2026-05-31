'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  ConnectorDefinition,
  FormFieldDefinition,
  ConnectionTestResult,
} from '@/lib/connectors/types';
import { generateFormSchema } from '@/lib/connectors/form-schema';
import { connectorEngine } from '@/lib/connectors/connector-engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface ConnectionFormProps {
  connector: ConnectorDefinition;
  initialValues?: Record<string, unknown>;
  onConnect?: (connectionId: string) => void;
  onCancel?: () => void;
}

interface FieldError {
  path: string;
  message: string;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'failure';

// ============================================================
// CONNECTION FORM COMPONENT
// ============================================================

export function ConnectionForm({
  connector,
  initialValues,
  onConnect,
  onCancel,
}: ConnectionFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(
    () => buildInitialValues(connector.fields, initialValues),
  );
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(
    new Set(),
  );
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(
    null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const schema = useMemo(
    () => generateFormSchema(connector.fields),
    [connector.fields],
  );

  const visibleFields = useMemo(
    () => getVisibleFields(connector.fields, values),
    [connector.fields, values],
  );

  // ============================================================
  // FIELD VALUE HANDLERS
  // ============================================================

  const updateValue = useCallback((fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => prev.filter((e) => e.path !== fieldId));
    setTestStatus('idle');
    setTestResult(null);
    setConnectError(null);
  }, []);

  const togglePasswordVisibility = useCallback((fieldId: string) => {
    setRevealedPasswords((prev) => {
      const next = new Set(prev);
      if (next.has(fieldId)) {
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  }, []);

  // ============================================================
  // VALIDATION
  // ============================================================

  const validate = useCallback((): boolean => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors([]);
      return true;
    }

    const fieldErrors: FieldError[] = result.error.issues.map((issue) => ({
      path: String(issue.path[0] ?? ''),
      message: issue.message,
    }));
    setErrors(fieldErrors);
    return false;
  }, [schema, values]);

  // ============================================================
  // TEST CONNECTION
  // ============================================================

  const handleTestConnection = useCallback(async () => {
    if (!validate()) return;

    setTestStatus('testing');
    setTestResult(null);
    setConnectError(null);

    try {
      const result = await connectorEngine.testConnection(
        connector.id,
        values,
      );
      setTestResult(result);
      setTestStatus(result.success ? 'success' : 'failure');
    } catch {
      setTestStatus('failure');
      setTestResult({
        success: false,
        message: 'An unexpected error occurred while testing the connection.',
        latencyMs: 0,
      });
    }
  }, [connector.id, values, validate]);

  // ============================================================
  // CONNECT
  // ============================================================

  const handleConnect = useCallback(async () => {
    if (!validate()) return;

    setIsConnecting(true);
    setConnectError(null);

    try {
      const session = await connectorEngine.connect(connector.id, values);
      onConnect?.(session.connectionId);
    } catch (err) {
      setConnectError(
        err instanceof Error ? err.message : 'Failed to establish connection.',
      );
    } finally {
      setIsConnecting(false);
    }
  }, [connector.id, values, validate, onConnect]);

  // ============================================================
  // RENDER
  // ============================================================

  const isLoading = testStatus === 'testing' || isConnecting;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {connector.icon}
        </span>
        <div>
          <h2 className="text-lg font-semibold">{connector.name}</h2>
          <p className="text-sm text-muted-foreground">
            {connector.description}
          </p>
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {visibleFields.map((field) => (
          <FormField
            key={field.id}
            field={field}
            value={values[field.id]}
            error={errors.find((e) => e.path === field.id)?.message}
            isPasswordRevealed={revealedPasswords.has(field.id)}
            onValueChange={(val) => updateValue(field.id, val)}
            onTogglePassword={() => togglePasswordVisibility(field.id)}
            disabled={isLoading}
          />
        ))}
      </div>

      {/* Test Connection Result */}
      {testResult && (
        <TestResultBanner result={testResult} status={testStatus} />
      )}

      {/* Connect Error */}
      {connectError && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3">
          <AlertCircle
            className="h-4 w-4 text-destructive shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <span className="text-sm text-destructive">{connectError}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="outline"
          onClick={handleTestConnection}
          disabled={isLoading}
          aria-label="Test connection"
        >
          {testStatus === 'testing' && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {testStatus === 'success' && (
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
          )}
          {testStatus === 'failure' && (
            <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          )}
          Test Connection
        </Button>

        <Button
          onClick={handleConnect}
          disabled={isLoading}
          aria-label="Connect to data source"
        >
          {isConnecting && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          Connect
        </Button>

        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}


// ============================================================
// FORM FIELD COMPONENT
// ============================================================

interface FormFieldProps {
  field: FormFieldDefinition;
  value: unknown;
  error?: string;
  isPasswordRevealed: boolean;
  onValueChange: (value: unknown) => void;
  onTogglePassword: () => void;
  disabled: boolean;
}

function FormField({
  field,
  value,
  error,
  isPasswordRevealed,
  onValueChange,
  onTogglePassword,
  disabled,
}: FormFieldProps) {
  const fieldId = `field-${field.id}`;

  return (
    <div className="space-y-1.5">
      {field.type !== 'checkbox' && field.type !== 'oauth-button' && (
        <Label htmlFor={fieldId}>
          {field.label}
          {field.required && (
            <span className="text-destructive ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </Label>
      )}

      {field.type === 'text' && (
        <Input
          id={fieldId}
          type="text"
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
        />
      )}

      {field.type === 'password' && (
        <div className="relative">
          <Input
            id={fieldId}
            type={isPasswordRevealed ? 'text' : 'password'}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            onChange={(e) => onValueChange(e.target.value)}
            disabled={disabled}
            className="pr-9"
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground',
              'hover:text-foreground transition-colors cursor-pointer',
            )}
            aria-label={isPasswordRevealed ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {isPasswordRevealed ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      )}

      {field.type === 'number' && (
        <Input
          id={fieldId}
          type="number"
          placeholder={field.placeholder}
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={(e) => {
            const num = e.target.value === '' ? undefined : Number(e.target.value);
            onValueChange(num);
          }}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
        />
      )}

      {field.type === 'select' && (
        <Select
          value={String(value ?? '')}
          onValueChange={(val) => onValueChange(val)}
          disabled={disabled}
        >
          <SelectTrigger
            id={fieldId}
            className="w-full"
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
          >
            <SelectValue placeholder={field.placeholder || 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === 'checkbox' && (
        <div className="flex items-center gap-2">
          <Switch
            id={fieldId}
            checked={Boolean(value)}
            onCheckedChange={(checked) => onValueChange(checked)}
            disabled={disabled}
            aria-describedby={error ? `${fieldId}-error` : undefined}
          />
          <Label htmlFor={fieldId}>{field.label}</Label>
        </div>
      )}

      {field.type === 'textarea' && (
        <Textarea
          id={fieldId}
          placeholder={field.placeholder}
          value={String(value ?? '')}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${fieldId}-error` : undefined}
        />
      )}

      {field.type === 'file' && (
        <div className="relative">
          <Input
            id={fieldId}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = () => onValueChange(reader.result as string);
                reader.readAsDataURL(file);
              }
            }}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={error ? `${fieldId}-error` : undefined}
          />
        </div>
      )}

      {field.type === 'oauth-button' && (
        <Button
          variant="outline"
          onClick={() => onValueChange('oauth-initiated')}
          disabled={disabled}
          className="w-full gap-2"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {field.label || 'Sign in with OAuth'}
        </Button>
      )}

      {error && (
        <p
          id={`${fieldId}-error`}
          className="text-xs text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================
// TEST RESULT BANNER
// ============================================================

interface TestResultBannerProps {
  result: ConnectionTestResult;
  status: TestStatus;
}

function TestResultBanner({ result, status }: TestResultBannerProps) {
  if (status === 'idle' || status === 'testing') return null;

  const isSuccess = result.success;

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md p-3',
        isSuccess ? 'bg-green-500/10' : 'bg-destructive/10',
      )}
      role="status"
      aria-live="polite"
    >
      {isSuccess ? (
        <CheckCircle2
          className="h-4 w-4 text-green-600 shrink-0 mt-0.5"
          aria-hidden="true"
        />
      ) : (
        <XCircle
          className="h-4 w-4 text-destructive shrink-0 mt-0.5"
          aria-hidden="true"
        />
      )}
      <div className="space-y-0.5">
        <p
          className={cn(
            'text-sm font-medium',
            isSuccess ? 'text-green-700 dark:text-green-400' : 'text-destructive',
          )}
        >
          {isSuccess ? 'Connection successful' : 'Connection failed'}
        </p>
        <p className="text-xs text-muted-foreground">{result.message}</p>
        {isSuccess && result.latencyMs > 0 && (
          <p className="text-xs text-muted-foreground">
            Latency: {result.latencyMs}ms
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// HELPERS
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
