import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaudClient } from '../src/client.js';
import { PlaudAuth } from '../src/auth.js';
import { PlaudConfig } from '../src/config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('PlaudClient', () => {
  let tmpDir: string;
  let client: PlaudClient;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plaud-client-'));
    const config = new PlaudConfig(tmpDir);
    const futureExp = Math.floor(Date.now() / 1000) + 300 * 86400;
    const payload = Buffer.from(JSON.stringify({ sub: 'abc', exp: futureExp, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
    const token = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;
    config.saveCredentials({ email: 't@t.com', password: 'p', region: 'eu' });
    config.saveToken({
      accessToken: token,
      tokenType: 'Bearer',
      issuedAt: Date.now(),
      expiresAt: futureExp * 1000,
    });
    const auth = new PlaudAuth(config);
    client = new PlaudClient(auth, 'eu');
    mockFetch.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists recordings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 0,
        data_file_list: [
          { id: 'rec1', filename: 'Test', is_trash: false },
          { id: 'rec2', filename: 'Trash', is_trash: true },
        ],
      }),
    });

    const recs = await client.listRecordings();
    expect(recs).toHaveLength(1);
    expect(recs[0].id).toBe('rec1');
  });

  it('gets recording detail with transcript', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 0,
        data: {
          file_id: 'rec1',
          file_name: 'Meeting',
          pre_download_content_list: [
            { data_content: 'Short' },
            { data_content: 'This is the full transcript of the meeting.' },
          ],
        },
      }),
    });

    const detail = await client.getRecording('rec1');
    expect(detail.transcript).toBe('This is the full transcript of the meeting.');
  });

  it('gets user info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 0,
        data_user: { id: 'u1', nickname: 'Sergi', email: 'test@plaud.ai', country: 'ES', membership_type: 'starter' },
      }),
    });

    const user = await client.getUserInfo();
    expect(user.nickname).toBe('Sergi');
  });

  it('handles region mismatch', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: -302,
        data: { domains: { api: 'api-euc1.plaud.ai' } },
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 0,
        data_file_list: [{ id: 'rec1', filename: 'Test', is_trash: false }],
      }),
    });

    const recs = await client.listRecordings();
    expect(recs).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('routes to apne1 on -302 redirect and retries against the Tokyo host', async () => {
    // Client starts on 'eu'; first call must hit the eu host. Second call must hit apne1.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: -302,
        data: { domains: { api: 'https://api-apne1.plaud.ai' } },
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 0,
        data_file_list: [{ id: 'rec1', filename: 'Test', is_trash: false }],
      }),
    });

    await client.listRecordings();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const firstUrl = mockFetch.mock.calls[0][0] as string;
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(firstUrl).toContain('api-euc1.plaud.ai');
    expect(secondUrl).toContain('api-apne1.plaud.ai');
  });

  it('routes bare api.plaud.ai domain back to the us region', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: -302,
        data: { domains: { api: 'api.plaud.ai' } },
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 0,
        data_file_list: [],
      }),
    });

    await client.listRecordings();
    const secondUrl = mockFetch.mock.calls[1][0] as string;
    expect(secondUrl).toMatch(/https:\/\/api\.plaud\.ai/);
  });

  it('throws on redirect loop to the same region', async () => {
    // Construct a client that's already on apne1, then have the server redirect back to apne1.
    const config = new PlaudConfig(tmpDir);
    const auth = new PlaudAuth(config);
    const loopClient = new PlaudClient(auth, 'apne1');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: -302,
        data: { domains: { api: 'https://api-apne1.plaud.ai' } },
      }),
    });

    await expect(loopClient.listRecordings()).rejects.toThrow(/redirect loop/);
  });
});
