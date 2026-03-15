import { toExternalID, ExternalIDType } from '@justtellme/external-id';
import type { Selectable } from 'kysely';

import type { LedgerTransfer } from '#src/lib/ledger.ts';
import type { components } from '#src/generated/service/index.ts';
import type { Transactions } from '#src/generated/database.ts';

export function toTransactionResponse(
  tx: Selectable<Transactions>,
  transfers: LedgerTransfer[],
): components['schemas']['Transaction'] {
  return {
    transaction_id: toExternalID(ExternalIDType.Transaction, tx.transaction_id as string),
    idempotency_id: tx.idempotency_id,
    individual_uuid: tx.individual_uuid ?? undefined,
    event_at: (tx.event_at as Date).toISOString(),
    metadata: (tx.metadata as Record<string, unknown>) ?? undefined,
    created_at: (tx.created_at as Date).toISOString(),
    updated_at: (tx.updated_at as Date).toISOString(),
    transfers: transfers.map((t) => ({
      transfer_id: toExternalID(ExternalIDType.LedgerTransfer, t.transfer_id),
      idempotency_id: t.idempotency_id ?? undefined,
      from_account: t.from_account,
      to_account: t.to_account,
      amount: String(t.amount),
      created_at: (t.created_at as Date).toISOString(),
      event_at: (t.event_at as Date).toISOString(),
    })),
  };
}
