import type { Response } from 'express';
import type { HSServiceRequest } from '@justtellme/service';

export const get = async (req: HSServiceRequest, res: Response) => {
  res.sendStatus(204);
};
