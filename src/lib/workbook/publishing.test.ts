import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateShareToken,
  publishWorkbook,
  generateEmbedUrl,
  generateEmbedSnippet,
  isPublishValid,
  isValidToken,
  revokePublishedWorkbook,
  findPublishedByToken,
  getPublishedForWorkbook,
  PublishedWorkbook,
} from './publishing';
import { Workbook } from '../types';

function createTestWorkbook(overrides: Partial<Workbook> = {}): Workbook {
  return {
    id: 'wb-1',
    name: 'Test Workbook',
    dataSources: [],
    activeDataSourceId: null,
    joins: [],
    transforms: [],
    sheets: [
      {
        id: 'sheet-1',
        title: 'Sheet 1',
        charts: [],
        globalFilters: [],
        layout: 'auto',
      },
      {
        id: 'sheet-2',
        title: 'Sheet 2',
        charts: [],
        globalFilters: [],
        layout: 'auto',
      },
    ],
    activeSheetId: 'sheet-1',
    activeChartId: null,
    parameters: [],
    parameterActions: [],
    groups: [],
    bins: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createTestPublished(
  overrides: Partial<PublishedWorkbook> = {}
): PublishedWorkbook {
  return {
    id: 'pub-1',
    workbookId: 'wb-1',
    token: 'abcdefgh12345678abcdefgh12345678',
    title: 'Published Dashboard',
    publishedAt: '2024-06-01T00:00:00.000Z',
    expiresAt: null,
    embedMode: 'full',
    allowedSheetIds: ['sheet-1', 'sheet-2'],
    ...overrides,
  };
}

describe('generateShareToken', () => {
  it('generates a 32-character alphanumeric token', () => {
    const token = generateShareToken();
    expect(token).toHaveLength(32);
    expect(/^[a-z0-9]+$/.test(token)).toBe(true);
  });

  it('generates unique tokens on each call', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateShareToken()));
    expect(tokens.size).toBe(100);
  });
});

describe('publishWorkbook', () => {
  it('creates a published entry with default options', () => {
    const workbook = createTestWorkbook();
    const published = publishWorkbook(workbook);

    expect(published.workbookId).toBe('wb-1');
    expect(published.title).toBe('Test Workbook');
    expect(published.embedMode).toBe('full');
    expect(published.expiresAt).toBeNull();
    expect(published.allowedSheetIds).toEqual(['sheet-1', 'sheet-2']);
    expect(published.token).toHaveLength(32);
    expect(published.id).toBeTruthy();
    expect(published.publishedAt).toBeTruthy();
  });

  it('uses custom title when provided', () => {
    const workbook = createTestWorkbook();
    const published = publishWorkbook(workbook, { title: 'Custom Title' });

    expect(published.title).toBe('Custom Title');
  });

  it('sets expiration when expiresInDays is provided', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-01T00:00:00.000Z'));

    const workbook = createTestWorkbook();
    const published = publishWorkbook(workbook, { expiresInDays: 7 });

    expect(published.expiresAt).toBe('2024-06-08T00:00:00.000Z');

    vi.useRealTimers();
  });

  it('restricts to specific sheets when allowedSheetIds is provided', () => {
    const workbook = createTestWorkbook();
    const published = publishWorkbook(workbook, {
      allowedSheetIds: ['sheet-1'],
    });

    expect(published.allowedSheetIds).toEqual(['sheet-1']);
  });

  it('supports single-sheet embed mode', () => {
    const workbook = createTestWorkbook();
    const published = publishWorkbook(workbook, {
      embedMode: 'single-sheet',
    });

    expect(published.embedMode).toBe('single-sheet');
  });

  it('supports single-chart embed mode', () => {
    const workbook = createTestWorkbook();
    const published = publishWorkbook(workbook, {
      embedMode: 'single-chart',
    });

    expect(published.embedMode).toBe('single-chart');
  });
});

describe('generateEmbedUrl', () => {
  it('generates a valid embed URL', () => {
    const url = generateEmbedUrl('https://app.example.com', 'abc123def456ghi789jkl012mno345pq');
    expect(url).toBe('https://app.example.com/embed/abc123def456ghi789jkl012mno345pq');
  });

  it('strips trailing slashes from base URL', () => {
    const url = generateEmbedUrl('https://app.example.com/', 'token123');
    expect(url).toBe('https://app.example.com/embed/token123');
  });

  it('handles multiple trailing slashes', () => {
    const url = generateEmbedUrl('https://app.example.com///', 'token123');
    expect(url).toBe('https://app.example.com/embed/token123');
  });
});

