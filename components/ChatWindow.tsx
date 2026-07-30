"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  senderRole: "CUSTOMER" | "MANAGER";
  body: string;
  createdAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  mode: "CUSTOMER" | "MANAGER";
  title: string;
  userId?: string;
  managerPassword?: string;
  onRead?: () => void;
};

function messageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

export default function ChatWindow({ open, onClose, mode, title, userId, managerPassword, onRead }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const onReadRef = useRef(onRead);

  useEffect(() => { onReadRef.current = onRead; }, [onRead]);

  const headers = useCallback((): Record<string, string> => mode === "MANAGER"
    ? { "x-manager-password": managerPassword || "" }
    : {}, [mode, managerPassword]);

  const loadMessages = useCallback(async (silent = false) => {
    if (!open || (mode === "MANAGER" && !userId)) return;
    if (!silent) setLoading(true);
    try {
      const url = mode === "MANAGER"
        ? `/api/manager/chat?userId=${encodeURIComponent(userId || "")}&markRead=1`
        : "/api/chat?markRead=1";
      const response = await fetch(url, { headers: headers(), cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось открыть чат");
      setMessages(data.messages || []);
      setError("");
      onReadRef.current?.();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось открыть чат");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [open, mode, userId, headers]);

  useEffect(() => {
    if (!open) return;
    void loadMessages();
    const timer = window.setInterval(() => void loadMessages(true), 5000);
    return () => window.clearInterval(timer);
  }, [open, loadMessages]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(mode === "MANAGER" ? "/api/manager/chat" : "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify(mode === "MANAGER" ? { userId, text: clean } : { text: clean })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Не удалось отправить сообщение");
      setText("");
      await loadMessages(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;
  const ownRole = mode;

  return (
    <div className="modal-backdrop chat-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="chat-window" role="dialog" aria-modal="true" aria-label={title}>
        <header className="chat-header">
          <div><span className="eyebrow">Сообщения</span><h2>{title}</h2></div>
          <button type="button" className="chat-close" aria-label="Закрыть чат" onClick={onClose}>×</button>
        </header>
        <div className="chat-messages">
          {loading && !messages.length && <p className="chat-empty">Загружаем переписку…</p>}
          {!loading && !messages.length && <p className="chat-empty">Сообщений пока нет. Начните переписку.</p>}
          {messages.map((message) => {
            const own = message.senderRole === ownRole;
            return (
              <article key={message.id} className={`chat-bubble ${own ? "chat-own" : "chat-other"}`}>
                <strong>{message.senderRole === "MANAGER" ? "Администратор" : "Клиент"}</strong>
                <p>{message.body}</p>
                <time>{messageTime(message.createdAt)}</time>
              </article>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {error && <p className="form-error chat-error">{error}</p>}
        <form className="chat-composer" onSubmit={sendMessage}>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} placeholder="Напишите сообщение…" />
          <button type="submit" disabled={!text.trim() || sending}>{sending ? "Отправляем…" : "Отправить"}</button>
        </form>
      </section>
    </div>
  );
}
