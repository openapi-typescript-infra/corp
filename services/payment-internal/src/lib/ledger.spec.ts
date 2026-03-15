import { describe, it, expect } from 'vitest';

import {
  Ledger,
  TransactionBuilder,
  validateTransaction,
  resolveDestinations,
  resolveSources,
  buildTransferMatrix,
} from './ledger.ts';

import type { PaymentInternal } from '#src/types/service.ts';

// ── Validation ──────────────────────────────────────────────────────────────

describe('validateTransaction', () => {
  it('rejects no sources', () => {
    expect(() => validateTransaction([], [{ account: 'a', portion: 'remaining' }])).toThrow(
      'At least one source',
    );
  });

  it('rejects no destinations', () => {
    expect(() => validateTransaction([{ account: 'a' }], [])).toThrow('At least one destination');
  });

  it('rejects multiple remaining destinations', () => {
    expect(() =>
      validateTransaction(
        [{ account: 'a' }],
        [
          { account: 'b', portion: 'remaining' },
          { account: 'c', portion: 'remaining' },
        ],
      ),
    ).toThrow('Only one destination can use "remaining"');
  });

  it('rejects portions not summing to 1', () => {
    expect(() =>
      validateTransaction(
        [{ account: 'a' }],
        [
          { account: 'b', portion: 0.5 },
          { account: 'c', portion: 0.3 },
        ],
      ),
    ).toThrow('must sum to 1');
  });

  it('rejects portions exceeding 1', () => {
    expect(() =>
      validateTransaction(
        [{ account: 'a' }],
        [
          { account: 'b', portion: 0.6 },
          { account: 'c', portion: 0.6 },
        ],
      ),
    ).toThrow('must sum to 1');
  });

  it('rejects portion <= 0', () => {
    expect(() => validateTransaction([{ account: 'a' }], [{ account: 'b', portion: 0 }])).toThrow(
      'Portion must be between',
    );
  });

  it('rejects portion > 1', () => {
    expect(() => validateTransaction([{ account: 'a' }], [{ account: 'b', portion: 1.5 }])).toThrow(
      'Portion must be between',
    );
  });

  it('accepts portions summing to 1', () => {
    expect(() =>
      validateTransaction(
        [{ account: 'a' }],
        [
          { account: 'b', portion: 0.9 },
          { account: 'c', portion: 0.1 },
        ],
      ),
    ).not.toThrow();
  });

  it('accepts portions with remaining', () => {
    expect(() =>
      validateTransaction(
        [{ account: 'a' }],
        [
          { account: 'b', portion: 0.85 },
          { account: 'c', portion: 'remaining' },
        ],
      ),
    ).not.toThrow();
  });

  it('accepts single remaining destination', () => {
    expect(() =>
      validateTransaction([{ account: 'a' }], [{ account: 'b', portion: 'remaining' }]),
    ).not.toThrow();
  });

  it('rejects fixed portions that leave nothing for remaining', () => {
    expect(() =>
      validateTransaction(
        [{ account: 'a' }],
        [
          { account: 'b', portion: 1 },
          { account: 'c', portion: 'remaining' },
        ],
      ),
    ).toThrow('leaving nothing for "remaining"');
  });
});

// ── Destination resolution ──────────────────────────────────────────────────

describe('resolveDestinations', () => {
  it('single destination gets full amount', () => {
    const result = resolveDestinations(1000, [{ account: 'a', portion: 'remaining' }]);
    expect(result).toEqual([{ account: 'a', amount: 1000 }]);
  });

  it('exact 90/10 split', () => {
    const result = resolveDestinations(1000, [
      { account: 'a', portion: 0.9 },
      { account: 'b', portion: 0.1 },
    ]);
    expect(result).toEqual([
      { account: 'a', amount: 900 },
      { account: 'b', amount: 100 },
    ]);
  });

  it('85% + remaining', () => {
    const result = resolveDestinations(1000, [
      { account: 'a', portion: 0.85 },
      { account: 'b', portion: 'remaining' },
    ]);
    expect(result).toEqual([
      { account: 'a', amount: 850 },
      { account: 'b', amount: 150 },
    ]);
  });

  it('three-way split 1/3 + 1/3 + remaining', () => {
    const result = resolveDestinations(1000, [
      { account: 'a', portion: 1 / 3 },
      { account: 'b', portion: 1 / 3 },
      { account: 'c', portion: 'remaining' },
    ]);
    // floor(1000 * 1/3) = 333 each, remaining = 334
    expect(result).toEqual([
      { account: 'a', amount: 333 },
      { account: 'b', amount: 333 },
      { account: 'c', amount: 334 },
    ]);
  });

  it('three-way equal split uses largest-remainder', () => {
    const result = resolveDestinations(100, [
      { account: 'a', portion: 1 / 3 },
      { account: 'b', portion: 1 / 3 },
      { account: 'c', portion: 1 / 3 },
    ]);
    // floor(33.33) = 33 each = 99, leftover = 1
    // All have same fractional part, first one gets the extra cent
    const total = result.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(100);
    expect(result.map((r) => r.amount).sort()).toEqual([33, 33, 34]);
  });

  it('handles odd amounts with 50/50', () => {
    const result = resolveDestinations(101, [
      { account: 'a', portion: 0.5 },
      { account: 'b', portion: 0.5 },
    ]);
    const total = result.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(101);
    expect(result[0].amount + result[1].amount).toBe(101);
  });

  it('complex marketplace split', () => {
    // $599.99 = 59999 cents: 85% driver, 10% platform, 5% insurance
    const result = resolveDestinations(59999, [
      { account: 'driver', portion: 0.85 },
      { account: 'platform', portion: 0.1 },
      { account: 'insurance', portion: 0.05 },
    ]);
    const total = result.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(59999);
  });
});

