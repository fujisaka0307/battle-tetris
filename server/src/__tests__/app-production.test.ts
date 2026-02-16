import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Server production static serving', () => {
  let tmpDir: string;

  beforeAll(() => {
    // Create a temporary client dist directory with test files
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-tetris-test-'));
    fs.mkdirSync(path.join(tmpDir, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      '<html><body>SPA</body></html>',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'assets', 'test.js'),
      'console.log("test")',
    );
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('本番環境で静的アセットが配信されること', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_DIST_PATH', tmpDir);
    vi.resetModules();

    const { default: app } = await import('../app');

    const res = await request(app).get('/assets/test.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('console.log("test")');
    // Check long-term cache header
    expect(res.headers['cache-control']).toContain('max-age');

    vi.unstubAllEnvs();
  });

  it('本番環境でSPAフォールバックが動作すること', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_DIST_PATH', tmpDir);
    vi.resetModules();

    const { default: app } = await import('../app');

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SPA');

    vi.unstubAllEnvs();
  });

  it('本番環境で未知のパスがindex.htmlにフォールバックされること', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_DIST_PATH', tmpDir);
    vi.resetModules();

    const { default: app } = await import('../app');

    const res = await request(app).get('/unknown/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SPA');

    vi.unstubAllEnvs();
  });
});
