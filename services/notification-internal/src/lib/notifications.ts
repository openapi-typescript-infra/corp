import { randomUUID } from 'node:crypto';
import { ServiceError } from '@openapi-typescript-infra/service';
import type { components } from '../generated/service/index.ts';
import type { NotificationInternalLocals } from '../types/service.ts';

type NotificationRequest = components['schemas']['NotificationRequest'];
type NotificationResult = components['schemas']['NotificationResult'];
type NotificationChannel = components['schemas']['NotificationChannel'];

type NotificationContext = {
  app: {
    locals: NotificationInternalLocals;
  };
};

export interface NotificationDispatcher {
  send(ctx: NotificationContext, request: NotificationRequest): Promise<NotificationResult>;
}

interface ProviderResponse {
  provider: string;
  provider_message_id?: string;
  skipped?: boolean;
}

interface NotificationProvider {
  send(ctx: NotificationContext, request: NotificationRequest): Promise<ProviderResponse>;
}

class WebhookProvider implements NotificationProvider {
  private readonly provider: 'push';
  private readonly config: { webhookUrl?: string; authorization?: string } | undefined;

  constructor(
    provider: 'push',
    config: { webhookUrl?: string; authorization?: string } | undefined,
  ) {
    this.provider = provider;
    this.config = config;
  }

  async send(ctx: NotificationContext, request: NotificationRequest): Promise<ProviderResponse> {
    if (!this.config?.webhookUrl) {
      return { provider: `${this.provider}:disabled` };
    }

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.authorization ? { Authorization: this.config.authorization } : {}),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      ctx.app.locals.logger.warn(
        { provider: this.provider, status: response.status, body },
        'Notification provider failed',
      );
      throw new ServiceError(ctx.app, `${this.provider} provider failed`, {
        status: 502,
      });
    }

    const body = await response.json().catch(() => undefined);
    return {
      provider: this.provider,
      provider_message_id: extractProviderMessageId(body),
    };
  }
}

class ExpoPushProvider implements NotificationProvider {
  private readonly config: { expoAccessToken?: string; expoApiBaseUrl?: string } | undefined;

  constructor(config: { expoAccessToken?: string; expoApiBaseUrl?: string } | undefined) {
    this.config = config;
  }

  async send(ctx: NotificationContext, request: NotificationRequest): Promise<ProviderResponse> {
    if (!request.push) {
      throw new ServiceError(ctx.app, 'push payload is required for push notifications', {
        status: 400,
      });
    }
    if (!request.push.silent && (!request.push.title || !request.push.body)) {
      throw new ServiceError(ctx.app, 'visible push notifications require a title and body', {
        status: 400,
      });
    }
    const response = await fetch(
      this.config?.expoApiBaseUrl || 'https://exp.host/--/api/v2/push/send',
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(this.config?.expoAccessToken
            ? { Authorization: `Bearer ${this.config.expoAccessToken}` }
            : {}),
        },
        body: JSON.stringify(
          request.push.silent
            ? {
                to: request.push.token,
                data: request.push.data,
                _contentAvailable: true,
                priority: 'high',
              }
            : {
                to: request.push.token,
                title: request.push.title,
                body: request.push.body,
                data: request.push.data,
                sound: request.push.sound ?? 'default',
                ...(request.push.channel_id ? { channelId: request.push.channel_id } : {}),
                ...(request.push.priority ? { priority: request.push.priority } : {}),
                ...(request.push.interruption_level
                  ? { interruptionLevel: request.push.interruption_level }
                  : {}),
                ...(request.push.tag ? { tag: request.push.tag } : {}),
                ...(request.push.thread_id ? { threadId: request.push.thread_id } : {}),
              },
        ),
      },
    );
    const body = (await response.json().catch(() => undefined)) as
      | {
          data?: { status?: string; id?: string; message?: string; details?: unknown };
          errors?: unknown;
        }
      | undefined;
    if (!response.ok || body?.data?.status === 'error' || !body?.data?.id) {
      ctx.app.locals.logger.warn(
        { provider: 'expo', status: response.status, response: body },
        'Expo push provider failed',
      );
      throw new ServiceError(ctx.app, 'push provider failed', { status: 502 });
    }
    return { provider: 'expo', provider_message_id: body.data.id };
  }
}

