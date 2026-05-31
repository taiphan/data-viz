import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  startOAuthFlow,
  handleOAuthCallback,
  refreshToken,
  getValidToken,
  authenticateS3,
  storeToken,
  getStoredToken,
  clearToken,
  clearAllTokens,
  isTokenExpired,
  OAUTH_PROVIDERS,
  type OAuthToken,
  type CloudStorageProvider,
} from './oauth';

describe('OAuth Cloud Storage', () => {
  beforeEach(() => {
    clearAllTokens();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearAllTokens();
  });

  describe('OAUTH_PROVIDERS', () => {
    it('has configurations for all OAuth providers', () => {
      expect(OAUTH_PROVIDERS['google-drive']).toBeDefined();
      expect(OAUTH_PROVIDERS.onedrive).toBeDefined();
      expect(OAUTH_PROVIDERS.dropbox).toBeDefined();
      expect(OAUTH_PROVIDERS.box).toBeDefined();
    });

    it('each provider has required auth and token URLs', () => {
      for (const [, config] of Object.entries(OAUTH_PROVIDERS)) {
        expect(config.authUrl).toMatch(/^https:\/\//);
        expect(config.tokenUrl).toMatch(/^https:\/\//);
        expect(config.scopes.length).toBeGreaterThan(0);
        expect(config.id).toBeTruthy();
        expect(config.name).toBeTruthy();
      }
    });
  });

  describe('Token Store', () => {
    const mockToken: OAuthToken = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: Date.now() + 3600_000,
      tokenType: 'Bearer',
      scope: 'read',
    };

    it('stores and retrieves tokens', () => {
      storeToken('google-drive', mockToken);
      const retrieved = getStoredToken('google-drive');
      expect(retrieved).toEqual(mockToken);
    });

    it('returns null for unstored provider', () => {
      expect(getStoredToken('dropbox')).toBeNull();
    });

    it('clears a specific token', () => {
      storeToken('google-drive', mockToken);
      storeToken('dropbox', mockToken);
      clearToken('google-drive');
      expect(getStoredToken('google-drive')).toBeNull();
      expect(getStoredToken('dropbox')).toEqual(mockToken);
    });

    it('clears all tokens', () => {
      storeToken('google-drive', mockToken);
      storeToken('dropbox', mockToken);
      clearAllTokens();
      expect(getStoredToken('google-drive')).toBeNull();
      expect(getStoredToken('dropbox')).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for token expiring in the future', () => {
      const token: OAuthToken = {
        accessToken: 'test',
        expiresAt: Date.now() + 3600_000,
        tokenType: 'Bearer',
      };
      expect(isTokenExpired(token)).toBe(false);
    });

    it('returns true for token already expired', () => {
      const token: OAuthToken = {
        accessToken: 'test',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      };
      expect(isTokenExpired(token)).toBe(true);
    });

    it('returns true for token expiring within 60s buffer', () => {
      const token: OAuthToken = {
        accessToken: 'test',
        expiresAt: Date.now() + 30_000, // 30s from now, within 60s buffer
        tokenType: 'Bearer',
      };
      expect(isTokenExpired(token)).toBe(true);
    });
  });

  describe('startOAuthFlow', () => {
    it('returns error for amazon-s3 provider', async () => {
      const result = await startOAuthFlow('amazon-s3');
      expect(result.success).toBe(false);
      expect(result.error).toContain('IAM/access key');
      expect(result.provider).toBe('amazon-s3');
    });

    it('returns error when client ID is not configured', async () => {
      const result = await startOAuthFlow('google-drive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('client ID not configured');
      expect(result.provider).toBe('google-drive');
    });
  });

  describe('handleOAuthCallback', () => {
    it('returns error for amazon-s3 provider', async () => {
      const result = await handleOAuthCallback({
        code: 'test-code',
        state: 'test-state',
        provider: 'amazon-s3',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not use OAuth');
    });

    it('returns error for unknown provider', async () => {
      const result = await handleOAuthCallback({
        code: 'test-code',
        state: 'test-state',
        provider: 'unknown' as CloudStorageProvider,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown OAuth provider');
    });

    it('exchanges code for token on successful response', async () => {
      const mockResponse = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'read write',
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }));

      const result = await handleOAuthCallback({
        code: 'auth-code-123',
        state: 'state-123',
        provider: 'google-drive',
      });

      expect(result.success).toBe(true);
      expect(result.token?.accessToken).toBe('new-access-token');
      expect(result.token?.refreshToken).toBe('new-refresh-token');
      expect(result.token?.tokenType).toBe('Bearer');
      expect(result.provider).toBe('google-drive');

      // Token should be stored
      const stored = getStoredToken('google-drive');
      expect(stored?.accessToken).toBe('new-access-token');
    });

    it('handles token exchange failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve(JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Code has expired',
        })),
      }));

      const result = await handleOAuthCallback({
        code: 'expired-code',
        state: 'state-123',
        provider: 'dropbox',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Code has expired');
    });

    it('handles network errors gracefully', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
        new Error('Network error')
      ));

      const result = await handleOAuthCallback({
        code: 'auth-code',
        state: 'state-123',
        provider: 'onedrive',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('refreshToken', () => {
    it('returns error when no token is stored', async () => {
      const result = await refreshToken('google-drive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token');
    });

    it('returns error when stored token has no refresh token', async () => {
      storeToken('google-drive', {
        accessToken: 'test',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      const result = await refreshToken('google-drive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No refresh token');
    });

    it('refreshes token successfully', async () => {
      storeToken('google-drive', {
        accessToken: 'old-token',
        refreshToken: 'refresh-123',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'refreshed-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      }));

      const result = await refreshToken('google-drive');
      expect(result.success).toBe(true);
      expect(result.token?.accessToken).toBe('refreshed-token');
      // Should preserve original refresh token when not returned
      expect(result.token?.refreshToken).toBe('refresh-123');
    });

    it('clears token on refresh failure', async () => {
      storeToken('dropbox', {
        accessToken: 'old-token',
        refreshToken: 'refresh-123',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      }));

      const result = await refreshToken('dropbox');
      expect(result.success).toBe(false);
      expect(getStoredToken('dropbox')).toBeNull();
    });
  });

  describe('getValidToken', () => {
    it('returns error when no token stored', async () => {
      const result = await getValidToken('google-drive');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No token stored');
    });

    it('returns existing token if not expired', async () => {
      const token: OAuthToken = {
        accessToken: 'valid-token',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3600_000,
        tokenType: 'Bearer',
      };
      storeToken('onedrive', token);

      const result = await getValidToken('onedrive');
      expect(result.success).toBe(true);
      expect(result.token?.accessToken).toBe('valid-token');
    });

    it('refreshes token if expired', async () => {
      storeToken('box', {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      }));

      const result = await getValidToken('box');
      expect(result.success).toBe(true);
      expect(result.token?.accessToken).toBe('new-token');
    });
  });

  describe('authenticateS3', () => {
    it('validates required fields', () => {
      const result = authenticateS3({
        accessKeyId: '',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: 'my-bucket',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Access Key ID');
    });

    it('validates region is required', () => {
      const result = authenticateS3({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: '',
        bucket: 'my-bucket',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Region');
    });

    it('validates bucket is required', () => {
      const result = authenticateS3({
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: '',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Bucket');
    });

    it('validates access key format', () => {
      const result = authenticateS3({
        accessKeyId: 'invalid-key!',
        secretAccessKey: 'secret',
        region: 'us-east-1',
        bucket: 'my-bucket',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid Access Key ID');
    });

    it('returns success with valid credentials', () => {
      const credentials = {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
        bucket: 'my-data-bucket',
        prefix: 'exports/',
      };
      const result = authenticateS3(credentials);
      expect(result.success).toBe(true);
      expect(result.credentials).toEqual(credentials);
    });
  });
});
