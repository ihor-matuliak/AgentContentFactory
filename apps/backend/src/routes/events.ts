import { Router } from "express";
import {
  listEvents,
  markAllEventsRead,
  markEventRead,
  unreadEventCount,
} from "../journal.js";

export const eventsRouter = Router();

/** GET /api/events — останні сповіщення + кількість непрочитаних. */
eventsRouter.get("/", async (_req, res) => {
  const [items, unread] = await Promise.all([listEvents(), unreadEventCount()]);
  res.json({ items, unread });
});

/** GET /api/events/unread-count — лічильник для бічного меню. */
eventsRouter.get("/unread-count", async (_req, res) => {
  res.json({ unread: await unreadEventCount() });
});

/** POST /api/events/read-all — позначити всі прочитаними. */
eventsRouter.post("/read-all", async (_req, res) => {
  await markAllEventsRead();
  res.json({ unread: 0 });
});

/** POST /api/events/:id/read — позначити одне прочитаним. */
eventsRouter.post("/:id/read", async (req, res) => {
  await markEventRead(Number(req.params.id));
  res.json({ unread: await unreadEventCount() });
});
