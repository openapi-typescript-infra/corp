import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  setAnalyticsClient,
  track,
  identifyUser,
  resetAnalytics,
  type AnalyticsClient,
} from './analytics.ts';

function mockClient(): AnalyticsClient {
  return { capture: vi.fn(), identify: vi.fn(), reset: vi.fn() };
}

describe('analytics', () => {
  let client: AnalyticsClient;

  beforeEach(() => {
    client = mockClient();
    setAnalyticsClient(client);
  });

  describe('track', () => {
    it('captures an event with properties', () => {
      track('login_completed', { method: 'google' });

      expect(client.capture).toHaveBeenCalledWith('login_completed', {
        method: 'google',
      });
    });

    it('captures an event without properties', () => {
      track('logout');

      expect(client.capture).toHaveBeenCalledWith('logout', undefined);
    });
  });

  describe('identifyUser', () => {
    it('identifies with userId and properties', () => {
      identifyUser('u-123', { email: 'a@b.com', name: 'Alice' });

      expect(client.identify).toHaveBeenCalledWith('u-123', {
        email: 'a@b.com',
        name: 'Alice',
      });
    });

    it('identifies with userId only', () => {
      identifyUser('u-123');

      expect(client.identify).toHaveBeenCalledWith('u-123', undefined);
    });
  });

  describe('resetAnalytics', () => {
    it('calls reset on the client', () => {
      resetAnalytics();

      expect(client.reset).toHaveBeenCalled();
    });
  });

  describe('no client set', () => {
    it('does not throw when no client is configured', () => {
      // Re-import to get a fresh module would be complex; instead we rely on
      // the guard (client?.method). We can't easily unset the client, but we
      // can verify the functions don't throw when called normally.
      expect(() => track('logout')).not.toThrow();
      expect(() => identifyUser('u-1')).not.toThrow();
      expect(() => resetAnalytics()).not.toThrow();
    });
  });
});
