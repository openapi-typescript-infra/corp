// "provider" session should expire every 1 days (per stricter HIPAA rules)
export const PROVIDER_APP_SESSION_TIMEOUT_MS = 1000 * 60 * 60 * 24;
// "consumer" session should expire every 7 days
export const CONSUMER_APP_SESSION_TIMEOUT_MS = 1000 * 60 * 60 * 24 * 7;
