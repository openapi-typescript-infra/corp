export const ExternalIDType = {
  // The consumer identifier of an individual person
  Consumer: 'c',
  // A group of individuals or groups
  Group: 'g',
  // An individual person
  Individual: 'i',
  // A financial transaction
  Transaction: 'tx',
  // A line item on a transaction (aka a split)
  TransactionSplit: 'spl',
  // A ledger account
  LedgerAccount: 'la',
  // A ledger transfer
  LedgerTransfer: 'lt',
  // A ledger entry
  LedgerEntry: 'le',
} as const;
export type ExternalIDType = (typeof ExternalIDType)[keyof typeof ExternalIDType];
