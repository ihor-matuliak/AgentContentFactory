import { Router } from "express";
import {
  listEvents,
  markAllEventsRead,
  markEventRead,
  unreadEventCount,
} from "../journal.js";
import { getProjectId } from "./projectScope.js";

export const eventsRouter = Router();

/** GET /api/events?projectId=N — сповіщення проєкту + кількість непрочитаних. */
eventsRouter.get("/", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  const [items, unread] = await Promise.all([
    listEvents(projectId),
    unreadEventCount(projectId),
  ]);
  res.json({ items, unread });
});

/** GET /api/events/unread-count?projectId=N — лічильник для бічного меню. */
eventsRouter.get("/unread-count", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  res.json({ unread: await unreadEventCount(projectId) });
});

/** POST /api/events/read-all?projectId=N — позначити всі прочитаними. */
eventsRouter.post("/read-all", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  await markAllEventsRead(projectId);
  res.json({ unread: 0 });
});

/** POST /api/events/:id/read — позначити одне прочитаним. */
eventsRouter.post("/:id/read", async (req, res) => {
  const projectId = await getProjectId(req);
  if (projectId === null) {
    res.status(400).json({ error: "Потрібен валідний projectId" });
    return;
  }
  await markEventRead(Number(req.params.id));
  res.json({ unread: await unreadEventCount(projectId) });
});
