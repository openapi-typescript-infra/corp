# notification-internal

Internal notification dispatch via `POST /notifications` or an optional Google
Pub/Sub subscription. Email uses Resend, SMS and approved WhatsApp templates use
Telnyx, and push supports an HTTP webhook or opt-in Expo delivery. This service
has no public ingress, application templates, branding, analytics, or database.

Build with `yarn workspace @justtellme/notification-internal build` and run with
`yarn workspace @justtellme/notification-internal start`. Test with
`yarn workspace @justtellme/notification-internal test --run`.

Configuration lives under `notifications` (see `src/types/config.ts`). Inject
provider keys through deployment secret configuration; do not commit credentials.
The checked-in configuration is empty: missing keys/webhook URLs return `skipped`.
Set `email.resendApiKey` and `email.fromEmail` for email; set `sms.telnyxApiKey`
and `sms.fromNumber` or `sms.messagingProfileId` for SMS. Phone numbers must use
international E.164 format. Optional allowlists match full phone numbers and
case-insensitive email addresses. `sms.dryRun` and `whatsapp.dryRun` skip delivery.

Email callers supply subject and HTML or text. SMS callers supply body. WhatsApp
callers supply a `template` key and `template_data`; configure the corresponding
`whatsapp.templates` entry with an approved `templateName`, ordered
`bodyParameterKeys`, optional language, and optional URL button. URL button values
are passed verbatim as dynamic suffixes; callers must supply the correct suffix.
No template content is bundled. Push defaults to webhook delivery; `expoEnabled`
opts into Expo, including silent/background notifications.

Enable `pubsub.enabled` and set `pubsub.subscription` to consume an existing
subscription in the service's GCP project. Grant the workload subscriber access
separately. Successful dispatches (including skips) are acknowledged; failures
are nacked. The queue uses the same request shape, with dispatcher validation.

`sent` means provider acceptance, not final delivery. `idempotency_id` is forwarded
to Resend's Idempotency-Key header; SMS, WhatsApp, and push have no service-level
deduplication. Pub/Sub redelivery can duplicate those sends. Configure retry and
dead-letter policies on the subscription. HTTP calls time out after 30 seconds.

Example internal request:

```json
{"channel":"sms","sms":{"to":"+12025550123","body":"Your message"}}
```

Provider references: [Resend email API](https://resend.com/docs/api-reference/emails/send-email),
[Telnyx messaging](https://developers.telnyx.com/docs/messaging/messages).
