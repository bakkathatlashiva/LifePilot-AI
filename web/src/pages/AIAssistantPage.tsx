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
    <div className="space-y-4 animate-fade-in h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">AI Assistant</h1>
          <p className="text-slate-500 text-xs">Answers using your real task & email data</p>
        </div>
      </div>

      {/* Suggested prompts */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="px-3 py-1.5 bg-dark-900 border border-white/10 rounded-xl text-sm text-slate-400
                         hover:text-slate-200 hover:border-purple-500/30 transition-all duration-200"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <Card padding="none" className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
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
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white rounded-tr-sm'
                    : 'bg-dark-800 text-slate-200 rounded-tl-sm border border-white/5'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Task created card */}
                  {msg.type === 'task_created' && msg.task && (
                    <div className="mt-3 p-3 bg-emerald-500/15 border border-emerald-500/25 rounded-xl">
                      <p className="text-emerald-400 text-xs font-medium">✅ Task Created</p>
                      <p className="text-emerald-300 text-xs mt-1">{String(msg.task.title)}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 px-1">
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
                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </Card>

      {/* Input */}
      <div className="flex gap-3">
        <textarea
          className="flex-1 bg-dark-900 border border-white/10 rounded-2xl px-4 py-3 text-slate-100 placeholder-slate-500
                     focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/20
                     transition-all duration-200 resize-none text-sm min-h-[50px] max-h-[120px]"
          placeholder="Ask me anything... (Enter to send, Shift+Enter for new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="w-12 h-12 rounded-2xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center justify-center text-white transition-all duration-200 active:scale-95 flex-shrink-0 self-end"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
