import { Workbook } from '../types';
import { generateId } from '../data-engine';

// ============================================================
// TYPES
// ============================================================

export interface PublishedWorkbook {
  id: string;
  workbookId: string;
  token: string;
  title: string;
  publishedAt: string;
  expiresAt: string | null;
  embedMode: EmbedMode;
  allowedSheetIds: string[];
}

export type EmbedMode = 'full' | 'single-sheet' | 'single-chart';

export interface PublishOptions {
  title?: string;
  expiresInDays?: number | null;
  embedMode?: EmbedMode;
  allowedSheetIds?: string[];
}

export interface EmbedConfig {
  token: string;
  baseUrl: string;
  width?: string;
  height?: string;
}

// ============================================================
// TOKEN GENERATION
// ============================================================

/**
 * Generates a cryptographically-inspired unique token for shareable URLs.
 * Uses a combination of random values to produce a URL-safe token.
 */
export function generateShareToken(): string {
  const segments = [
    Math.random().toString(36).substring(2, 10),
    Math.random().toString(36).substring(2, 10),
    Math.random().toString(36).substring(2, 10),
    Math.random().toString(36).substring(2, 10),
  ];
  return segments.join('');
}

// ============================================================
// PUBLISHING
// ============================================================

/**
 * Creates a published workbook entry with a unique shareable token.
 * The published entry is read-only and can be used for embedding.
 */
export function publishWorkbook(
  workbook: Workbook,
  options: PublishOptions = {}
): PublishedWorkbook {
  const {
    title = workbook.name,
    expiresInDays = null,
    embedMode = 'full',
    allowedSheetIds = workbook.sheets.map((s) => s.id),
  } = options;

  const now = new Date();
  const expiresAt = expiresInDays !== null
    ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return {
    id: generateId(),
    workbookId: workbook.id,
    token: generateShareToken(),
    title,
    publishedAt: now.toISOString(),
    expiresAt,
    embedMode,
    allowedSheetIds,
  };
}

// ============================================================
// URL GENERATION
// ============================================================

/**
 * Generates a shareable embed URL for a published workbook.
 */
export function generateEmbedUrl(
  baseUrl: string,
  token: string
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/embed/${token}`;
}

/**
 * Generates an HTML embed snippet (iframe) for embedding in external pages.
 */
export function generateEmbedSnippet(config: EmbedConfig): string {
  const { token, baseUrl, width = '100%', height = '600px' } = config;
  const url = generateEmbedUrl(baseUrl, token);
  return `<iframe src="${url}" width="${width}" height="${height}" frameborder="0" allowfullscreen></iframe>`;
}

// ============================================================
// VALIDATION
// ============================================================

/**
 * Checks whether a published workbook link is still valid (not expired).
 */
export function isPublishValid(published: PublishedWorkbook): boolean {
  if (published.expiresAt === null) {
    return true;
  }
  return new Date(published.expiresAt).getTime() > Date.now();
}

/**
 * Validates that a token matches the expected format (32 alphanumeric chars).
 */
export function isValidToken(token: string): boolean {
  return /^[a-z0-9]{32}$/.test(token);
}

// ============================================================
// MANAGEMENT
// ============================================================

/**
 * Revokes a published workbook by removing it from the list.
 * Returns the updated list without the revoked entry.
 */
export function revokePublishedWorkbook(
  publishedList: PublishedWorkbook[],
  publishId: string
): PublishedWorkbook[] {
  return publishedList.filter((p) => p.id !== publishId);
}

/**
 * Finds a published workbook by its share token.
 * Returns undefined if not found or expired.
 */
export function findPublishedByToken(
  publishedList: PublishedWorkbook[],
  token: string
): PublishedWorkbook | undefined {
  const published = publishedList.find((p) => p.token === token);
  if (!published) return undefined;
  if (!isPublishValid(published)) return undefined;
  return published;
}

/**
 * Gets all published entries for a specific workbook.
 */
export function getPublishedForWorkbook(
  publishedList: PublishedWorkbook[],
  workbookId: string
): PublishedWorkbook[] {
  return publishedList.filter((p) => p.workbookId === workbookId);
}
