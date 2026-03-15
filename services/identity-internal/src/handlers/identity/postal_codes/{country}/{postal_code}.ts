import type { IdentityInternalApi } from '#src/types/service.ts';

export const GET: IdentityInternalApi['getPostalCode'] = async (req, res) => {
  // For now, only US postal codes are supported
  if (req.params.country !== 'US') {
    res.sendStatus(404);
    return;
  }

  // Postal code lookup will be implemented when us-postal-codes dependency is added
  res.sendStatus(404);
};
