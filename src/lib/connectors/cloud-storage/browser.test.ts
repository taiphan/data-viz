import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  listFiles,
  downloadFile,
  browseAndParse,
  storeS3Credentials,
  getStoredS3Credentials,
  clearS3Credentials,
} from './browser';
import {
  storeToken,
  clearAllTokens,
  type OAuthToken,
} from './oauth';

// Mock the parseFile function from file-connectors
vi.mock('../file-connectors/index', () => ({
  parseFile: vi.fn().mockResolvedValue({
    id: 'mock-ds-id',
    name: 'test-file',
    fileName: 'test-file.csv',
    fields: [
      { id: 'f1', name: 'col1', type: 'string', role: 'dimension' },
    ],
    rows: [{ col1: 'value1' }],
    rowCount: 1,
    importedAt: '2024-01-01T00:00:00.000Z',
  }),
}));

describe('Cloud Storage Browser', () => {
  const validToken: OAuthToken = {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + 3600_000,
    tokenType: 'Bearer',
    scope: 'read',
  };

  beforeEach(() => {
    clearAllTokens();
    clearS3Credentials();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearAllTokens();
    clearS3Credentials();
  });

  // ============================================================
  // S3 CREDENTIALS STORE
  // ============================================================

  describe('S3 Credentials Store', () => {
    it('stores and retrieves S3 credentials', () => {
      const creds = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: 'my-bucket',
      };
      storeS3Credentials(creds);
      expect(getStoredS3Credentials()).toEqual(creds);
    });

    it('returns null when no credentials stored', () => {
      expect(getStoredS3Credentials()).toBeNull();
    });

    it('clears stored credentials', () => {
      storeS3Credentials({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: 'my-bucket',
      });
      clearS3Credentials();
      expect(getStoredS3Credentials()).toBeNull();
    });
  });

  // ============================================================
  // listFiles
  // ============================================================

  describe('listFiles', () => {
    it('returns error when no token is stored for OAuth providers', async () => {
      const result = await listFiles('google-drive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('token');
    });

    it('returns error when S3 credentials are not configured', async () => {
      const result = await listFiles('amazon-s3');
      expect(result.success).toBe(false);
      expect(result.error).toContain('S3 credentials not configured');
    });

    it('lists Google Drive files successfully', async () => {
      storeToken('google-drive', validToken);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          files: [
            {
              id: 'file-1',
              name: 'report.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              size: '1024',
              modifiedTime: '2024-01-15T10:00:00Z',
              parents: ['root'],
            },
            {
              id: 'file-2',
              name: 'data.csv',
              mimeType: 'text/csv',
              size: '512',
              modifiedTime: '2024-01-14T09:00:00Z',
              parents: ['root'],
            },
          ],
        }),
      }));

      const result = await listFiles('google-drive');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files![0].name).toBe('report.xlsx');
      expect(result.files![0].id).toBe('file-1');
      expect(result.files![1].name).toBe('data.csv');
    });

    it('lists Google Drive files in a specific folder', async () => {
      storeToken('google-drive', validToken);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      }));

      const result = await listFiles('google-drive', 'folder-id-123');
      expect(result.success).toBe(true);

      const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const url = fetchCall[0] as string;
      const urlObj = new URL(url);
      const query = urlObj.searchParams.get('q');
      expect(query).toContain('folder-id-123');
      expect(query).toContain('in parents');
    });

    it('lists OneDrive files successfully', async () => {
      storeToken('onedrive', validToken);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            {
              id: 'od-file-1',
              name: 'budget.xlsx',
              file: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
              size: 2048,
              lastModifiedDateTime: '2024-02-01T12:00:00Z',
            },
          ],
        }),
      }));

      const result = await listFiles('onedrive');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files![0].name).toBe('budget.xlsx');
      expect(result.files![0].id).toBe('od-file-1');
    });

    it('lists Dropbox files successfully', async () => {
      storeToken('dropbox', validToken);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          entries: [
            {
              id: 'id:dbx-1',
              name: 'sales.csv',
              size: 4096,
              client_modified: '2024-03-01T08:00:00Z',
              path_display: '/sales.csv',
            },
          ],
        }),
      }));

      const result = await listFiles('dropbox');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files![0].name).toBe('sales.csv');
      expect(result.files![0].mimeType).toBe('text/csv');
    });

    it('lists Box files successfully', async () => {
      storeToken('box', validToken);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          entries: [
            {
              id: 'box-file-1',
              name: 'analysis.pdf',
              type: 'file',
              size: 8192,
              modified_at: '2024-04-01T14:00:00Z',
            },
          ],
        }),
      }));

      const result = await listFiles('box');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files![0].name).toBe('analysis.pdf');
      expect(result.files![0].mimeType).toBe('application/pdf');
    });

    it('handles API errors gracefully', async () => {
      storeToken('google-drive', validToken);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      }));

      const result = await listFiles('google-drive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });

    it('handles network errors gracefully', async () => {
      storeToken('onedrive', validToken);

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        new Error('Network error'),
      ));

      const result = await listFiles('onedrive');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('lists S3 files when credentials are stored', async () => {
      storeS3Credentials({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: 'my-bucket',
      });

      const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <Contents>
            <Key>data/report.csv</Key>
            <Size>1024</Size>
            <LastModified>2024-05-01T10:00:00Z</LastModified>
          </Contents>
          <CommonPrefixes>
            <Prefix>data/subfolder/</Prefix>
          </CommonPrefixes>
        </ListBucketResult>`;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlResponse),
      }));

      const result = await listFiles('amazon-s3', 'data/');
      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(2);
      expect(result.files![0].name).toBe('report.csv');
      expect(result.files![0].mimeType).toBe('text/csv');
      expect(result.files![1].name).toBe('subfolder');
      expect(result.files![1].mimeType).toBe('application/x-directory');
    });
  });


  // ============================================================
  // downloadFile
  // ============================================================

  describe('downloadFile', () => {
    it('returns error when no token is stored', async () => {
      const result = await downloadFile('google-drive', 'file-id');
      expect(result.success).toBe(false);
      expect(result.error).toContain('token');
    });

    it('returns error when S3 credentials are missing', async () => {
      const result = await downloadFile('amazon-s3', 'path/to/file.csv');
      expect(result.success).toBe(false);
      expect(result.error).toContain('S3 credentials not configured');
    });

    it('downloads a Google Drive file', async () => {
      storeToken('google-drive', validToken);

      const mockBlob = new Blob(['col1,col2\nval1,val2'], { type: 'text/csv' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      const result = await downloadFile(
        'google-drive',
        'file-123',
        'data.csv',
        'text/csv',
      );

      expect(result.success).toBe(true);
      expect(result.file).toBeInstanceOf(File);
      expect(result.file!.name).toBe('data.csv');
    });

    it('downloads an OneDrive file', async () => {
      storeToken('onedrive', validToken);

      const mockBlob = new Blob(['test data'], { type: 'text/plain' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      const result = await downloadFile(
        'onedrive',
        'od-file-1',
        'notes.txt',
        'text/plain',
      );

      expect(result.success).toBe(true);
      expect(result.file!.name).toBe('notes.txt');
    });

    it('downloads a Dropbox file', async () => {
      storeToken('dropbox', validToken);

      const mockBlob = new Blob(['{}'], { type: 'application/json' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      const result = await downloadFile(
        'dropbox',
        '/path/to/config.json',
        'config.json',
        'application/json',
      );

      expect(result.success).toBe(true);
      expect(result.file!.name).toBe('config.json');
    });

    it('downloads a Box file', async () => {
      storeToken('box', validToken);

      const mockBlob = new Blob(['pdf content'], { type: 'application/pdf' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      const result = await downloadFile(
        'box',
        'box-file-1',
        'report.pdf',
        'application/pdf',
      );

      expect(result.success).toBe(true);
      expect(result.file!.name).toBe('report.pdf');
    });

    it('downloads an S3 file', async () => {
      storeS3Credentials({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: 'my-bucket',
      });

      const mockBlob = new Blob(['csv data'], { type: 'text/csv' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      const result = await downloadFile(
        'amazon-s3',
        'exports/data.csv',
        'data.csv',
        'text/csv',
      );

      expect(result.success).toBe(true);
      expect(result.file!.name).toBe('data.csv');
    });

    it('infers file name from fileId when not provided', async () => {
      storeToken('google-drive', validToken);

      const mockBlob = new Blob(['data'], { type: 'text/csv' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      const result = await downloadFile('google-drive', 'file-id');
      expect(result.success).toBe(true);
      expect(result.file!.name).toBe('file-id');
    });

    it('handles download failure', async () => {
      storeToken('google-drive', validToken);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }));

      const result = await downloadFile(
        'google-drive',
        'missing-file',
        'missing.csv',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to download');
    });

    it('handles network errors during download', async () => {
      storeToken('dropbox', validToken);

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        new Error('Connection reset'),
      ));

      const result = await downloadFile(
        'dropbox',
        '/file.csv',
        'file.csv',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection reset');
    });
  });

  // ============================================================
  // browseAndParse
  // ============================================================

  describe('browseAndParse', () => {
    it('downloads and parses a file into a DataSource', async () => {
      storeToken('google-drive', validToken);

      const mockBlob = new Blob(['col1\nval1'], { type: 'text/csv' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      const result = await browseAndParse(
        'google-drive',
        'file-123',
        'data.csv',
        'text/csv',
      );

      expect(result.success).toBe(true);
      expect(result.dataSource).toBeDefined();
      expect(result.dataSource!.name).toBe('test-file');
      expect(result.dataSource!.fields).toHaveLength(1);
    });

    it('returns error when download fails', async () => {
      const result = await browseAndParse(
        'google-drive',
        'file-123',
        'data.csv',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('returns error when parsing fails', async () => {
      storeToken('onedrive', validToken);

      const mockBlob = new Blob(['invalid'], { type: 'text/csv' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      }));

      // Override the mock to throw for this test
      const { parseFile } = await import('../file-connectors/index');
      (parseFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Invalid file format'),
      );

      const result = await browseAndParse(
        'onedrive',
        'od-file-1',
        'bad-file.xyz',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid file format');
    });
  });
});
