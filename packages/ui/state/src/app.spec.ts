import { describe, it, expect, beforeEach } from 'vitest';

import { app$, setStytch, type StytchUserInput, type StytchSessionInput } from './app.ts';

describe('app$', () => {
  beforeEach(() => {
    app$.set({
      loaded: false,
      auth: { initialized: false, user: null, hasSession: false },
    });
  });

  it('has correct initial state', () => {
    expect(app$.get()).toEqual({
      loaded: false,
      auth: { initialized: false, user: null, hasSession: false },
    });
  });
});

describe('setStytch', () => {
  beforeEach(() => {
    app$.set({
      loaded: false,
      auth: { initialized: false, user: null, hasSession: false },
    });
  });

  it('sets auth as initialized with user and session', () => {
    const user: StytchUserInput = {
      user_id: 'u-123',
      emails: [{ email: 'alice@example.com' }],
      name: { first_name: 'Alice', last_name: 'Smith' },
    };
    const session: StytchSessionInput = { session_id: 's-456' };

    setStytch(user, session);

    const auth = app$.auth.get();
    expect(auth.initialized).toBe(true);
    expect(auth.hasSession).toBe(true);
    expect(auth.user).toEqual({
      userId: 'u-123',
      emails: ['alice@example.com'],
      name: 'Alice Smith',
    });
  });

  it('maps multiple emails', () => {
    const user: StytchUserInput = {
      user_id: 'u-1',
      emails: [{ email: 'a@b.com' }, { email: 'c@d.com' }],
      name: { first_name: 'A', last_name: 'B' },
    };

    setStytch(user, { session_id: 's-1' });

    expect(app$.auth.user.get()?.emails).toEqual(['a@b.com', 'c@d.com']);
  });

  it('sets name to undefined when both parts are empty', () => {
    const user: StytchUserInput = {
      user_id: 'u-1',
      emails: [{ email: 'x@y.com' }],
      name: { first_name: '', last_name: '' },
    };

    setStytch(user, { session_id: 's-1' });

    expect(app$.auth.user.get()?.name).toBeUndefined();
  });

  it('handles first name only', () => {
    const user: StytchUserInput = {
      user_id: 'u-1',
      emails: [{ email: 'x@y.com' }],
      name: { first_name: 'Alice', last_name: '' },
    };

    setStytch(user, { session_id: 's-1' });

    expect(app$.auth.user.get()?.name).toBe('Alice');
  });

  it('clears user when null is passed', () => {
    setStytch(
      {
        user_id: 'u-1',
        emails: [{ email: 'a@b.com' }],
        name: { first_name: 'A', last_name: 'B' },
      },
      { session_id: 's-1' },
    );
    expect(app$.auth.user.get()).not.toBeNull();

    setStytch(null, null);

    expect(app$.auth.user.get()).toBeNull();
    expect(app$.auth.hasSession.get()).toBe(false);
    expect(app$.auth.initialized.get()).toBe(true);
  });
});
