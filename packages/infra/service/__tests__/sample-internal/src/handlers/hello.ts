import type { JTMServiceRequest, JTMServiceResponse } from '../../../../src/types.ts';

export const get = (req: JTMServiceRequest, res: JTMServiceResponse) => {
  res.json({
    greeting: 'Hello World',
  });
};

export const post = (req: JTMServiceRequest, res: JTMServiceResponse) => {
  res.json({
    ua: req.headers['user-agent'],
  });
};