class ResendEmailProvider implements NotificationProvider {
  private readonly allowlist: Set<string>;
  private readonly config:
    | {
        resendApiKey?: string;
        fromEmail?: string;
        replyTo?: string;
        apiBaseUrl?: string;
        allowlist?: string[];
      }
    | undefined;

  constructor(
    config:
      | {
          resendApiKey?: string;
          fromEmail?: string;
          replyTo?: string;
          apiBaseUrl?: string;
          allowlist?: string[];
        }
      | undefined,
  ) {
    this.config = config;
    this.allowlist = new Set((config?.allowlist ?? []).map(normalizeEmail).filter(Boolean));
  }

  async send(ctx: NotificationContext, request: NotificationRequest): Promise<ProviderResponse> {
    if (!request.email) {
      throw new ServiceError(ctx.app, 'email payload is required for email notifications', {
        status: 400,
      });
    }
    if (!this.config?.resendApiKey) {
      return { provider: 'resend:disabled' };
    }

    const from = request.email.from ?? this.config.fromEmail;
    if (!from) {
      throw new ServiceError(ctx.app, 'email.from or notifications.email.fromEmail is required', {
        status: 400,
      });
    }
    if (!request.email.html && !request.email.text) {
      throw new ServiceError(ctx.app, 'email.html or email.text is required', { status: 400 });
    }
    if (!request.email.subject) {
      throw new ServiceError(ctx.app, 'email.subject is required', {
        status: 400,
      });
    }

    // Dev safety: when an allowlist is configured, only deliver to listed
    // addresses; everything else is logged and skipped so test sends never
    // reach real people.
    if (this.allowlist.size > 0 && !this.allowlist.has(normalizeEmail(request.email.to))) {
      ctx.app.locals.logger.info(
        { provider: 'resend', to: request.email.to, subject: request.email.subject },
        'Email suppressed: recipient not on dev allowlist',
      );
      return { provider: 'resend:not-allowlisted', skipped: true };
    }

    const replyTo = request.email.reply_to ?? this.config.replyTo;
    const response = await fetch(`${this.config.apiBaseUrl ?? 'https://api.resend.com'}/emails`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${this.config.resendApiKey}`,
        'Content-Type': 'application/json',
        ...(request.idempotency_id ? { 'Idempotency-Key': request.idempotency_id } : {}),
      },
      body: JSON.stringify({
        from,
        to: request.email.to,
        subject: request.email.subject,
        ...(request.email.html ? { html: request.email.html } : {}),
        ...(request.email.text ? { text: request.email.text } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      ctx.app.locals.logger.warn(
        { provider: 'resend', status: response.status, body },
        'Notification provider failed',
      );
      throw new ServiceError(ctx.app, 'resend provider failed', {
        status: 502,
      });
    }

    return {
      provider: 'resend',
      provider_message_id: extractProviderMessageId(body),
    };
  }
}

class TelnyxSmsProvider implements NotificationProvider {
  private readonly allowlist: Set<string>;
  private readonly config:
    | {
        telnyxApiKey?: string;
        fromNumber?: string;
        messagingProfileId?: string;
        apiBaseUrl?: string;
        allowlist?: string[];
        dryRun?: boolean;
      }
    | undefined;

  constructor(
    config:
      | {
          telnyxApiKey?: string;
          fromNumber?: string;
          messagingProfileId?: string;
          apiBaseUrl?: string;
          allowlist?: string[];
          dryRun?: boolean;
        }
      | undefined,
  ) {
    this.config = config;
    this.allowlist = new Set((config?.allowlist ?? []).map(normalizePhone).filter(Boolean));
  }

  async send(ctx: NotificationContext, request: NotificationRequest): Promise<ProviderResponse> {
    if (!request.sms) {
      throw new ServiceError(ctx.app, 'sms payload is required for sms notifications', {
        status: 400,
      });
    }
    if (!this.config?.telnyxApiKey) {
      return { provider: 'telnyx:disabled' };
    }

    // Require international E.164 numbers; do not assume a country.
    const to = normalizePhoneE164(request.sms.to);
    if (!to) {
      ctx.app.locals.logger.warn(
        { provider: 'telnyx', to: request.sms.to },
        'SMS rejected: recipient is not a valid phone number',
      );
      throw new ServiceError(ctx.app, 'sms.to is not a valid phone number', { status: 400 });
    }

    if (this.config.dryRun) {
      ctx.app.locals.logger.info(
        { provider: 'telnyx', event_type: request.event_type },
        'SMS dry run: delivery skipped',
      );
      return { provider: 'telnyx:dry-run', skipped: true };
    }

    // Dev safety: when an allowlist is configured, only deliver to listed numbers;
    // everything else is logged and skipped so test sends never reach real people.
    if (this.allowlist.size > 0 && !this.allowlist.has(normalizePhone(to))) {
      ctx.app.locals.logger.info(
        { provider: 'telnyx' },
        'SMS suppressed: recipient not on dev allowlist',
      );
      return { provider: 'telnyx:not-allowlisted', skipped: true };
    }

    const from = request.sms.from ?? this.config.fromNumber;
    const messagingProfileId = request.sms.messaging_profile_id ?? this.config.messagingProfileId;
    if (!from && !messagingProfileId) {
      throw new ServiceError(
        ctx.app,
        'sms.from or notifications.sms.messagingProfileId is required',
        { status: 400 },
      );
    }

    const response = await fetch(
      `${this.config.apiBaseUrl ?? 'https://api.telnyx.com'}/v2/messages`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${this.config.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to,
          text: request.sms.body,
          ...(from ? { from } : {}),
          ...(messagingProfileId ? { messaging_profile_id: messagingProfileId } : {}),
        }),
      },
    );

    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      ctx.app.locals.logger.warn(
        { provider: 'telnyx', status: response.status, body },
        'Notification provider failed',
      );
      throw new ServiceError(ctx.app, 'telnyx provider failed', {
        status: 502,
      });
    }

    return {
      provider: 'telnyx',
      provider_message_id: extractProviderMessageId(body),
    };
  }
}

class TelnyxWhatsAppProvider implements NotificationProvider {
  private readonly allowlist: Set<string>;
  private readonly config: NotificationInternalLocals['config']['notifications']['whatsapp'];

  constructor(config: NotificationInternalLocals['config']['notifications']['whatsapp']) {
    this.config = config;
    this.allowlist = new Set((config?.allowlist ?? []).map(normalizePhone).filter(Boolean));
  }

  async send(ctx: NotificationContext, request: NotificationRequest): Promise<ProviderResponse> {
    if (!request.whatsapp) {
      throw new ServiceError(ctx.app, 'whatsapp payload is required for whatsapp notifications', {
        status: 400,
      });
    }
    const to = normalizePhoneE164(request.whatsapp.to);
    if (!to) {
      throw new ServiceError(ctx.app, 'whatsapp.to is not a valid phone number', { status: 400 });
    }
    if (!request.template) {
      throw new ServiceError(ctx.app, 'whatsapp notifications require an approved template', {
        status: 400,
      });
    }

    const template =
      this.config?.templates?.[request.template as keyof NonNullable<typeof this.config.templates>];
    const from = request.whatsapp.from ?? this.config?.fromNumber;
    if (!this.config?.telnyxApiKey || !from || !template?.templateName) {
      return { provider: 'telnyx:whatsapp:disabled' };
    }
    if (this.config.dryRun) {
      ctx.app.locals.logger.info(
        { provider: 'telnyx:whatsapp', to, template: request.template },
        'WhatsApp dry run: logged instead of sent',
      );
      return { provider: 'telnyx:whatsapp:dry-run', skipped: true };
    }
    if (this.allowlist.size > 0 && !this.allowlist.has(normalizePhone(to))) {
      return { provider: 'telnyx:whatsapp:not-allowlisted', skipped: true };
    }

    const data = request.template_data ?? {};
    const bodyParameters = template.bodyParameterKeys.map((key) => ({
      type: 'text',
      text: requiredTemplateValue(ctx, data[key], key),
    }));
    const components: Array<Record<string, unknown>> = [];
    if (bodyParameters.length > 0) {
      components.push({ type: 'body', parameters: bodyParameters });
    }
    if (template.urlButton) {
      const value = data[template.urlButton.parameterKey];
      const suffix = requiredTemplateValue(ctx, value, template.urlButton.parameterKey);
      components.push({
        type: 'button',
        sub_type: 'url',
        index: template.urlButton.index ?? 0,
        parameters: [{ type: 'text', text: suffix }],
      });
    }
    const response = await fetch(
      `${this.config.apiBaseUrl ?? 'https://api.telnyx.com'}/v2/messages/whatsapp`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          Authorization: `Bearer ${this.config.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          whatsapp_message: {
            type: 'template',
            template: {
              name: template.templateName,
              language: {
                policy: 'deterministic',
                code: template.language ?? 'en_US',
              },
              ...(components.length > 0 ? { components } : {}),
            },
          },
        }),
      },
    );
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      ctx.app.locals.logger.warn(
        { provider: 'telnyx:whatsapp', status: response.status, body },
        'Notification provider failed',
      );
      throw new ServiceError(ctx.app, 'telnyx whatsapp provider failed', { status: 502 });
    }
    return {
      provider: 'telnyx:whatsapp',
      provider_message_id: extractProviderMessageId(body),
    };
  }
}

