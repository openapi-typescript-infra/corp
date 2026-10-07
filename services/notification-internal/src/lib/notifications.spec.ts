import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationInternalLocals } from '../types/service.ts';
import { createNotificationDispatcher } from './notifications.ts';

const ctx = {
  app: {
    locals: {
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as NotificationInternalLocals,
  },
};
function dispatcher(notifications: NotificationInternalLocals['config']['notifications']) {
  return createNotificationDispatcher({ notifications } as NotificationInternalLocals['config']);
}
afterEach(() => vi.unstubAllGlobals());
describe('notification providers', () => {
  it('skips SMS dry runs without contacting Telnyx', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(
      await dispatcher({ sms: { telnyxApiKey: 'key', dryRun: true } }).send(ctx, {
        channel: 'sms',
        sms: { to: '+12025550123', body: 'Message' },
      }),
    ).toMatchObject({ status: 'skipped', provider: 'telnyx:dry-run' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves caller-defined webhook push content', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message_id: 'push-id' }));
    vi.stubGlobal('fetch', fetcher);
    const request = {
      channel: 'push' as const,
      push: { token: 'device', title: 'Hello', body: 'Message' },
    };
    expect(
      await dispatcher({ push: { webhookUrl: 'https://example.com/push' } }).send(ctx, request),
    ).toMatchObject({ status: 'sent', provider_message_id: 'push-id' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(request);
  });
  it('uses Expo only when explicitly enabled', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ data: { status: 'ok', id: 'ticket-id' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await dispatcher({ push: { expoEnabled: true } }).send(ctx, {
        channel: 'push',
        push: { token: 'device', silent: true, data: { event: 'refresh' } },
      }),
    ).toMatchObject({ status: 'sent' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      to: 'device',
      _contentAvailable: true,
      data: { event: 'refresh' },
    });
  });

  it('skips delivery when unconfigured', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(
      await dispatcher({}).send(ctx, {
        channel: 'email',
        email: { to: 'user@example.com', subject: 'Hello', text: 'Message' },
      }),
    ).toMatchObject({ status: 'skipped', provider: 'resend:disabled' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends Resend payload and idempotency key', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: 'email-id' }));
    vi.stubGlobal('fetch', fetcher);
    const result = await dispatcher({
      email: { resendApiKey: 'key', fromEmail: 'sender@example.com' },
    }).send(ctx, {
      channel: 'email',
      idempotency_id: 'once',
      email: { to: 'user@example.com', subject: 'Hello', text: 'Message' },
    });
    expect(result).toMatchObject({ status: 'sent', provider_message_id: 'email-id' });
    expect(fetcher.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({
      'Idempotency-Key': 'once',
      Authorization: 'Bearer key',
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
      from: 'sender@example.com',
      text: 'Message',
    });
  });
  it('sends Telnyx SMS and extracts nested message id', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { id: 'sms-id' } }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await dispatcher({ sms: { telnyxApiKey: 'key', fromNumber: '+12025550100' } }).send(ctx, {
        channel: 'sms',
        sms: { to: '+442071838750', body: 'Message' },
      }),
    ).toMatchObject({ status: 'sent', provider_message_id: 'sms-id' });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      from: '+12025550100',
      to: '+442071838750',
      text: 'Message',
    });
  });
  it('matches full international numbers in allowlists', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(
      await dispatcher({ sms: { telnyxApiKey: 'key', allowlist: ['+12025550123'] } }).send(ctx, {
        channel: 'sms',
        sms: { to: '+442025550123', body: 'Message' },
      }),
    ).toMatchObject({ status: 'skipped' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects invalid phone numbers and empty SMS bodies', async () => {
    const service = dispatcher({ sms: { telnyxApiKey: 'key' } });
    await expect(
      service.send(ctx, { channel: 'sms', sms: { to: '2025550123', body: 'Message' } }),
    ).rejects.toThrow('valid phone');
    await expect(
      service.send(ctx, { channel: 'sms', sms: { to: '+12025550123', body: '' } }),
    ).rejects.toThrow('sms.body');
  });
  it('reports provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ error: 'failed' }, { status: 429 })),
    );
    await expect(
      dispatcher({ sms: { telnyxApiKey: 'key', fromNumber: '+12025550100' } }).send(ctx, {
        channel: 'sms',
        sms: { to: '+12025550123', body: 'Message' },
      }),
    ).rejects.toThrow('telnyx provider failed');
  });
  it('uses caller-configured WhatsApp variables without application content', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { id: 'wa-id' } }));
    vi.stubGlobal('fetch', fetcher);
    const service = dispatcher({
      whatsapp: {
        telnyxApiKey: 'key',
        fromNumber: '+12025550100',
        templates: {
          notice: {
            templateName: 'approved_notice',
            bodyParameterKeys: ['name'],
            urlButton: { parameterKey: 'suffix' },
          },
        },
      },
    });
    await service.send(ctx, {
      channel: 'whatsapp',
      whatsapp: { to: '+12025550123' },
      template: 'notice',
      template_data: { name: 'Alex', suffix: 'abc123' },
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body).whatsapp_message.template).toMatchObject({
      name: 'approved_notice',
      components: [
        { type: 'body', parameters: [{ type: 'text', text: 'Alex' }] },
        { type: 'button', parameters: [{ type: 'text', text: 'abc123' }] },
      ],
    });
    await expect(
      service.send(ctx, {
        channel: 'whatsapp',
        whatsapp: { to: '+12025550123' },
        template: 'notice',
      }),
    ).rejects.toThrow('template_data.name');
  });
});