// ── Source resolution ───────────────────────────────────────────────────────

describe('resolveSources', () => {
  it('single source gets full amount', () => {
    const result = resolveSources(1000, 'USD', [{ account: 'a' }]);
    expect(result).toEqual([{ account: 'a', amount: 1000 }]);
  });

  it('multi-source with max', () => {
    const result = resolveSources(1000, 'USD', [{ account: 'a', max: 600 }, { account: 'b' }]);
    expect(result).toEqual([
      { account: 'a', amount: 600 },
      { account: 'b', amount: 400 },
    ]);
  });

  it('max exceeding needed amount', () => {
    const result = resolveSources(100, 'USD', [{ account: 'a', max: 500 }]);
    expect(result).toEqual([{ account: 'a', amount: 100 }]);
  });

  it('three sources with max constraints', () => {
    const result = resolveSources(1000, 'USD', [
      { account: 'a', max: 300 },
      { account: 'b', max: 300 },
      { account: 'c' },
    ]);
    expect(result).toEqual([
      { account: 'a', amount: 300 },
      { account: 'b', amount: 300 },
      { account: 'c', amount: 400 },
    ]);
  });

  it('throws when sources insufficient', () => {
    expect(() =>
      resolveSources(1000, 'USD', [
        { account: 'a', max: 300 },
        { account: 'b', max: 200 },
      ]),
    ).toThrow('500 USD short');
  });

  it('skips sources with 0 contribution', () => {
    const result = resolveSources(100, 'USD', [{ account: 'a', max: 100 }, { account: 'b' }]);
    // b contributes 0, should not appear
    expect(result).toEqual([{ account: 'a', amount: 100 }]);
  });
});

// ── Transfer matrix ─────────────────────────────────────────────────────────

describe('buildTransferMatrix', () => {
  it('1 source → 1 destination', () => {
    const result = buildTransferMatrix(
      1000,
      [{ account: 'alice', amount: 1000 }],
      [{ account: 'store', amount: 1000 }],
    );
    expect(result).toEqual([{ fromAccount: 'alice', toAccount: 'store', amount: 1000 }]);
  });

  it('1 source → 2 destinations', () => {
    const result = buildTransferMatrix(
      1000,
      [{ account: 'alice', amount: 1000 }],
      [
        { account: 'store', amount: 900 },
        { account: 'fees', amount: 100 },
      ],
    );
    expect(result).toEqual([
      { fromAccount: 'alice', toAccount: 'store', amount: 900 },
      { fromAccount: 'alice', toAccount: 'fees', amount: 100 },
    ]);
  });

  it('2 sources → 1 destination', () => {
    const result = buildTransferMatrix(
      1000,
      [
        { account: 'wallet', amount: 600 },
        { account: 'backup', amount: 400 },
      ],
      [{ account: 'store', amount: 1000 }],
    );
    expect(result).toEqual([
      { fromAccount: 'wallet', toAccount: 'store', amount: 600 },
      { fromAccount: 'backup', toAccount: 'store', amount: 400 },
    ]);
  });

  it('2 sources → 2 destinations (proportional split)', () => {
    const result = buildTransferMatrix(
      1000,
      [
        { account: 'wallet', amount: 600 },
        { account: 'backup', amount: 400 },
      ],
      [
        { account: 'store', amount: 900 },
        { account: 'fees', amount: 100 },
      ],
    );
    // wallet(600): store gets floor(900/1000 * 600)=540, fees gets 60
    // backup(400): store gets floor(900/1000 * 400)=360, fees gets 40
    expect(result).toEqual([
      { fromAccount: 'wallet', toAccount: 'store', amount: 540 },
      { fromAccount: 'wallet', toAccount: 'fees', amount: 60 },
      { fromAccount: 'backup', toAccount: 'store', amount: 360 },
      { fromAccount: 'backup', toAccount: 'fees', amount: 40 },
    ]);
  });

  it('preserves total across matrix', () => {
    const result = buildTransferMatrix(
      999,
      [
        { account: 'wallet', amount: 500 },
        { account: 'backup', amount: 499 },
      ],
      [
        { account: 'store', amount: 849 },
        { account: 'fees', amount: 150 },
      ],
    );
    const total = result.reduce((s, t) => s + t.amount, 0);
    expect(total).toBe(999);
  });
});

// ── Builder API ─────────────────────────────────────────────────────────────

describe('TransactionBuilder', () => {
  const noop = async () => new Map();
  const fakeApp = {} as unknown as PaymentInternal['App'];

  it('rejects non-integer amounts', () => {
    expect(() => new TransactionBuilder(fakeApp, noop, 'USD', 99.5)).toThrow('positive integer');
  });

  it('rejects zero amount', () => {
    expect(() => new TransactionBuilder(fakeApp, noop, 'USD', 0)).toThrow('positive integer');
  });

  it('rejects negative amount', () => {
    expect(() => new TransactionBuilder(fakeApp, noop, 'USD', -100)).toThrow('positive integer');
  });
});

describe('Ledger', () => {
  const fakeApp = {} as unknown as PaymentInternal['App'];
  it('transfer() returns a TransactionBuilder', () => {
    const ledger = new Ledger(fakeApp);
    const builder = ledger.transfer('USD', 100);
    expect(builder).toBeInstanceOf(TransactionBuilder);
  });

  it('send() returns a TransactionBuilder', () => {
    const ledger = new Ledger(fakeApp);
    const builder = ledger.send('USD', 100);
    expect(builder).toBeInstanceOf(TransactionBuilder);
  });
});
