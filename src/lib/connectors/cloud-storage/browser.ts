// ============================================================
// CLOUD STORAGE FILE BROWSER & DOWNLOAD
// Authenticate, list files, download, route to file connector parser
// ============================================================

import {
  getValidToken,
  type CloudStorageProvider,
  type OAuthToken,
  type S3Credentials,
} from './oauth';
import { parseFile } from '../file-connectors/index';
import type { CloudFile } from '../types';
import type { DataSource } from '../../types';

// ============================================================
// TYPES
// ============================================================

export interface ListFilesResult {
  success: boolean;
  files?: CloudFile[];
  error?: string;
}

export interface DownloadFileResult {
  success: boolean;
  file?: File;
  error?: string;
}

export interface BrowseAndParseResult {
  success: boolean;
  dataSource?: DataSource;
  error?: string;
}

// ============================================================
// PROVIDER API ENDPOINTS
// ============================================================

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const ONEDRIVE_API = 'https://graph.microsoft.com/v1.0';
const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_API = 'https://content.dropboxapi.com/2';
const BOX_API = 'https://api.box.com/2.0';

// ============================================================
// AUTHENTICATED FETCH HELPER
// ============================================================

async function authenticatedFetch(
  url: string,
  token: OAuthToken,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `${token.tokenType} ${token.accessToken}`);

  return fetch(url, { ...options, headers });
}

// ============================================================
// GOOGLE DRIVE
// ============================================================

async function listGoogleDriveFiles(
  token: OAuthToken,
  path?: string,
): Promise<CloudFile[]> {
  const query = path && path !== '/'
    ? `'${path}' in parents and trashed = false`
    : `'root' in parents and trashed = false`;

  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,mimeType,size,modifiedTime,parents)',
    pageSize: '100',
    orderBy: 'name',
  });

  const response = await authenticatedFetch(
    `${GOOGLE_DRIVE_API}/files?${params.toString()}`,
    token,
  );

  if (!response.ok) {
    throw new Error(`Google Drive API error: ${response.status}`);
  }

  const data = await response.json();
  const files: CloudFile[] = (data.files || []).map(
    (file: Record<string, unknown>) => ({
      id: file.id as string,
      name: file.name as string,
      mimeType: (file.mimeType as string) || 'application/octet-stream',
      size: Number(file.size) || 0,
      modifiedAt: (file.modifiedTime as string) || new Date().toISOString(),
      path: path || '/',
    }),
  );

  return files;
}

async function downloadGoogleDriveFile(
  token: OAuthToken,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<File> {
  // Google Docs need export; regular files use direct download
  const isGoogleDoc = mimeType.startsWith('application/vnd.google-apps.');
  let url: string;

  if (isGoogleDoc) {
    const exportMime = getGoogleExportMime(mimeType);
    const params = new URLSearchParams({ mimeType: exportMime });
    url = `${GOOGLE_DRIVE_API}/files/${fileId}/export?${params.toString()}`;
  } else {
    url = `${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`;
  }

  const response = await authenticatedFetch(url, token);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType });
}

function getGoogleExportMime(googleMime: string): string {
  const exportMap: Record<string, string> = {
    'application/vnd.google-apps.spreadsheet':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.google-apps.document': 'application/pdf',
    'application/vnd.google-apps.presentation': 'application/pdf',
  };
  return exportMap[googleMime] || 'application/pdf';
}

// ============================================================
// ONEDRIVE
// ============================================================

async function listOneDriveFiles(
  token: OAuthToken,
  path?: string,
): Promise<CloudFile[]> {
  const endpoint = path && path !== '/'
    ? `${ONEDRIVE_API}/me/drive/items/${path}/children`
    : `${ONEDRIVE_API}/me/drive/root/children`;

  const params = new URLSearchParams({
    $select: 'id,name,file,size,lastModifiedDateTime,parentReference',
    $top: '100',
    $orderby: 'name',
  });

  const response = await authenticatedFetch(
    `${endpoint}?${params.toString()}`,
    token,
  );

  if (!response.ok) {
    throw new Error(`OneDrive API error: ${response.status}`);
  }

  const data = await response.json();
  const files: CloudFile[] = (data.value || []).map(
    (item: Record<string, unknown>) => ({
      id: item.id as string,
      name: item.name as string,
      mimeType: (item.file as Record<string, unknown>)?.mimeType as string
        || 'application/octet-stream',
      size: Number(item.size) || 0,
      modifiedAt: (item.lastModifiedDateTime as string) || new Date().toISOString(),
      path: path || '/',
    }),
  );

  return files;
}

async function downloadOneDriveFile(
  token: OAuthToken,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<File> {
  const url = `${ONEDRIVE_API}/me/drive/items/${fileId}/content`;
  const response = await authenticatedFetch(url, token);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType });
}


// ============================================================
// DROPBOX
// ============================================================

