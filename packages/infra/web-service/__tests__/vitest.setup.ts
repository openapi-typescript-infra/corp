export function setup() {
  process.env.APP_ENV = process.env.APP_ENV || 'test';
  process.env.COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || '';
  process.env.STYTCH_TOKEN = process.env.STYTCH_TOKEN || '';
}
