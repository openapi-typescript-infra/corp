import { sql } from 'kysely';

import type { PaymentInternalApi } from '#src/types/service.ts';
import type { LedgerTransfer } from '#src/lib/ledger.ts';
import { toTransactionResponse } from '#src/lib/serialize.ts';

export const POST: PaymentInternalApi['createTransaction'] = async (req, res) => {
  const { transfers, idempotency_id, individual_uuid, event_at, metadata } = req.body;
  const db = req.app.locals.db;

  // Check for idempotency conflict before creating
  const existingTx = await db
    .selectFrom('transactions')
    .selectAll()
    .where('idempotency_id', '=', idempotency_id)
    .executeTakeFirst();

  if (existingTx) {
    const existingTransfers = await db
      .selectFrom('transfers_view')
      .selectAll()
      .where('transaction_id', '=', existingTx.transaction_id)
      .orderBy('transfer_id')
      .execute();

    res.status(409).json(toTransactionResponse(existingTx, existingTransfers as LedgerTransfer[]));
    return;
  }

  // Resolve account names → IDs
  const uniqueNames = [...new Set(transfers.flatMap((t) => [t.from_account, t.to_account]))];
  const accountRows = await db
    .selectFrom('accounts')
    .select(['account_id', 'name'])
    .where(sql`name::text`, 'in', uniqueNames)
    .execute();

  const accountMap = new Map(accountRows.map((r) => [String(r.name), r.account_id]));
  const missing = uniqueNames.filter((n) => !accountMap.has(n));
  if (missing.length > 0) {
    res.sendStatus(400);
    return;
  }

  const transferRequests = transfers.map((t) => {
    const fromId = accountMap.get(t.from_account);
    const toId = accountMap.get(t.to_account);
    return sql`ROW(${fromId}::uuid, ${toId}::uuid, ${t.amount}::numeric, ${t.idempotency_id ?? null})::TRANSFER_REQUEST`;
  });

  const transferArray = sql.join(transferRequests, sql`, `);
  const eventAtSql = event_at ? sql`${event_at}::timestamptz` : sql`NULL::timestamptz`;
  const metaSql = metadata ? sql`${JSON.stringify(metadata)}::jsonb` : sql`NULL::jsonb`;
  const individualSql = individual_uuid ? sql`${individual_uuid}::uuid` : sql`NULL::uuid`;

  const result = await sql<LedgerTransfer>`
    SELECT * FROM pgledger_create_transfers(
      transfer_requests => ARRAY[${transferArray}],
      event_at => ${eventAtSql},
      metadata => ${metaSql},
      idempotency_id => ${idempotency_id},
      individual_uuid => ${individualSql},
      transaction_id => NULL::uuid
    )
  `.execute(db);

  const resultTransfers = result.rows;
  if (resultTransfers.length === 0) {
    res.sendStatus(400);
    return;
  }

  const txId = resultTransfers[0].transaction_id;
  const tx = await db
    .selectFrom('transactions')
    .selectAll()
    .where('transaction_id', '=', txId)
    .executeTakeFirstOrThrow();

  res.status(201).json(toTransactionResponse(tx, resultTransfers));
};

export const GET: PaymentInternalApi['getTransactions'] = async (req, res) => {
  const { idempotency_id, individual_uuid } = req.query;
  const db = req.app.locals.db;

  if (!idempotency_id && !individual_uuid) {
    res.sendStatus(404);
    return;
  }

  let query = db.selectFrom('transactions').selectAll();
  if (idempotency_id) {
    query = query.where('idempotency_id', '=', idempotency_id);
  }
  if (individual_uuid) {
    query = query.where('individual_uuid', '=', individual_uuid);
  }

  const txRows = await query.execute();

  if (txRows.length === 0) {
    res.sendStatus(404);
    return;
  }

  const txIds = txRows.map((t) => t.transaction_id);
  const transferRows = await db
    .selectFrom('transfers_view')
    .selectAll()
    .where('transaction_id', 'in', txIds)
    .orderBy('transfer_id')
    .execute();

  const transfersByTx = new Map<string, LedgerTransfer[]>();
  for (const t of transferRows) {
    const txId = t.transaction_id as string;
    if (!transfersByTx.has(txId)) {
      transfersByTx.set(txId, []);
    }
    (transfersByTx.get(txId) as LedgerTransfer[]).push(t as LedgerTransfer);
  }

  res.json({
    transactions: txRows.map((tx) =>
      toTransactionResponse(tx, transfersByTx.get(tx.transaction_id) ?? []),
    ),
  });
};
