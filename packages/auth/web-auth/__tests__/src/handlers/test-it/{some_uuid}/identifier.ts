import type { JTMServiceRequest } from '@justtellme/service';
import type { Response } from 'express';

export const get = async (req: JTMServiceRequest, res: Response) => {
  res.sendStatus(204);
};
