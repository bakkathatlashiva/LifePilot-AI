import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Loader2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import api from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type?: 'text' | 'task_created';
  task?: Record<string, unknown>;
}

const SUGGESTED_PROMPTS = [
  "Show my assignments closing tomorrow",
  "What exams do I have this week?",
  "Which tasks are overdue?",
  "How many assignments are pending?",
  "Remind me to complete my project on Friday",
  "Create a study plan for tomorrow",
  "Show important emails from today",
];

export function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: "Hi! I'm your LifePilot AI assistant. I have access to your real tasks, deadlines, and emails. Ask me anything about your schedule, or tell me to create a task. What can I help you with today?",
      timestamp: new Date(),
      type: 'text',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text?: string) => {
    const message = text ?? input.trim();
    if (!message || loading) return;

    setInput('');
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const { data } = await api.post('/ai/chat', { message });
      const res = data.data;

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.message,
        timestamp: new Date(),
        type: res.type,
        task: res.task,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: err.response?.data?.message ?? 'Sorry, I ran into an error. Please try again.',
          timestamp: new Date(),
          type: 'text',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 animate-fade-in h-[calc(100dvh-5.5rem)] md:h-[calc(100vh-8rem)] flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-900/30 flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-white">AI Assistant</h1>
          <p className="text-slate-400 text-xs">Answers using your real task & email data</p>
        </div>
      </div>

      {/* Suggested prompts (Horizontal scroll on mobile) */}
      {messages.length <= 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1 touch-pan-x flex-nowrap sm:flex-wrap">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="px-3.5 py-2 bg-dark-900 border border-white/10 rounded-xl text-xs sm:text-sm text-slate-300
                         hover:text-white hover:border-purple-500/40 active:scale-95 transition-all duration-200 whitespace-nowrap min-h-[38px] flex-shrink-0"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <Card padding="none" className="flex-1 overflow-y-auto min-w-0">
        <div className="p-3.5 sm:p-5 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 sm:gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                msg.role === 'assistant'
                  ? 'bg-gradient-to-br from-purple-600 to-blue-600'
                  : 'bg-slate-700'
              }`}>
                {msg.role === 'assistant'
                  ? <Sparkles className="w-4 h-4 text-white" />
                  : <User className="w-4 h-4 text-slate-300" />}
              </div>

              {/* Bubble */}
              <div className={`max-w-[88%] sm:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white rounded-tr-sm'
                    : 'bg-dark-800 text-slate-200 rounded-tl-sm border border-white/5'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Task created card */}
                  {msg.type === 'task_created' && msg.task && (
                    <div className="mt-3 p-3 bg-emerald-500/15 border border-emerald-500/25 rounded-xl">
                      <p className="text-emerald-400 text-xs font-semibold">✅ Task Created</p>
                      <p className="text-emerald-300 text-xs mt-1">{String(msg.task.title)}</p>
                    </div>
                  )}
                </div>
                <p className="text-[10px] sm:text-xs text-slate-500 mt-1 px-1">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-dark-800 rounded-2xl rounded-tl-sm px-4 py-3 border border-white/5">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </Card>

      {/* Input */}
      <div className="flex gap-2 sm:gap-3">
        <textarea
          className="flex-1 bg-dark-900 border border-white/10 rounded-2xl px-3.5 sm:px-4 py-3 text-slate-100 placeholder-slate-500
                     focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20
                     transition-all duration-200 resize-none text-base sm:text-sm min-h-[48px] max-h-[120px]"
          placeholder="Ask me anything... (Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="min-h-[48px] min-w-[48px] rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center justify-center text-white transition-all duration-200 active:scale-95 flex-shrink-0 self-end shadow-md shadow-purple-900/40"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
