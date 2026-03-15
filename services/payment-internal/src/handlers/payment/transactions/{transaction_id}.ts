import { getUuidFromString, ExternalIDType } from '@justtellme/external-id';

import type { PaymentInternalApi } from '#src/types/service.ts';
import type { LedgerTransfer } from '#src/lib/ledger.ts';
import { toTransactionResponse } from '#src/lib/serialize.ts';

export const GET: PaymentInternalApi['getTransaction'] = async (req, res) => {
  const uuid = getUuidFromString(req.params.transaction_id, ExternalIDType.Transaction);
  if (!uuid) {
    res.sendStatus(400);
    return;
  }

  const db = req.app.locals.db;

  const tx = await db
    .selectFrom('transactions')
    .selectAll()
    .where('transaction_id', '=', uuid)
    .executeTakeFirst();

  if (!tx) {
    res.sendStatus(404);
    return;
  }

  const transfers = await db
    .selectFrom('transfers_view')
    .selectAll()
    .where('transaction_id', '=', uuid)
    .orderBy('transfer_id')
    .execute();

  res.json(toTransactionResponse(tx, transfers as LedgerTransfer[]));
};