describe('generateEmbedSnippet', () => {
  it('generates an iframe snippet with default dimensions', () => {
    const snippet = generateEmbedSnippet({
      token: 'mytoken123',
      baseUrl: 'https://app.example.com',
    });

    expect(snippet).toContain('<iframe');
    expect(snippet).toContain('src="https://app.example.com/embed/mytoken123"');
    expect(snippet).toContain('width="100%"');
    expect(snippet).toContain('height="600px"');
    expect(snippet).toContain('frameborder="0"');
    expect(snippet).toContain('allowfullscreen');
  });

  it('uses custom width and height', () => {
    const snippet = generateEmbedSnippet({
      token: 'mytoken123',
      baseUrl: 'https://app.example.com',
      width: '800px',
      height: '400px',
    });

    expect(snippet).toContain('width="800px"');
    expect(snippet).toContain('height="400px"');
  });
});

describe('isPublishValid', () => {
  it('returns true when expiresAt is null (never expires)', () => {
    const published = createTestPublished({ expiresAt: null });
    expect(isPublishValid(published)).toBe(true);
  });

  it('returns true when expiration is in the future', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const published = createTestPublished({ expiresAt: futureDate });
    expect(isPublishValid(published)).toBe(true);
  });

  it('returns false when expiration is in the past', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const published = createTestPublished({ expiresAt: pastDate });
    expect(isPublishValid(published)).toBe(false);
  });
});

describe('isValidToken', () => {
  it('returns true for a valid 32-char lowercase alphanumeric token', () => {
    expect(isValidToken('abcdefgh12345678abcdefgh12345678')).toBe(true);
  });

  it('returns false for tokens that are too short', () => {
    expect(isValidToken('abc123')).toBe(false);
  });

  it('returns false for tokens that are too long', () => {
    expect(isValidToken('abcdefgh12345678abcdefgh12345678x')).toBe(false);
  });

  it('returns false for tokens with uppercase characters', () => {
    expect(isValidToken('ABCDEFGH12345678abcdefgh12345678')).toBe(false);
  });

  it('returns false for tokens with special characters', () => {
    expect(isValidToken('abcdefgh-2345678abcdefgh12345678')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidToken('')).toBe(false);
  });
});

describe('revokePublishedWorkbook', () => {
  it('removes the specified published entry', () => {
    const list = [
      createTestPublished({ id: 'pub-1' }),
      createTestPublished({ id: 'pub-2' }),
    ];

    const result = revokePublishedWorkbook(list, 'pub-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pub-2');
  });

  it('returns the same list when id is not found', () => {
    const list = [createTestPublished({ id: 'pub-1' })];
    const result = revokePublishedWorkbook(list, 'nonexistent');

    expect(result).toHaveLength(1);
  });

  it('returns empty array when revoking the only entry', () => {
    const list = [createTestPublished({ id: 'pub-1' })];
    const result = revokePublishedWorkbook(list, 'pub-1');

    expect(result).toHaveLength(0);
  });
});

describe('findPublishedByToken', () => {
  it('finds a published entry by token', () => {
    const list = [
      createTestPublished({ token: 'token1aaaabbbbccccddddeeeeffffgg' }),
      createTestPublished({ id: 'pub-2', token: 'token2aaaabbbbccccddddeeeeffffgg' }),
    ];

    const result = findPublishedByToken(list, 'token2aaaabbbbccccddddeeeeffffgg');

    expect(result).toBeDefined();
    expect(result!.id).toBe('pub-2');
  });

  it('returns undefined when token is not found', () => {
    const list = [createTestPublished()];
    const result = findPublishedByToken(list, 'nonexistenttoken12345678901234');

    expect(result).toBeUndefined();
  });

  it('returns undefined when token exists but entry is expired', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const list = [
      createTestPublished({
        token: 'expiredtoken1234567890123456789a',
        expiresAt: pastDate,
      }),
    ];

    const result = findPublishedByToken(list, 'expiredtoken1234567890123456789a');

    expect(result).toBeUndefined();
  });
});

describe('getPublishedForWorkbook', () => {
  it('returns all published entries for a workbook', () => {
    const list = [
      createTestPublished({ id: 'pub-1', workbookId: 'wb-1' }),
      createTestPublished({ id: 'pub-2', workbookId: 'wb-1' }),
      createTestPublished({ id: 'pub-3', workbookId: 'wb-2' }),
    ];

    const result = getPublishedForWorkbook(list, 'wb-1');

    expect(result).toHaveLength(2);
    expect(result.every((p) => p.workbookId === 'wb-1')).toBe(true);
  });

  it('returns empty array when no entries match', () => {
    const list = [createTestPublished({ workbookId: 'wb-1' })];
    const result = getPublishedForWorkbook(list, 'wb-99');

    expect(result).toHaveLength(0);
  });
});
