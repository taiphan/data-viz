// ============================================================
// ERROR FORMATTING UTILITY
// ============================================================

/**
 * Error categories for connection-related failures.
 */
export type ErrorCategory =
  | 'network'
  | 'auth'
  | 'timeout'
  | 'query'
  | 'parse'
  | 'proxy-unavailable';

/**
 * Structured connection error with category, user-safe message,
 * connector type, and timestamp.
 */
export interface FormattedConnectionError {
  category: ErrorCategory;
  message: string;
  connectorType: string;
  timestamp: string;
}

/**
 * Credential field names that must NEVER appear in error messages.
 */
const CREDENTIAL_FIELDS: readonly string[] = [
  'password',
  'token',
  'secret',
  'apiKey',
  'accessKey',
  'privateKey',
];

/**
 * Regex patterns that match sensitive data in arbitrary strings.
 * Used by sanitizeMessage() to redact credentials without needing
 * the original parameter values.
 */
const SENSITIVE_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Connection strings with embedded credentials
  { pattern: /(?:mongodb|postgres|mysql|mssql|redis):\/\/[^\s"']+/gi, label: '[REDACTED_CONNECTION_STRING]' },
  // Bearer tokens
  { pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, label: 'Bearer [REDACTED]' },
  // API keys (common formats)
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-._~+/]{8,}['"]?/gi, label: 'api_key=[REDACTED]' },
  // AWS access keys
  { pattern: /AKIA[0-9A-Z]{16}/g, label: '[REDACTED_AWS_KEY]' },
  // Generic secret/password assignments
  { pattern: /(?:password|passwd|pwd|secret|token|auth_token|access_token|refresh_token)\s*[:=]\s*['"]?[^\s'"]{4,}['"]?/gi, label: '[REDACTED]' },
  // Private keys (PEM format)
  { pattern: /-----BEGIN\s+(?:RSA\s+)?(?:PRIVATE|ENCRYPTED)\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?(?:PRIVATE|ENCRYPTED)\s+KEY-----/g, label: '[REDACTED_PRIVATE_KEY]' },
  // JWT tokens (three base64 segments separated by dots)
  { pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, label: '[REDACTED_TOKEN]' },
  // File paths (Unix and Windows)
  { pattern: /(?:\/(?:usr|home|var|etc|tmp|opt|Users|root)\/[^\s'"]+)/g, label: '[REDACTED_PATH]' },
  { pattern: /[A-Z]:\\(?:Users|Windows|Program Files)[^\s'"]+/gi, label: '[REDACTED_PATH]' },
  // Stack traces
  { pattern: /\s+at\s+.+\(.+:\d+:\d+\)/g, label: '' },
  { pattern: /\s+at\s+.+\s+\(.+\)/g, label: '' },
];

/**
 * Mapping of common system error codes to user-friendly messages.
 */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  ECONNREFUSED: 'Connection refused. The server may be down or the port is incorrect.',
  ETIMEDOUT: 'Connection timed out. The server did not respond in time.',
  ESOCKETTIMEDOUT: 'Connection timed out. The server did not respond in time.',
  ECONNRESET: 'Connection was reset. The server closed the connection unexpectedly.',
  ENOTFOUND: 'Host not found. Please verify the hostname or address.',
  EHOSTUNREACH: 'Host is unreachable. Check your network connectivity.',
  ENETUNREACH: 'Network is unreachable. Check your network connectivity.',
  ECONNABORTED: 'Connection was aborted.',
  EPIPE: 'Connection was broken. The server closed the connection.',
  EAI_AGAIN: 'DNS lookup timed out. Please try again.',
  CERT_HAS_EXPIRED: 'SSL certificate has expired. Contact the server administrator.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'SSL certificate is self-signed and not trusted.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'SSL certificate could not be verified.',
};

/**
 * User-friendly messages for each error category.
 */
const ERROR_MESSAGES: Record<ErrorCategory, string> = {
  network: 'Unable to reach the server. Check your connection.',
  auth: 'Authentication failed. Please check your credentials.',
  timeout: 'Connection timed out. Verify host and port are correct.',
  query: 'Query execution failed. Please review your query.',
  parse: 'Unable to parse the response. Check format and encoding.',
  'proxy-unavailable': 'Backend service is unavailable. Please try again later.',
};

/**
 * Patterns used to detect error categories from error messages.
 */
const CATEGORY_PATTERNS: { category: ErrorCategory; patterns: RegExp[] }[] = [
  {
    category: 'auth',
    patterns: [
      /auth/i,
      /unauthorized/i,
      /forbidden/i,
      /credentials/i,
      /permission denied/i,
      /access denied/i,
      /login failed/i,
      /401/,
      /403/,
    ],
  },
  {
    category: 'timeout',
    patterns: [
      /timeout/i,
      /timed out/i,
      /ETIMEDOUT/,
      /ESOCKETTIMEDOUT/,
      /deadline exceeded/i,
    ],
  },
  {
    category: 'proxy-unavailable',
    patterns: [
      /proxy/i,
      /service unavailable/i,
      /503/,
      /502/,
      /bad gateway/i,
    ],
  },
  {
    category: 'network',
    patterns: [
      /network/i,
      /ECONNREFUSED/,
      /ECONNRESET/,
      /ENOTFOUND/,
      /EHOSTUNREACH/,
      /ENETUNREACH/,
      /socket hang up/i,
      /fetch failed/i,
      /dns/i,
    ],
  },
  {
    category: 'parse',
    patterns: [
      /parse/i,
      /JSON/i,
      /unexpected token/i,
      /malformed/i,
      /invalid format/i,
    ],
  },
  {
    category: 'query',
    patterns: [
      /query/i,
      /syntax error/i,
      /relation.*does not exist/i,
      /column.*does not exist/i,
      /table.*not found/i,
    ],
  },
];

/**
 * Detects the error category from an error object or message string.
 */
export function detectErrorCategory(error: unknown): ErrorCategory {
  const message = extractErrorMessage(error);

  for (const { category, patterns } of CATEGORY_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return category;
      }
    }
  }

  return 'network';
}

/**
 * Extracts a string message from an unknown error value.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

/**
 * Extracts an error code (e.g., ECONNREFUSED) from an error object.
 */
function extractErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  // Try to find error code in the message
  const message = extractErrorMessage(error);
  for (const code of Object.keys(ERROR_CODE_MESSAGES)) {
    if (message.includes(code)) {
      return code;
    }
  }
  return null;
}

/**
 * Sanitizes an arbitrary message string by redacting patterns that look
 * like credentials, tokens, keys, connection strings, file paths, or
 * stack traces. This function does NOT require the original parameter
 * values — it uses regex pattern matching to detect sensitive data.
 *
 * @param message - The raw message to sanitize
 * @returns A sanitized message with sensitive data replaced by [REDACTED] markers
 */
export function sanitizeMessage(message: string): string {
  let sanitized = message;

  for (const { pattern, label } of SENSITIVE_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, label);
  }

  // Remove any remaining stack trace lines
  sanitized = sanitized
    .split('\n')
    .filter((line) => !line.trim().startsWith('at '))
    .join('\n')
    .trim();

  return sanitized;
}

/**
 * Strips credential values from a message string to prevent leakage.
 * Checks all values in params that correspond to credential field names
 * and removes them from the output.
 */
function stripCredentialValues(
  message: string,
  params: Record<string, unknown>,
): string {
  let sanitized = message;

  for (const field of CREDENTIAL_FIELDS) {
    const value = params[field];
    if (value !== undefined && value !== null && value !== '') {
      const valueStr = String(value);
      // Replace all occurrences of the credential value with [REDACTED]
      while (sanitized.includes(valueStr)) {
        sanitized = sanitized.replace(valueStr, '[REDACTED]');
      }
    }
  }

  // Also check nested credential fields (e.g., params.credentials.password)
  for (const key of Object.keys(params)) {
    const nested = params[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      for (const field of CREDENTIAL_FIELDS) {
        const value = (nested as Record<string, unknown>)[field];
        if (value !== undefined && value !== null && value !== '') {
          const valueStr = String(value);
          while (sanitized.includes(valueStr)) {
            sanitized = sanitized.replace(valueStr, '[REDACTED]');
          }
        }
      }
    }
  }

  return sanitized;
}

/**
 * Formats a connection error into a user-friendly string message.
 * This function:
 * - Maps common error codes (ECONNREFUSED, ETIMEDOUT, etc.) to friendly messages
 * - Never exposes credentials, passwords, tokens, or connection strings
 * - Never exposes internal paths or stack traces
 * - Provides a generic fallback for unknown errors
 * - Optionally includes the connector ID for context
 *
 * @param error - The raw error (Error object, string, or unknown)
 * @param connectorId - Optional connector identifier for context
 * @returns A user-friendly, sanitized error message string
 */
export function formatConnectionError(
  error: unknown,
  connectorId?: string,
): string {
  // Try to get a specific error code message first
  const errorCode = extractErrorCode(error);
  if (errorCode && ERROR_CODE_MESSAGES[errorCode]) {
    const codeMessage = ERROR_CODE_MESSAGES[errorCode];
    return connectorId
      ? `[${connectorId}] ${codeMessage}`
      : codeMessage;
  }

  // Fall back to category-based messages
  const category = detectErrorCategory(error);
  const friendlyMessage = ERROR_MESSAGES[category];

  return connectorId
    ? `[${connectorId}] ${friendlyMessage}`
    : friendlyMessage;
}

/**
 * Formats a connection error into a user-safe structured error object.
 * This is the structured variant that returns a FormattedConnectionError.
 *
 * The formatted message:
 * - Contains the connector type for context
 * - Contains a timestamp for diagnostic correlation
 * - NEVER contains credential values (password, token, secret, apiKey, accessKey, privateKey)
 *
 * @param error - The raw error (Error object, string, or unknown)
 * @param connectorType - The connector category or identifier
 * @param params - Connection parameters (may contain credentials to filter)
 * @returns A structured error with category, safe message, connector type, and timestamp
 */
export function formatConnectionErrorStructured(
  error: unknown,
  connectorType: string,
  params: Record<string, unknown> = {},
): FormattedConnectionError {
  const category = detectErrorCategory(error);
  const timestamp = new Date().toISOString();
  const baseMessage = ERROR_MESSAGES[category];

  // Build the user-safe message with connector type and timestamp
  const rawMessage = `[${connectorType}] ${baseMessage} (${timestamp})`;

  // Ensure no credential values leaked into the message
  const message = stripCredentialValues(rawMessage, params);

  return {
    category,
    message,
    connectorType,
    timestamp,
  };
}
