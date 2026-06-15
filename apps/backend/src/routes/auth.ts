import { Router, type NextFunction, type Request, type Response } from "express";
import type { AuthStatusResponse, LoginRequest } from "@swarm/shared";
import { env } from "../env.js";

export const authRouter = Router();

/** Чи ввімкнено захист паролем (SWARM_PASSWORD не порожній). */
export function authEnabled(): boolean {
  return env.swarmPassword !== "";
}

/** GET /api/auth — чи потрібен пароль для доступу до дашборда. */
authRouter.get("/", (_req, res) => {
  const body: AuthStatusResponse = { required: authEnabled() };
  res.json(body);
});

/** POST /api/auth/login — перевірка пароля. */
authRouter.post("/login", (req, res) => {
  const body = req.body as Partial<LoginRequest>;
  const ok = !authEnabled() || body.password === env.swarmPassword;
  if (!ok) {
    res.status(401).json({ error: "Невірний пароль" });
    return;
  }
  res.json({ ok: true });
});

/**
 * Middleware захисту API. Якщо SWARM_PASSWORD порожній — пропускає всіх.
 * Інакше вимагає заголовок `x-swarm-password` із правильним паролем.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled()) {
    next();
    return;
  }
  const provided = req.header("x-swarm-password");
  if (provided === env.swarmPassword) {
    next();
    return;
  }
  res.status(401).json({ error: "Потрібна авторизація" });
}
