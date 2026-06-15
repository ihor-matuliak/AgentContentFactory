"use client";

import { useEffect, useState } from "react";
import type { HealthResponse, AiModel } from "@swarm/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui";
import { AccountIcon, LockIcon, SparkIcon } from "@/components/icons";

export default function AccountPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [down, setDown] = useState(false);
  const [hasPw, setHasPw] = useState(false);

  // Стан для керування моделлю ШІ
  const [activeModel, setActiveModel] = useState<AiModel>("claude-sonnet-4-6");
  const [loadingModel, setLoadingModel] = useState(true);
  const [updatingModel, setUpdatingModel] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error">("success");

  useEffect(() => {
    api
      .health()
      .then(setHealth)
      .catch(() => setDown(true));
    setHasPw(api.hasPassword());

    // Завантаження активної моделі
    api
      .getSettings()
      .then((res) => {
        setActiveModel(res.activeModel);
        setLoadingModel(false);
      })
      .catch((err) => {
        console.error("Не вдалося завантажити налаштування моделі:", err);
        setLoadingModel(false);
      });
  }, []);

  async function handleModelChange(model: AiModel) {
    setUpdatingModel(true);
    setStatusMsg("");
    try {
      const res = await api.updateSettings({ activeModel: model });
      setActiveModel(res.activeModel);
      setStatusType("success");
      setStatusMsg(`Модель успішно змінено на ${model === "claude-sonnet-4-6" ? "Claude 3.5 Sonnet" : "Gemini 3.1 Flash Lite"}.`);
    } catch (err: any) {
      console.error(err);
      setStatusType("error");
      setStatusMsg(err.message || "Не вдалося зберегти налаштування моделі ШІ.");
    } finally {
      setUpdatingModel(false);
    }
  }

  function logout() {
    api.setPassword("");
    window.location.reload();
  }

  return (
    <>
      <PageHeader
        title="Акаунт"
        subtitle="Стан платформи та доступ. Командний центр рою ШІ-агентів фабрики контенту."
      />

      <div className="mx-auto max-w-3xl space-y-4 px-6 py-7 md:px-10">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <AccountIcon width={18} height={18} className="text-[var(--color-honey)]" />
            Стан бекенду
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-[13px]">
            <span
              className={`h-2 w-2 rounded-full ${down ? "bg-[var(--color-danger)]" : "bg-[var(--color-online)]"}`}
              style={down ? undefined : { boxShadow: "0 0 8px var(--color-online)" }}
            />
            <span className="text-[var(--color-fg-muted)]">
              {down ? "Бекенд недоступний" : "Бекенд онлайн"}
            </span>
            {health && (
              <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-fg-subtle)]">
                {health.service}
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-[11px] text-[var(--color-fg-subtle)]">
            {api.backendUrl}
          </p>
        </div>

        {/* Глобальний вибір моделі ШІ */}
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <SparkIcon width={18} height={18} className="text-[var(--color-honey)]" />
            Активна ШІ-модель
          </div>
          <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
            Оберіть модель ШІ для всієї системи. Усі чати з агентами та прогони рою будуть виконуватись через обрану активну модель.
          </p>

          {loadingModel ? (
            <div className="mt-4 text-[13px] text-[var(--color-fg-subtle)] font-mono">
              Завантаження налаштувань...
            </div>
          ) : (
            <div className="mt-4">
              <select
                value={activeModel}
                onChange={(e) => handleModelChange(e.target.value as AiModel)}
                disabled={updatingModel}
                className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-2.5 text-[14px] font-medium text-[var(--color-fg)] transition-all outline-none focus:border-[var(--color-honey)] focus:ring-1 focus:ring-[var(--color-honey)] disabled:opacity-50"
              >
                <option value="claude-sonnet-4-6">Claude 3.5 Sonnet 4.6</option>
                <option value="gemini-3-1-flash-lite">Gemini 3.1 Flash Lite</option>
              </select>
            </div>
          )}

          {statusMsg && (
            <div className={`mt-3 text-[12px] font-medium ${statusType === "error" ? "text-[var(--color-danger)]" : "text-[var(--color-online)]"}`}>
              {statusMsg}
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex items-center gap-2 text-[14px] font-semibold">
            <LockIcon width={18} height={18} className="text-[var(--color-honey)]" />
            Доступ
          </div>
          <p className="mt-2 text-[13px] text-[var(--color-fg-muted)]">
            {hasPw
               ? "Дашборд захищено паролем — він збережений у цьому браузері."
               : "Авторизацію вимкнено (SWARM_PASSWORD порожній)."}
          </p>
          {hasPw && (
            <button
              onClick={logout}
              className="mt-4 rounded-xl border border-[var(--color-border-strong)] px-4 py-2 text-[13px] font-medium text-[var(--color-fg-muted)] transition-colors hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)]"
            >
              Вийти
            </button>
          )}
        </div>
      </div>
    </>
  );
}
