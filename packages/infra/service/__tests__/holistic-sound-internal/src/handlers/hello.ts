import type { HSServiceRequest, HSServiceResponse } from '../../../../src/types.ts';

export const get = (req: HSServiceRequest, res: HSServiceResponse) => {
  res.json({
    greeting: 'Hello World',
  });
};

export const post = (req: HSServiceRequest, res: HSServiceResponse) => {
  res.json({
    ua: req.headers['user-agent'],
  });
};
