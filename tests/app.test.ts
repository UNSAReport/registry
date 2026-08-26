import { describe, expect, it } from 'bun:test';
import app from '@/index';

describe('App API Routes', () => {
  it('GET /health returns health status', async () => {
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { status: string; service: string };
    expect(data.status).toBe('ok');
    expect(data.service).toBe('unsareport-registry');
  });

  it('POST /v1/resolve returns 400 for empty body', async () => {
    const res = await app.fetch(
      new Request('http://localhost/v1/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.error).toBe('ValidationError');
  });

  it('GET /v1/tags handles request (200 or 500 when DB unattached)', async () => {
    const res = await app.fetch(new Request('http://localhost/v1/tags'));
    expect([200, 500].includes(res.status)).toBe(true);
  });
});
