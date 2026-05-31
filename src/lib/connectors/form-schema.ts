import { z, ZodTypeAny } from 'zod';
import { FormFieldDefinition } from './types';

/**
 * Generates a Zod validation schema from connector field definitions.
 * Handles required/optional fields, type-specific validation (min/max for numbers,
 * pattern for strings), and conditional fields (dependsOn).
 */
export function generateFormSchema(
  fields: FormFieldDefinition[],
) {
  const shape: Record<string, ZodTypeAny> = {};

  for (const field of fields) {
    let fieldSchema = buildFieldSchema(field);

    if (!field.required || field.dependsOn) {
      fieldSchema = fieldSchema.optional();
    }

    shape[field.id] = fieldSchema;
  }

  const baseSchema = z.object(shape);

  const conditionalFields = fields.filter((f) => f.dependsOn);
  if (conditionalFields.length === 0) {
    return baseSchema;
  }

  return baseSchema.superRefine((data, ctx) => {
    for (const field of conditionalFields) {
      if (!field.dependsOn || !field.required) continue;

      const dependencyMet = isDependencyMet(
        data as Record<string, unknown>,
        field.dependsOn,
      );

      if (dependencyMet) {
        const value = (data as Record<string, unknown>)[field.id];
        if (value === undefined || value === null || value === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field.id],
            message: field.validation?.message
              || `${field.label} is required`,
          });
        }
      }
    }
  });
}

function isDependencyMet(
  data: Record<string, unknown>,
  dependsOn: { field: string; value: string | boolean },
): boolean {
  const actualValue = data[dependsOn.field];
  return actualValue === dependsOn.value;
}

function buildFieldSchema(field: FormFieldDefinition): ZodTypeAny {
  const { type, validation, required } = field;

  switch (type) {
    case 'number':
      return buildNumberSchema(validation, required);
    case 'checkbox':
      return buildCheckboxSchema();
    case 'select':
      return buildSelectSchema(field);
    case 'file':
      return buildFileSchema(required);
    case 'oauth-button':
      return buildOAuthSchema();
    case 'text':
    case 'password':
    case 'textarea':
    default:
      return buildStringSchema(validation, required);
  }
}

function buildStringSchema(
  validation: FormFieldDefinition['validation'],
  required: boolean,
): ZodTypeAny {
  let schema = z.string();

  if (required) {
    schema = schema.min(1, { message: 'This field is required' });
  }

  if (validation?.pattern) {
    schema = schema.regex(
      new RegExp(validation.pattern),
      { message: validation.message || 'Invalid format' },
    );
  }

  if (validation?.min !== undefined) {
    schema = schema.min(validation.min, {
      message: validation.message || `Minimum length is ${validation.min}`,
    });
  }

  if (validation?.max !== undefined) {
    schema = schema.max(validation.max, {
      message: validation.message || `Maximum length is ${validation.max}`,
    });
  }

  return schema;
}

function buildNumberSchema(
  validation: FormFieldDefinition['validation'],
  required: boolean,
): ZodTypeAny {
  let schema = z.coerce.number();

  if (validation?.min !== undefined) {
    schema = schema.min(validation.min, {
      message: validation.message || `Minimum value is ${validation.min}`,
    });
  }

  if (validation?.max !== undefined) {
    schema = schema.max(validation.max, {
      message: validation.message || `Maximum value is ${validation.max}`,
    });
  }

  if (!required) {
    return schema.optional() as unknown as ZodTypeAny;
  }

  return schema;
}

function buildCheckboxSchema(): ZodTypeAny {
  return z.boolean().default(false);
}

function buildSelectSchema(field: FormFieldDefinition): ZodTypeAny {
  const values = field.options?.map((o) => o.value) ?? [];

  if (values.length > 0) {
    const schema = z.enum(values as [string, ...string[]]);
    if (!field.required) {
      return schema.optional() as unknown as ZodTypeAny;
    }
    return schema;
  }

  const schema = z.string();
  if (field.required) {
    return schema.min(1, { message: 'Please select an option' });
  }
  return schema;
}

function buildFileSchema(required: boolean): ZodTypeAny {
  if (required) {
    return z.string().min(1, { message: 'File is required' });
  }
  return z.string().optional() as unknown as ZodTypeAny;
}

function buildOAuthSchema(): ZodTypeAny {
  return z.string().optional() as unknown as ZodTypeAny;
}
