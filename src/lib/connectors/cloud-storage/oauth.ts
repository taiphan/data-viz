// ============================================================
// CLOUD STORAGE OAUTH — Popup-based OAuth 2.0 flow
// ============================================================

// ============================================================
// TYPES
// ============================================================

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in ms
  tokenType: string;
  scope?: string;
}

export interface OAuthFlowResult {
  success: boolean;
  token?: OAuthToken;
  error?: string;
  provider: string;
}

export interface OAuthProviderConfig {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  redirectUri: string;
}

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  prefix?: string;
}

export interface S3AuthResult {
  success: boolean;
  credentials?: S3Credentials;
  error?: string;
}

export type CloudStorageProvider =
  | 'google-drive'
  | 'onedrive'
  | 'dropbox'
  | 'box'
  | 'amazon-s3';

// ============================================================
// PROVIDER CONFIGURATIONS
// ============================================================

const REDIRECT_URI = typeof window !== 'undefined'
  ? `${window.location.origin}/auth/callback`
  : 'http://localhost:3000/auth/callback';

export const OAUTH_PROVIDERS: Record<
  Exclude<CloudStorageProvider, 'amazon-s3'>,
  OAuthProviderConfig
> = {
  'google-drive': {
    id: 'google-drive',
    name: 'Google Drive',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
    clientId: '',
    redirectUri: REDIRECT_URI,
  },
  onedrive: {
    id: 'onedrive',
    name: 'OneDrive',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: ['Files.Read', 'Files.Read.All', 'offline_access'],
    clientId: '',
    redirectUri: REDIRECT_URI,
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: ['files.metadata.read', 'files.content.read'],
    clientId: '',
    redirectUri: REDIRECT_URI,
  },
  box: {
    id: 'box',
    name: 'Box',
    authUrl: 'https://account.box.com/api/oauth2/authorize',
    tokenUrl: 'https://api.box.com/oauth2/token',
    scopes: ['root_readwrite'],
    clientId: '',
    redirectUri: REDIRECT_URI,
  },
};

// ============================================================
// IN-MEMORY TOKEN STORE (not persisted for security)
// ============================================================

const tokenStore = new Map<string, OAuthToken>();

export function getStoredToken(provider: CloudStorageProvider): OAuthToken | null {
  const token = tokenStore.get(provider);
  if (!token) return null;
  return token;
}

export function storeToken(provider: CloudStorageProvider, token: OAuthToken): void {
  tokenStore.set(provider, token);
}

export function clearToken(provider: CloudStorageProvider): void {
  tokenStore.delete(provider);
}

export function clearAllTokens(): void {
  tokenStore.clear();
}

export function isTokenExpired(token: OAuthToken): boolean {
  // Consider expired 60 seconds before actual expiry for safety margin
  const bufferMs = 60_000;
  return Date.now() >= token.expiresAt - bufferMs;
}

// ============================================================
// OAUTH POPUP FLOW
// ============================================================