async function listDropboxFiles(
  token: OAuthToken,
  path?: string,
): Promise<CloudFile[]> {
  const folderPath = path && path !== '/' ? path : '';

  const response = await authenticatedFetch(
    `${DROPBOX_API}/files/list_folder`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: folderPath,
        limit: 100,
        include_media_info: false,
        include_deleted: false,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Dropbox API error: ${response.status}`);
  }

  const data = await response.json();
  const files: CloudFile[] = (data.entries || []).map(
    (entry: Record<string, unknown>) => ({
      id: entry.id as string,
      name: entry.name as string,
      mimeType: guessMimeType(entry.name as string),
      size: Number(entry.size) || 0,
      modifiedAt: (entry.client_modified as string) || new Date().toISOString(),
      path: (entry.path_display as string) || path || '/',
    }),
  );

  return files;
}

async function downloadDropboxFile(
  token: OAuthToken,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<File> {
  const response = await authenticatedFetch(
    `${DROPBOX_CONTENT_API}/files/download`,
    token,
    {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({ path: fileId }),
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType });
}

// ============================================================
// BOX
// ============================================================

async function listBoxFiles(
  token: OAuthToken,
  path?: string,
): Promise<CloudFile[]> {
  const folderId = path && path !== '/' ? path : '0';

  const params = new URLSearchParams({
    fields: 'id,name,type,size,modified_at,content_created_at',
    limit: '100',
    offset: '0',
  });

  const response = await authenticatedFetch(
    `${BOX_API}/folders/${folderId}/items?${params.toString()}`,
    token,
  );

  if (!response.ok) {
    throw new Error(`Box API error: ${response.status}`);
  }

  const data = await response.json();
  const files: CloudFile[] = (data.entries || []).map(
    (entry: Record<string, unknown>) => ({
      id: entry.id as string,
      name: entry.name as string,
      mimeType: guessMimeType(entry.name as string),
      size: Number(entry.size) || 0,
      modifiedAt: (entry.modified_at as string) || new Date().toISOString(),
      path: path || '/',
    }),
  );

  return files;
}

async function downloadBoxFile(
  token: OAuthToken,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<File> {
  const response = await authenticatedFetch(
    `${BOX_API}/files/${fileId}/content`,
    token,
  );

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType });
}


// ============================================================
// AMAZON S3 (uses stored credentials, not OAuth)
// ============================================================

async function listS3Files(
  credentials: S3Credentials,
  path?: string,
): Promise<CloudFile[]> {
  const prefix = path && path !== '/'
    ? path.endsWith('/') ? path : `${path}/`
    : credentials.prefix || '';

  // S3 list objects requires AWS Signature V4 — use a simplified approach
  // In production, this would go through the proxy for proper signing
  const params = new URLSearchParams({
    'list-type': '2',
    prefix,
    delimiter: '/',
    'max-keys': '100',
  });

  const url = `https://${credentials.bucket}.s3.${credentials.region}.amazonaws.com?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    },
  });

  if (!response.ok) {
    throw new Error(`S3 API error: ${response.status}`);
  }

  const text = await response.text();
  return parseS3ListResponse(text, path || '/');
}

function parseS3ListResponse(xml: string, basePath: string): CloudFile[] {
  const files: CloudFile[] = [];

  // Parse file objects (Contents) using regex for Node/browser compatibility
  const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  let match: RegExpExecArray | null;

  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[1];
    const key = extractXmlValue(block, 'Key');
    const size = Number(extractXmlValue(block, 'Size')) || 0;
    const lastModified = extractXmlValue(block, 'LastModified')
      || new Date().toISOString();

    const name = key.split('/').pop() || key;
    if (!name) continue; // Skip empty keys (folder markers)

    files.push({
      id: key,
      name,
      mimeType: guessMimeType(name),
      size,
      modifiedAt: lastModified,
      path: basePath,
    });
  }

  // Parse folder prefixes (CommonPrefixes)
  const prefixRegex = /<CommonPrefixes>\s*<Prefix>([\s\S]*?)<\/Prefix>\s*<\/CommonPrefixes>/g;
  while ((match = prefixRegex.exec(xml)) !== null) {
    const prefixText = match[1].trim();
    const name = prefixText.replace(/\/$/, '').split('/').pop() || prefixText;

    files.push({
      id: prefixText,
      name,
      mimeType: 'application/x-directory',
      size: 0,
      modifiedAt: new Date().toISOString(),
      path: basePath,
    });
  }

  return files;
}

