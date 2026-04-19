import type { HSServiceRequest } from '@justtellme/service';
import type { Response } from 'express';

export const get = async (req: HSServiceRequest, res: Response) => {
  res.sendStatus(204);
};