function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildAuthUrl(config: OAuthProviderConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${config.authUrl}?${params.toString()}`;
}

function openPopup(url: string): Window | null {
  const width = 600;
  const height = 700;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;

  return window.open(
    url,
    'oauth-popup',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
  );
}

export function startOAuthFlow(provider: CloudStorageProvider): Promise<OAuthFlowResult> {
  if (provider === 'amazon-s3') {
    return Promise.resolve({
      success: false,
      error: 'Amazon S3 uses IAM/access key authentication. Use authenticateS3() instead.',
      provider,
    });
  }

  const config = OAUTH_PROVIDERS[provider];
  if (!config) {
    return Promise.resolve({
      success: false,
      error: `Unknown OAuth provider: ${provider}`,
      provider,
    });
  }

  if (!config.clientId) {
    return Promise.resolve({
      success: false,
      error: `OAuth client ID not configured for ${config.name}. Set the client ID in environment variables.`,
      provider,
    });
  }

  const state = generateState();
  const authUrl = buildAuthUrl(config, state);

  return new Promise<OAuthFlowResult>((resolve) => {
    const popup = openPopup(authUrl);

    if (!popup) {
      resolve({
        success: false,
        error: 'Failed to open popup window. Please allow popups for this site.',
        provider,
      });
      return;
    }

    const popupWindow = popup;

    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', messageHandler);
      if (!popupWindow.closed) popupWindow.close();
      resolve({
        success: false,
        error: 'OAuth flow timed out. Please try again.',
        provider,
      });
    }, 300_000); // 5 minute timeout

    const pollInterval = setInterval(() => {
      if (popupWindow.closed) {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
        window.removeEventListener('message', messageHandler);
        resolve({
          success: false,
          error: 'OAuth popup was closed before completing authentication.',
          provider,
        });
      }
    }, 500);

    function messageHandler(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      const data = event.data;
      if (data?.type !== 'oauth-callback') return;
      if (data.state !== state) return;

      clearInterval(pollInterval);
      clearTimeout(timeoutId);
      window.removeEventListener('message', messageHandler);
      if (!popupWindow.closed) popupWindow.close();

      if (data.error) {
        resolve({
          success: false,
          error: data.error,
          provider,
        });
        return;
      }

      if (data.code) {
        handleOAuthCallback({ code: data.code, state, provider })
          .then((result) => resolve(result))
          .catch((err) => {
            resolve({
              success: false,
              error: err instanceof Error ? err.message : 'Token exchange failed.',
              provider,
            });
          });
      }
    }

    window.addEventListener('message', messageHandler);
  });
}

// ============================================================
// TOKEN EXCHANGE
// ============================================================

export interface OAuthCallbackParams {
  code: string;
  state: string;
  provider: CloudStorageProvider;
}

export async function handleOAuthCallback(
  params: OAuthCallbackParams
): Promise<OAuthFlowResult> {
  const { code, provider } = params;

  if (provider === 'amazon-s3') {
    return {
      success: false,
      error: 'Amazon S3 does not use OAuth. Use authenticateS3() instead.',
      provider,
    };
  }

  const config = OAUTH_PROVIDERS[provider];
  if (!config) {
    return {
      success: false,
      error: `Unknown OAuth provider: ${provider}`,
      provider,
    };
  }

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      let errorMessage = 'Token exchange failed.';
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed.error_description || parsed.error || errorMessage;
      } catch {
        // Use generic message if response isn't JSON
      }
      return { success: false, error: errorMessage, provider };
    }

    const tokenData = await tokenResponse.json();
    const token: OAuthToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      tokenType: tokenData.token_type ?? 'Bearer',
      scope: tokenData.scope,
    };

    storeToken(provider, token);

    return { success: true, token, provider };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error during token exchange.',
      provider,
    };
  }
}

// ============================================================
// TOKEN REFRESH
// ============================================================

export async function refreshToken(
  provider: Exclude<CloudStorageProvider, 'amazon-s3'>
): Promise<OAuthFlowResult> {
  const existingToken = getStoredToken(provider);
  if (!existingToken?.refreshToken) {
    return {
      success: false,
      error: 'No refresh token available. Please re-authenticate.',
      provider,
    };
  }

  const config = OAUTH_PROVIDERS[provider];
  if (!config) {
    return {
      success: false,
      error: `Unknown OAuth provider: ${provider}`,
      provider,
    };
  }

  try {
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existingToken.refreshToken,
        client_id: config.clientId,
      }),
    });

    if (!tokenResponse.ok) {
      clearToken(provider);
      return {
        success: false,
        error: 'Token refresh failed. Please re-authenticate.',
        provider,
      };
    }

    const tokenData = await tokenResponse.json();
    const newToken: OAuthToken = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? existingToken.refreshToken,
      expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      tokenType: tokenData.token_type ?? 'Bearer',
      scope: tokenData.scope ?? existingToken.scope,
    };

    storeToken(provider, newToken);

    return { success: true, token: newToken, provider };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error during token refresh.',
      provider,
    };
  }
}

// ============================================================
// GET VALID TOKEN (auto-refresh if expired)
// ============================================================

export async function getValidToken(
  provider: Exclude<CloudStorageProvider, 'amazon-s3'>
): Promise<OAuthFlowResult> {
  const token = getStoredToken(provider);

  if (!token) {
    return {
      success: false,
      error: 'No token stored. Please authenticate first.',
      provider,
    };
  }

  if (!isTokenExpired(token)) {
    return { success: true, token, provider };
  }

  return refreshToken(provider);
}

// ============================================================
// AMAZON S3 — IAM/ACCESS KEY AUTH (separate flow)
// ============================================================

export function authenticateS3(credentials: S3Credentials): S3AuthResult {
  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    return {
      success: false,
      error: 'Access Key ID and Secret Access Key are required.',
    };
  }

  if (!credentials.region) {
    return {
      success: false,
      error: 'AWS Region is required.',
    };
  }

  if (!credentials.bucket) {
    return {
      success: false,
      error: 'Bucket name is required.',
    };
  }

  // Validate access key format (starts with AKIA for long-term keys)
  const accessKeyPattern = /^[A-Z0-9]{16,128}$/;
  if (!accessKeyPattern.test(credentials.accessKeyId)) {
    return {
      success: false,
      error: 'Invalid Access Key ID format.',
    };
  }

  return {
    success: true,
    credentials,
  };
}
