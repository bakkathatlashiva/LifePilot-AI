import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, Check, X, Edit, Sparkles, CheckCircle2, AlertCircle, ExternalLink, ShieldCheck } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { SuggestedTask, Email } from '../types';
import api, { API_BASE_URL } from '../lib/api';
import { formatRelative } from '../lib/utils';

export function GmailPage() {
  const [activeTab, setActiveTab] = useState<'suggestions' | 'emails'>('suggestions');
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestedTask | null>(null);
  const [editForm, setEditForm] = useState({ title: '', deadline: '' });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sugRes, emailRes, statusRes] = await Promise.all([
        api.get('/gmail/suggestions'),
        api.get('/gmail/emails?pageSize=50'),
        api.get('/gmail/status'),
      ]);
      setSuggestions(sugRes.data.data ?? []);
      setEmails(emailRes.data.data ?? []);
      setStatus(statusRes.data.data);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post('/gmail/sync');
      setTimeout(fetchAll, 4000);
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectGmail = () => {
    const returnTo = encodeURIComponent(`${window.location.origin}/gmail`);
    window.location.href = `${API_BASE_URL}/auth/google/gmail?returnTo=${returnTo}`;
  };

  const approveSuggestion = async (id: string, overrides?: Record<string, unknown>) => {
    try {
      await api.post(`/gmail/suggestions/${id}/approve`, overrides ?? {});
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Failed to approve');
    }
  };

  const rejectSuggestion = async (id: string) => {
    try {
      await api.post(`/gmail/suggestions/${id}/reject`);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch { }
  };

  const openEdit = (s: SuggestedTask) => {
    setEditingSuggestion(s);
    setEditForm({
      title: s.title,
      deadline: s.suggestedDueDate ? new Date(s.suggestedDueDate).toISOString().slice(0, 16) : '',
    });
  };

  const isConnected = !!status?.account?.isActive;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gmail Intelligence</h1>
          <p className="text-slate-500 text-sm mt-1">Live monitoring & AI analysis for your real academic mailbox</p>
        </div>
        <div className="flex gap-2">
          {isConnected ? (
            <Button onClick={handleSync} loading={syncing} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Sync Mailbox Now
            </Button>
          ) : (
            <Button onClick={handleConnectGmail} leftIcon={<Mail className="w-4 h-4" />}>
              Connect Real Gmail
            </Button>
          )}
        </div>
      </div>

      {/* Gmail Connection Status Card */}
      {!isConnected ? (
        <div className="bg-gradient-to-r from-purple-900/40 via-purple-950/20 to-dark-900 border border-purple-500/30 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-500/20 border border-purple-500/30 rounded-2xl text-purple-400">
              <Mail className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-base">Connect Your Real Gmail Account</h3>
              <p className="text-slate-300 text-sm mt-1 leading-relaxed">
                Connect your Google account to automatically pull incoming university emails, analyze assignments and exam schedules, and create prioritized tasks.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <Button onClick={handleConnectGmail} leftIcon={<ShieldCheck className="w-4 h-4" />}>
                  Sign in with Google & Authorize Gmail
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-emerald-300 font-medium text-sm">Real Mailbox Connected & Synchronized</p>
              <p className="text-emerald-200/70 text-xs mt-0.5">
                LifePilot automatically scans your inbox every 15 minutes for new course and exam emails.
              </p>
            </div>
          </div>
          <Badge variant="success" dot>Active</Badge>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-900 border border-white/8 rounded-2xl p-1 w-fit">
        {(['suggestions', 'emails'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 capitalize ${activeTab === tab
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            {tab === 'suggestions' ? `Task Suggestions (${suggestions.length})` : `Inbox Emails (${emails.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-dark-900 rounded-2xl animate-pulse border border-white/5" />)}
        </div>
      ) : activeTab === 'suggestions' ? (
        suggestions.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="w-8 h-8" />}
            title="No pending suggestions"
            description={isConnected
              ? "All academic emails have been processed. New assignment and exam suggestions will appear here as emails arrive."
              : "Connect your Gmail account to let LifePilot analyze your real inbox and suggest tasks."}
            action={isConnected
              ? { label: 'Sync Mailbox Now', onClick: handleSync }
              : { label: 'Connect Gmail', onClick: handleConnectGmail }}
          />
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onApprove={() => approveSuggestion(s.id)}
                onReject={() => rejectSuggestion(s.id)}
                onEdit={() => openEdit(s)}
              />
            ))}
          </div>
        )
      ) : (
        emails.length === 0 ? (
          <EmptyState
            icon={<Mail className="w-8 h-8" />}
            title="No emails synchronized yet"
            description={isConnected
              ? "No recent academic emails found in your inbox from the last 24 hours. Click 'Sync Mailbox Now' to fetch."
              : "Connect your Gmail account to synchronize real emails from your inbox."}
            action={isConnected
              ? { label: 'Sync Mailbox Now', onClick: handleSync }
              : { label: 'Connect Gmail', onClick: handleConnectGmail }}
          />
        ) : (
          <div className="space-y-3">
            {emails.map((email) => <EmailCard key={email.id} email={email} />)}
          </div>
        )
      )}

      {/* Edit suggestion modal */}
      <Modal isOpen={!!editingSuggestion} onClose={() => setEditingSuggestion(null)} title="Edit Task Suggestion"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingSuggestion(null)}>Cancel</Button>
            <Button onClick={() => {
              if (editingSuggestion) {
                approveSuggestion(editingSuggestion.id, {
                  title: editForm.title,
                  deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : undefined,
                });
                setEditingSuggestion(null);
              }
            }}>Approve & Create</Button>
          </>
        }>
        {editingSuggestion && (
          <div className="space-y-4">
            <Input label="Task Title" value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
            <Input label="Deadline" type="datetime-local" value={editForm.deadline}
              onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })} />
            {editingSuggestion.aiReason && (
              <div className="p-3 bg-purple-600/10 border border-purple-500/20 rounded-xl">
                <p className="text-xs text-purple-300">AI Reason: {editingSuggestion.aiReason}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function SuggestionCard({ suggestion: s, onApprove, onReject, onEdit }: {
  suggestion: SuggestedTask;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <Card className="border-purple-500/15">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-purple-400 font-medium">AI Suggestion</span>
            {s.aiConfidence && (
              <Badge variant="ghost" size="sm">{Math.round(s.aiConfidence * 100)}% confidence</Badge>
            )}
          </div>
          <h3 className="text-slate-100 font-medium text-sm">{s.title}</h3>
          {s.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{s.description}</p>}
          {s.email && (
            <p className="text-xs text-slate-600 mt-2">
              📧 From: {s.email.sender} · {s.email.subject}
            </p>
          )}
          {s.suggestedDueDate && (
            <p className="text-xs text-amber-400 mt-1">
              Suggested deadline: {new Date(s.suggestedDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
          {s.aiReason && (
            <p className="text-xs text-slate-600 mt-1 italic">"{s.aiReason}"</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
        <Button size="sm" onClick={onApprove} leftIcon={<Check className="w-3.5 h-3.5" />}>
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit} leftIcon={<Edit className="w-3.5 h-3.5" />}>
          Edit & Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={onReject} leftIcon={<X className="w-3.5 h-3.5" />}
          className="hover:text-red-400 hover:bg-red-500/10">
          Reject
        </Button>
      </div>
    </Card>
  );
}

function EmailCard({ email: e }: { email: Email }) {
  return (
    <Card hover>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {e.aiCategory && <Badge variant="info" size="sm">{e.aiCategory}</Badge>}
            {e.isImportant && <Badge variant="warning" size="sm">Important</Badge>}
          </div>
          <p className="text-sm font-medium text-slate-200 truncate">{e.subject ?? '(No subject)'}</p>
          <p className="text-xs text-slate-500 mt-0.5">{e.sender}</p>
          {(e.aiSummary || e.snippet) && (
            <p className="text-xs text-slate-400 mt-2 bg-dark-800 rounded-xl p-2 leading-relaxed">
              <Sparkles className="w-3 h-3 inline mr-1 text-purple-400" />
              {e.aiSummary || e.snippet}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-xs text-slate-600">{e.receivedAt ? formatRelative(e.receivedAt) : ''}</p>
          {e.suggestedTasks && e.suggestedTasks.length > 0 && (
            <Badge variant="success" size="sm" className="mt-1">Task created</Badge>
          )}
        </div>
      </div>
    </Card>
  );
}
