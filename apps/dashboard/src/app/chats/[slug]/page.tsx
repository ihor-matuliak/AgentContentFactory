"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { AgentSummary, ChatMessage } from "@swarm/shared";
import { api } from "@/lib/api";
import { AgentBadge, StatusBadge } from "@/components/ui";
import { ArrowLeftIcon, PlayIcon, SendIcon } from "@/components/icons";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const isStrategist = slug === "strategist";

  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [agentList, history] = await Promise.all([
          api.listAgents(),
          api.getHistory(slug),
        ]);
        if (!alive) return;
        setAgent(agentList.find((a) => a.slug === slug) ?? null);
        setMessages(history);
      } catch (e: unknown) {
        if (alive)
          setError(e instanceof Error ? e.message : "Не вдалося завантажити чат");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending, scrollToBottom]);

  // Авторозмір текстового поля.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  async function handleSend(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setError(null);
    setSending(true);

    // Оптимістично показуємо повідомлення користувача.
    const optimistic: ChatMessage = {
      id: -Date.now(),
      agentId: agent?.id ?? 0,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await api.sendMessage(slug, text);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        res.userMessage,
        res.reply,
      ]);
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      setError(
        err instanceof Error ? err.message : "Не вдалося надіслати повідомлення",
      );
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // Запуск прогону рою прямо з чату зі Стратегом: ціль = текст у полі або
  // останнє повідомлення користувача.
  async function launchRun() {
    if (launching) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const goalText = input.trim() || lastUser?.content?.trim() || "";
    if (!goalText) {
      setError("Напиши ціль у полі або в повідомленні — і я запущу прогін.");
      return;
    }
    setLaunching(true);
    setError(null);
    try {
      const run = await api.createRun(goalText);
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося запустити прогін");
      setLaunching(false);
    }
  }

  const agentName = agent?.name ?? "Агент";

  return (
    <div className="flex h-dvh flex-col">
      {/* Шапка чату */}
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-base)]/70 px-6 py-4 backdrop-blur md:px-8">
        <Link
          href="/chats"
          aria-label="Назад до списку чатів"
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeftIcon />
        </Link>
        <AgentBadge name={agentName} />
        <div className="min-w-0">
          <div className="font-display text-[16px] font-semibold leading-tight">
            {agentName}
          </div>
          {agent ? (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[var(--color-fg-muted)]">
                {agent.role}
              </span>
              <span className="text-[var(--color-border-strong)]">•</span>
              <StatusBadge status={agent.status} />
            </div>
          ) : (
            <span className="text-[12px] text-[var(--color-fg-subtle)]">
              {loading ? "Завантаження…" : "Невідомий агент"}
            </span>
          )}
        </div>
      </header>

      {/* Стрічка повідомлень */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6 md:px-8"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {loading && (
            <p className="py-10 text-center text-[14px] text-[var(--color-fg-subtle)]">
              Завантажуємо історію…
            </p>
          )}

          {!loading && messages.length === 0 && (
            <div className="mx-auto max-w-md py-12 text-center">
              <AgentBadge name={agentName} />
              <h2 className="mt-4 font-display text-lg font-semibold">
                Почніть розмову зі {agentName === "Стратег" ? "Стратегом" : agentName}
              </h2>
              <p className="mt-2 text-[14px] text-[var(--color-fg-muted)]">
                {agent?.role ??
                  "Поставте задачу — і агент допоможе її спланувати."}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} agentName={agentName} />
          ))}

          {sending && <TypingBubble agentName={agentName} />}
        </div>
      </div>

      {/* Поле вводу */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-base)]/70 px-4 py-4 backdrop-blur md:px-8">
        <form onSubmit={handleSend} className="mx-auto max-w-3xl">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-[13px] text-[var(--color-danger)]"
            >
              {error}
            </p>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 focus-within:border-[var(--color-honey)]/50">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={`Напишіть ${agentName === "Стратег" ? "Стратегу" : agentName}…`}
              className="max-h-[180px] flex-1 resize-none bg-transparent px-3 py-2 text-[14px] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Надіслати"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-honey)] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-honey-bright)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-2)] disabled:text-[var(--color-fg-subtle)]"
            >
              <SendIcon width={18} height={18} />
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-[var(--color-fg-subtle)]">
              Enter — надіслати · Shift+Enter — новий рядок
            </p>
            {isStrategist && (
              <button
                type="button"
                onClick={launchRun}
                disabled={launching}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-honey)]/40 px-3 py-1.5 text-[12px] font-medium text-[var(--color-honey)] transition-colors hover:bg-[var(--color-honey)]/10 disabled:opacity-60"
                title="Створити прогін рою з цієї цілі"
              >
                <PlayIcon width={13} height={13} />
                {launching ? "Запускаю…" : "Запустити прогін рою"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/** Стилі markdown-елементів у відповідях агентів (під дизайн-систему). */
const mdComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--color-fg)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => (
    <h1 className="mb-2 mt-1 font-display text-[17px] font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-1 font-display text-[16px] font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-1 font-display text-[15px] font-semibold">{children}</h3>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-honey)] underline underline-offset-2 hover:text-[var(--color-honey-bright)]"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = (className ?? "").includes("language-");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-base)] p-3 font-mono text-[12.5px] leading-relaxed">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-[var(--color-base)] px-1.5 py-0.5 font-mono text-[12.5px] text-[var(--color-honey)]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[var(--color-honey)]/50 pl-3 text-[var(--color-fg-muted)]">
      {children}
    </blockquote>
  ),
};

function MessageBubble({
  message,
  agentName,
}: {
  message: ChatMessage;
  agentName: string;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={[
        "flex animate-rise gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      ].join(" ")}
    >
      {!isUser && <AgentBadge name={agentName} />}
      <div className={isUser ? "max-w-[80%]" : "max-w-[80%]"}>
        <div
          className={[
            "rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed",
            isUser
              ? "whitespace-pre-wrap rounded-br-md bg-[var(--color-honey)] text-[var(--color-ink)]"
              : "rounded-bl-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg)]",
          ].join(" ")}
        >
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        <div
          className={[
            "mt-1 px-1 font-mono text-[10px] text-[var(--color-fg-subtle)]",
            isUser ? "text-right" : "text-left",
          ].join(" ")}
        >
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function TypingBubble({ agentName }: { agentName: string }) {
  return (
    <div className="flex animate-rise gap-3">
      <AgentBadge name={agentName} />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--color-honey)]"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}
