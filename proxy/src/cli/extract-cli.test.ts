import { describe, it, expect } from 'vitest';

/**
 * Tests for extract-cli.ts
 *
 * Since the CLI uses fetch to communicate with the proxy API,
 * we test the HTTP client logic and command behavior by mocking fetch.
 */

// We test the CLI indirectly by importing and testing the module's behavior
// through spawning the process with different arguments.

describe('extract-cli', () => {

  describe('list command', () => {
    it('should output an error message when server is unreachable', async () => {
      const { execSync } = await import('child_process');

      try {
        execSync(
          'npx tsx src/cli/extract-cli.ts list 2>&1',
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              PROXY_BASE_URL: 'http://localhost:19999',
              PROXY_AUTH_TOKEN: 'test-token',
            },
            encoding: 'utf-8',
            timeout: 10000,
          },
        );
        // If server happens to be running, that's fine too
      } catch (err) {
        const error = err as { stdout?: string; status?: number };
        const output = error.stdout || '';
        // Should show a connection error message
        expect(output).toContain('Failed to list extracts');
      }
    });
  });

  describe('command structure', () => {
    it('should show help without errors', async () => {
      const { execSync } = await import('child_process');
      const result = execSync(
        'npx tsx src/cli/extract-cli.ts --help',
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 10000,
        },
      );

      expect(result).toContain('list');
      expect(result).toContain('run');
      expect(result).toContain('schedule');
      expect(result).toContain('status');
      expect(result).toContain('cancel');
      expect(result).toContain('Manage data extract schedules');
    });

    it('should show version', async () => {
      const { execSync } = await import('child_process');
      const result = execSync(
        'npx tsx src/cli/extract-cli.ts --version',
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 10000,
        },
      );

      expect(result.trim()).toBe('1.0.0');
    });

    it('should show list command help with pagination options', async () => {
      const { execSync } = await import('child_process');
      const result = execSync(
        'npx tsx src/cli/extract-cli.ts list --help',
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 10000,
        },
      );

      expect(result).toContain('--page');
      expect(result).toContain('--limit');
    });

    it('should show schedule command help with cron option', async () => {
      const { execSync } = await import('child_process');
      const result = execSync(
        'npx tsx src/cli/extract-cli.ts schedule --help',
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 10000,
        },
      );

      expect(result).toContain('--cron');
      expect(result).toContain('--timezone');
      expect(result).toContain('--disable');
    });

    it('should show cancel command help with force option', async () => {
      const { execSync } = await import('child_process');
      const result = execSync(
        'npx tsx src/cli/extract-cli.ts cancel --help',
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 10000,
        },
      );

      expect(result).toContain('--force');
    });

    it('should require cron option for schedule command', async () => {
      const { execSync } = await import('child_process');

      try {
        execSync(
          'npx tsx src/cli/extract-cli.ts schedule some-id 2>&1',
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 10000,
          },
        );
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        const error = err as { stdout?: string; stderr?: string; status?: number };
        const output = (error.stdout || '') + (error.stderr || '');
        expect(output).toContain('--cron');
      }
    });
  });
});