function extractXmlValue(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}>(.*?)</${tag}>`);
  const match = regex.exec(xml);
  return match ? match[1].trim() : '';
}

async function downloadS3File(
  credentials: S3Credentials,
  fileId: string,
  fileName: string,
  mimeType: string,
): Promise<File> {
  const url = `https://${credentials.bucket}.s3.${credentials.region}.amazonaws.com/${fileId}`;

  const response = await fetch(url, {
    headers: {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download S3 file: ${response.status}`);
  }

  const blob = await response.blob();
  return new File([blob], fileName, { type: mimeType });
}

// ============================================================
// MIME TYPE HELPER
// ============================================================

const MIME_MAP: Record<string, string> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pdf: 'application/pdf',
  json: 'application/json',
  parquet: 'application/x-parquet',
  sav: 'application/x-spss-sav',
  dta: 'application/x-stata-dta',
  sas7bdat: 'application/x-sas-data',
};

function guessMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}


// ============================================================
// S3 CREDENTIALS STORE (in-memory)
// ============================================================

let storedS3Credentials: S3Credentials | null = null;

export function storeS3Credentials(credentials: S3Credentials): void {
  storedS3Credentials = credentials;
}

export function getStoredS3Credentials(): S3Credentials | null {
  return storedS3Credentials;
}

export function clearS3Credentials(): void {
  storedS3Credentials = null;
}

// ============================================================
// PUBLIC API — listFiles
// ============================================================

/**
 * List files in a cloud storage provider directory.
 *
 * @param provider - The cloud storage provider
 * @param path - Optional directory path/ID to list (defaults to root)
 * @returns List of files in the directory
 */
export async function listFiles(
  provider: CloudStorageProvider,
  path?: string,
): Promise<ListFilesResult> {
  try {
    if (provider === 'amazon-s3') {
      const credentials = getStoredS3Credentials();
      if (!credentials) {
        return {
          success: false,
          error: 'S3 credentials not configured. Please authenticate first.',
        };
      }
      const files = await listS3Files(credentials, path);
      return { success: true, files };
    }

    const tokenResult = await getValidToken(provider);
    if (!tokenResult.success || !tokenResult.token) {
      return {
        success: false,
        error: tokenResult.error || 'Authentication required.',
      };
    }

    const token = tokenResult.token;
    let files: CloudFile[];

    switch (provider) {
      case 'google-drive':
        files = await listGoogleDriveFiles(token, path);
        break;
      case 'onedrive':
        files = await listOneDriveFiles(token, path);
        break;
      case 'dropbox':
        files = await listDropboxFiles(token, path);
        break;
      case 'box':
        files = await listBoxFiles(token, path);
        break;
      default:
        return {
          success: false,
          error: `Unsupported provider: ${provider}`,
        };
    }

    return { success: true, files };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : 'Failed to list files.',
    };
  }
}

// ============================================================
// PUBLIC API — downloadFile
// ============================================================

/**
 * Download a file from cloud storage as a browser File object.
 *
 * @param provider - The cloud storage provider
 * @param fileId - The file ID or path to download
 * @param fileName - The file name (used for the File object)
 * @param mimeType - The MIME type of the file
 * @returns Downloaded File object
 */
export async function downloadFile(
  provider: CloudStorageProvider,
  fileId: string,
  fileName?: string,
  mimeType?: string,
): Promise<DownloadFileResult> {
  const resolvedName = fileName || fileId.split('/').pop() || 'download';
  const resolvedMime = mimeType || guessMimeType(resolvedName);

  try {
    if (provider === 'amazon-s3') {
      const credentials = getStoredS3Credentials();
      if (!credentials) {
        return {
          success: false,
          error: 'S3 credentials not configured. Please authenticate first.',
        };
      }
      const file = await downloadS3File(
        credentials,
        fileId,
        resolvedName,
        resolvedMime,
      );
      return { success: true, file };
    }

    const tokenResult = await getValidToken(provider);
    if (!tokenResult.success || !tokenResult.token) {
      return {
        success: false,
        error: tokenResult.error || 'Authentication required.',
      };
    }

    const token = tokenResult.token;
    let file: File;

    switch (provider) {
      case 'google-drive':
        file = await downloadGoogleDriveFile(
          token, fileId, resolvedName, resolvedMime,
        );
        break;
      case 'onedrive':
        file = await downloadOneDriveFile(
          token, fileId, resolvedName, resolvedMime,
        );
        break;
      case 'dropbox':
        file = await downloadDropboxFile(
          token, fileId, resolvedName, resolvedMime,
        );
        break;
      case 'box':
        file = await downloadBoxFile(
          token, fileId, resolvedName, resolvedMime,
        );
        break;
      default:
        return {
          success: false,
          error: `Unsupported provider: ${provider}`,
        };
    }

    return { success: true, file };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : 'Failed to download file.',
    };
  }
}

// ============================================================
// PUBLIC API — browseAndParse
// ============================================================

/**
 * Download a file from cloud storage and parse it through the
 * file connector facade, returning a DataSource ready for the workbook.
 *
 * @param provider - The cloud storage provider
 * @param fileId - The file ID or path to download
 * @param fileName - The file name (used for type detection)
 * @param mimeType - The MIME type of the file
 * @returns Parsed DataSource
 */
export async function browseAndParse(
  provider: CloudStorageProvider,
  fileId: string,
  fileName?: string,
  mimeType?: string,
): Promise<BrowseAndParseResult> {
  const downloadResult = await downloadFile(provider, fileId, fileName, mimeType);

  if (!downloadResult.success || !downloadResult.file) {
    return {
      success: false,
      error: downloadResult.error || 'Download failed.',
    };
  }

  try {
    const dataSource = await parseFile(downloadResult.file);
    return { success: true, dataSource };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error
        ? error.message
        : 'Failed to parse downloaded file.',
    };
  }
}