export function createNotificationDispatcher(
  config: NotificationInternalLocals['config'],
): NotificationDispatcher {
  const providers: Record<NotificationChannel, NotificationProvider> = {
    email: new ResendEmailProvider(config.notifications.email),
    sms: new TelnyxSmsProvider(config.notifications.sms),
    push: config.notifications.push?.expoEnabled
      ? new ExpoPushProvider(config.notifications.push)
      : new WebhookProvider('push', config.notifications.push),
    whatsapp: new TelnyxWhatsAppProvider(config.notifications.whatsapp),
  };
  return {
    async send(ctx, request) {
      if (!request || !Object.hasOwn(providers, request.channel) || !request[request.channel]) {
        throw new ServiceError(ctx.app, 'A supported channel and its payload are required', {
          status: 400,
        });
      }
      if (request.channel === 'sms' && !request.sms?.body?.trim()) {
        throw new ServiceError(ctx.app, 'sms.body is required', { status: 400 });
      }
      const result = await providers[request.channel].send(ctx, request);
      const response: NotificationResult = {
        notification_uuid: request.notification_uuid ?? randomUUID(),
        idempotency_id: request.idempotency_id,
        channel: request.channel,
        status: result.skipped || result.provider.endsWith(':disabled') ? 'skipped' : 'sent',
        provider: result.provider,
        provider_message_id: result.provider_message_id,
      };
      ctx.app.locals.logger.info(response, 'Notification dispatched');
      return response;
    },
  };
}

function normalizePhoneE164(value: string): string | undefined {
  const phone = value.trim();
  return /^\+[1-9]\d{1,14}$/.test(phone) ? phone : undefined;
}
function normalizePhone(value: string): string {
  return value.trim();
}
function requiredTemplateValue(ctx: NotificationContext, value: unknown, key: string): string {
  if (value == null || String(value).trim() === '') {
    throw new ServiceError(ctx.app, `template_data.${key} is required`, { status: 400 });
  }
  return String(value);
}

/** Trim and lowercase an email for case-insensitive allowlist matching. */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function extractProviderMessageId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string') {
    return data.id;
  }
  if (typeof record.id === 'string') {
    return record.id;
  }
  if (typeof record.message_id === 'string') {
    return record.message_id;
  }
  return undefined;
}
