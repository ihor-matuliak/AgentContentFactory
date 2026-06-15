import type { Agent, ChatMessage } from "@swarm/shared";
import { generateAgentReply } from "./conversational.js";

/**
 * Обробник чату: бере агента, історію переписки й нове повідомлення
 * користувача — повертає текст відповіді агента.
 */
export type ChatHandler = (
  agent: Agent,
  history: ChatMessage[],
  userMessage: string,
  projectId: number,
) => Promise<string>;

/**
 * Спільний рушій діалогу для всіх агентів.
 *
 * Особистість («характер») кожного агента береться з його системного промпту
 * в базі (db/seed.sql) — тут жодних захардкоджених характерів немає.
 */
const conversationalHandler: ChatHandler = (agent, history, userMessage, projectId) =>
  generateAgentReply(agent, history, userMessage, projectId);

/**
 * Реєстр чату: зіставляє slug агента з обробником.
 *
 * Зараз усі 8 агентів спілкуються через спільний conversationalHandler.
 * Якщо в окремого агента колись зʼявиться особлива логіка (інструменти,
 * доступ до файлів, інтеграції) — додаємо для його slug окремий обробник тут,
 * не чіпаючи решту рою.
 */
const handlers: Record<string, ChatHandler> = {
  // strategist: conversationalHandler, ← приклад явного запису (необовʼязково)
};

/** Повертає обробник для агента; типово — спільний conversational-рушій. */
export function getChatHandler(slug: string): ChatHandler {
  return handlers[slug] ?? conversationalHandler;
}
