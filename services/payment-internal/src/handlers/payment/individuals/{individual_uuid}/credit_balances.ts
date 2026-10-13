import { sql } from 'kysely';
import type { PaymentInternalApi } from '#src/types/service.ts';

export const GET: PaymentInternalApi['getCreditBalances'] = async (req, res) => {
  const { individual_uuid } = req.params;
  const { currency, scope_uuid } = req.query;
  let query = req.app.locals.db
    .selectFrom('credit_accounts')
    .select(['currency', 'scope_uuid', sql<string>`balance::text`.as('balance')])
    .where('individual_uuid', '=', individual_uuid);

  if (currency !== undefined) query = query.where('currency', '=', currency);
  if (scope_uuid !== undefined) query = query.where('scope_uuid', '=', scope_uuid);

  const balances = await query
    .orderBy('currency')
    .orderBy('scope_uuid', (order) => order.asc().nullsFirst())
    .execute();
  res.setHeader('Cache-Control', 'no-store');
  res.json({ individual_uuid, balances });
};
