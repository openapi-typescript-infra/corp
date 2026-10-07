import type { NotificationInternalApi } from '#src/types/index.ts';

export const POST: NotificationInternalApi['sendNotification'] = async (req, res) => {
  const result = await req.app.locals.notifications.send(req, req.body);
  res.status(202).json(result);
};
