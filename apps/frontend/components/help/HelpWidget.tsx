'use client';

// Help chat panel. Mounted ONCE in the root layout so the conversation survives
// client-side navigation between pages — it only resets when the user closes it.
//
// The assistant is read-only guidance: it explains where things are and how to do
// them, based on a per-role manual living in the backend. It never performs
// actions on the user's behalf. History is NOT persisted anywhere; the full
// conversation is re-sent on every request to keep context within the session.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HelpCircle, X, Send, Loader2 } from 'lucide-react';
import { subscribeHelpChat, closeHelpChat } from './helpChatStore';
import { showToast } from '@/components/ui/Toaster';

type ChatRole = 'user' | 'assistant';
interface ChatMessage {
  id: number;
  role: ChatRole;
  content: string;
}

const MAX_INPUT_CHARS = 4000;

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Bridge the global open/close store into local state.
  useEffect(() => subscribeHelpChat(setOpen), []);

  // Reset the conversation whenever the panel is closed (no history kept).
  // Aborting the in-flight request prevents a late reply from re-populating the
  // freshly-cleared conversation once the panel reopens.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setMessages([]);
      setInput('');
      setLoading(false);
    } else {
      // Focus the input shortly after the panel mounts/opens.
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Keep the latest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  if (!open) return null;

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = { id: nextId.current++, role: 'user', content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/help/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });
      const data: { reply?: string; error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo obtener respuesta.');
      }
      const reply = (data.reply || '').trim() || 'No tengo una respuesta para eso ahora mismo.';
      setMessages((prev) => [...prev, { id: nextId.current++, role: 'assistant', content: reply }]);
    } catch (error: unknown) {
      // The panel was closed mid-request — the conversation is already cleared.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message =
        error instanceof Error ? error.message : 'Ocurrió un problema al consultar la ayuda.';
      showToast({ type: 'error', message });
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: 'assistant',
          content:
            'Lo siento, hubo un problema al procesar tu consulta. Intenta de nuevo en unos segundos.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      className="fixed inset-x-0 bottom-0 z-[60] flex flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(34rem,80vh)] sm:w-[26rem] sm:rounded-2xl h-[85vh] rounded-t-2xl"
    >
      {/* Header */}
      <header className="flex items-center gap-3 bg-gradient-to-r from-teal-500 to-cyan-600 px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <HelpCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="help-dialog-title" className="text-sm font-semibold leading-tight">
            Asistente de ayuda
          </p>
          <p className="truncate text-xs text-white/80">Te guío por Delta Salud</p>
        </div>
        <button
          type="button"
          onClick={() => closeHelpChat()}
          aria-label="Cerrar ayuda"
          className="rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.length === 0 && <WelcomeCard />}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Escribiendo…</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-teal-300">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_CHARS))}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Escribe tu pregunta…"
            className="max-h-28 flex-1 resize-none bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={loading || !input.trim()}
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-slate-400">
          Solo respondo sobre el uso de la plataforma y no ejecuto acciones por ti. No ingreses
          datos de pacientes en este chat.
        </p>
      </div>
    </div>
  );
}

function WelcomeCard() {
  return (
    <div className="rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-800">¡Hola! 👋</p>
      <p className="mt-1 text-sm text-slate-600">
        Soy tu asistente de Delta Salud. Pregúntame cómo hacer cualquier acción o dónde encontrar
        una sección y te guío paso a paso.
      </p>
    </div>
  );
}

function MessageBubble({ role, content }: { role: ChatRole; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl rounded-br-md bg-teal-500 px-3.5 py-2.5 text-sm text-white'
            : 'max-w-[85%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-sm'
        }
      >
        {isUser ? <span className="whitespace-pre-wrap">{content}</span> : renderRichText(content)}
      </div>
    </div>
  );
}

// Minimal, safe markdown-lite renderer for assistant replies. Builds React nodes
// directly (no dangerouslySetInnerHTML): supports headings, bullets and **bold**.
function renderRichText(content: string): ReactNode {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((rawLine, i) => {
        const line = rawLine.trimEnd();
        if (line.trim() === '') return <div key={i} className="h-1" />;

        const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
        if (headingMatch) {
          return (
            <p key={i} className="text-sm font-semibold text-slate-800">
              {renderInline(headingMatch[2])}
            </p>
          );
        }

        const bulletMatch = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bulletMatch) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-teal-400" />
              <span className="flex-1">{renderInline(bulletMatch[1])}</span>
            </div>
          );
        }

        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): ReactNode {
  // Split on **bold** segments, keeping the captured groups.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      return (
        <strong key={i} className="font-semibold text-slate-800">
          {bold[1]}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
