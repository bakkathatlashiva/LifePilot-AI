import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  RefreshCw,
  Check,
  X,
  Edit,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Calendar,
  User,
  Clock,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { SuggestedTask, Email } from '../types';
import api, { API_BASE_URL } from '../lib/api';
import { formatRelative } from '../lib/utils';

export function GmailPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'suggestions' | 'emails'>('suggestions');
  const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<any>(null);

  // Interaction feedback states
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{ title: string; taskId?: string } | null>(null);

  // Modals
  const [editingSuggestion, setEditingSuggestion] = useState<SuggestedTask | null>(null);
  const [editForm, setEditForm] = useState({ title: '', deadline: '' });
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

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
    } catch {
      // Keep state resilient on transient network issues
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

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
    setApprovingId(id);
    try {
      const res = await api.post(`/gmail/suggestions/${id}/approve`, overrides ?? {});
      const createdTask = res.data?.data;
      const targetItem = suggestions.find((s) => s.id === id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setSuccessToast({
        title: (overrides?.title as string) || targetItem?.title || 'Academic Task',
        taskId: createdTask?.id,
      });
      setTimeout(() => setSuccessToast(null), 8000);
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Failed to approve suggestion');
    } finally {
      setApprovingId(null);
    }
  };

  const rejectSuggestion = async (id: string) => {
    setRejectingId(id);
    try {
      await api.post(`/gmail/suggestions/${id}/reject`);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Failed to reject suggestion');
    } finally {
      setRejectingId(null);
    }
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
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Gmail Intelligence</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-0.5">
            Live monitoring & AI analysis for your university mailbox
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {isConnected ? (
            <Button
              onClick={handleSync}
              loading={syncing}
              leftIcon={<RefreshCw className="w-4 h-4" />}
              className="w-full sm:w-auto min-h-[44px] justify-center text-sm font-medium"
            >
              Sync Mailbox Now
            </Button>
          ) : (
            <Button
              onClick={handleConnectGmail}
              leftIcon={<Mail className="w-4 h-4" />}
              className="w-full sm:w-auto min-h-[44px] justify-center text-sm font-medium"
            >
              Connect Real Gmail
            </Button>
          )}
        </div>
      </div>

      {/* Success Banner when task approved */}
      {successToast && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in shadow-lg shadow-emerald-950/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-emerald-300 font-semibold text-sm sm:text-base">Task Created Successfully!</p>
              <p className="text-emerald-200/80 text-xs mt-0.5 truncate break-words">
                {successToast.title}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate('/tasks')}
            className="w-full sm:w-auto min-h-[40px] justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs sm:text-sm flex-shrink-0"
          >
            View in Tasks &rarr;
          </Button>
        </div>
      )}

      {/* Connection Status Card */}
      {!isConnected ? (
        <div className="bg-gradient-to-r from-purple-900/40 via-purple-950/20 to-dark-900 border border-purple-500/30 rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="p-3 bg-purple-500/20 border border-purple-500/30 rounded-2xl text-purple-400 flex-shrink-0">
              <Mail className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-base">Connect Your Real Gmail Account</h3>
              <p className="text-slate-300 text-xs sm:text-sm mt-1 leading-relaxed">
                Connect your Google account to automatically pull incoming university emails, analyze assignments and
                exam schedules, and convert them into organized tasks.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <Button
                  onClick={handleConnectGmail}
                  leftIcon={<ShieldCheck className="w-4 h-4" />}
                  className="min-h-[44px] text-sm"
                >
                  Sign in with Google & Authorize Gmail
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="min-w-0">
              <p className="text-emerald-300 font-semibold text-sm">24/7 Autonomous Gmail Cloud Monitoring Active</p>
              <p className="text-emerald-200/75 text-xs mt-0.5 truncate sm:whitespace-normal">
                LifePilot scans your mailbox 24/7 in the background every 5 minutes. You do not need to remain on this page.
              </p>
            </div>
          </div>
          <Badge variant="success" dot className="flex-shrink-0">
            24/7 Active
          </Badge>
        </div>
      )}

      {/* Responsive Navigation Tabs */}
      <div className="flex gap-1.5 bg-dark-900 border border-white/8 rounded-2xl p-1.5 overflow-x-auto w-full sm:w-fit touch-pan-x">
        {(['suggestions', 'emails'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap min-h-[40px] transition-all duration-200 capitalize flex-1 sm:flex-initial text-center ${
              activeTab === tab
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'suggestions'
              ? `Task Suggestions (${suggestions.length})`
              : `Inbox Emails (${emails.length})`}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-dark-900 rounded-2xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : activeTab === 'suggestions' ? (
        suggestions.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="w-8 h-8" />}
            title="No pending suggestions"
            description={
              isConnected
                ? 'All academic emails have been processed. New assignment and exam suggestions will appear here as emails arrive.'
                : 'Connect your Gmail account to let LifePilot analyze your real inbox and suggest tasks.'
            }
            action={
              isConnected
                ? { label: 'Sync Mailbox Now', onClick: handleSync }
                : { label: 'Connect Gmail', onClick: handleConnectGmail }
            }
          />
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                isApproving={approvingId === s.id}
                isRejecting={rejectingId === s.id}
                onApprove={() => approveSuggestion(s.id)}
                onReject={() => rejectSuggestion(s.id)}
                onEdit={() => openEdit(s)}
              />
            ))}
          </div>
        )
      ) : emails.length === 0 ? (
        <EmptyState
          icon={<Mail className="w-8 h-8" />}
          title="No emails synchronized yet"
          description={
            isConnected
              ? "No recent academic emails found in your inbox from the last 24 hours. Click 'Sync Mailbox Now' to fetch."
              : 'Connect your Gmail account to synchronize real emails from your inbox.'
          }
          action={
            isConnected
              ? { label: 'Sync Mailbox Now', onClick: handleSync }
              : { label: 'Connect Gmail', onClick: handleConnectGmail }
          }
        />
      ) : (
        <div className="space-y-3">
          {emails.map((email) => (
            <EmailCard key={email.id} email={email} onSelect={() => setSelectedEmail(email)} />
          ))}
        </div>
      )}

      {/* Edit Suggestion Modal */}
      <Modal
        isOpen={!!editingSuggestion}
        onClose={() => setEditingSuggestion(null)}
        title="Edit Task Suggestion"
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 w-full">
            <Button
              variant="secondary"
              onClick={() => setEditingSuggestion(null)}
              className="w-full sm:w-auto min-h-[44px]"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingSuggestion) {
                  approveSuggestion(editingSuggestion.id, {
                    title: editForm.title,
                    deadline: editForm.deadline ? new Date(editForm.deadline).toISOString() : undefined,
                  });
                  setEditingSuggestion(null);
                }
              }}
              className="w-full sm:w-auto min-h-[44px] font-semibold"
            >
              Approve & Create
            </Button>
          </div>
        }
      >
        {editingSuggestion && (
          <div className="space-y-4">
            <Input
              label="Task Title"
              value={editForm.title}
              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              className="min-h-[44px] text-sm"
            />
            <Input
              label="Deadline"
              type="datetime-local"
              value={editForm.deadline}
              onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
              className="min-h-[44px] text-sm"
            />
            {editingSuggestion.aiReason && (
              <div className="p-3 bg-purple-600/10 border border-purple-500/20 rounded-xl">
                <p className="text-xs text-purple-300">
                  <span className="font-semibold">AI Reason:</span> {editingSuggestion.aiReason}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Full Email Details Modal for Mobile & Desktop */}
      <Modal
        isOpen={!!selectedEmail}
        onClose={() => setSelectedEmail(null)}
        title="Email Details"
        size="lg"
        footer={
          <Button
            variant="secondary"
            onClick={() => setSelectedEmail(null)}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Close
          </Button>
        }
      >
        {selectedEmail && (
          <div className="space-y-4 text-slate-200">
            {/* Subject and badges */}
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                {selectedEmail.aiCategory && (
                  <Badge variant="info" size="sm">
                    {selectedEmail.aiCategory}
                  </Badge>
                )}
                {selectedEmail.isImportant && (
                  <Badge variant="warning" size="sm">
                    Important
                  </Badge>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white break-words leading-snug">
                {selectedEmail.subject || '(No subject)'}
              </h3>
            </div>

            {/* Sender and timestamp grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-dark-800 rounded-xl p-3 border border-white/5">
              <div className="flex items-center gap-2 min-w-0">
                <User className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span className="text-slate-400">From:</span>
                <span className="text-slate-200 font-medium truncate">{selectedEmail.sender}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span className="text-slate-400">Date:</span>
                <span className="text-slate-200 font-medium">
                  {selectedEmail.receivedAt
                    ? new Date(selectedEmail.receivedAt).toLocaleString('en-IN')
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* AI Summary Highlight */}
            {selectedEmail.aiSummary && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-purple-400 font-semibold">
                  <Sparkles className="w-4 h-4" />
                  <span>LifePilot AI Analysis & Summary</span>
                </div>
                <p className="text-xs sm:text-sm text-purple-200 leading-relaxed break-words">
                  {selectedEmail.aiSummary}
                </p>
              </div>
            )}

            {/* Email Snippet / Content Preview */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Content</p>
              <div className="bg-dark-900 border border-white/8 rounded-xl p-3.5 text-xs sm:text-sm text-slate-300 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap break-words">
                {selectedEmail.bodyText || selectedEmail.snippet || 'No message content available.'}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  isApproving,
  isRejecting,
  onApprove,
  onReject,
  onEdit,
}: {
  suggestion: SuggestedTask;
  isApproving: boolean;
  isRejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <Card className="border-purple-500/20 hover:border-purple-500/40 transition-colors p-4 sm:p-5">
      <div className="flex flex-col gap-3">
        {/* Top Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs text-purple-400 font-medium bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            AI Suggestion
          </span>
          {s.aiConfidence && (
            <Badge variant="ghost" size="sm">
              {Math.round(s.aiConfidence * 100)}% confidence
            </Badge>
          )}
          {s.priority && (
            <Badge variant={s.priority === 'HIGH' ? 'danger' : 'info'} size="sm">
              {s.priority}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="text-slate-100 font-semibold text-sm sm:text-base leading-snug break-words">
          {s.title}
        </h3>

        {/* Description */}
        {s.description && (
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed break-words line-clamp-3">
            {s.description}
          </p>
        )}

        {/* Metadata info */}
        <div className="bg-dark-800/80 rounded-xl p-3 border border-white/5 space-y-1.5 text-xs">
          {s.suggestedDueDate && (
            <div className="flex items-center gap-2 text-amber-400 font-medium">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                Deadline:{' '}
                {new Date(s.suggestedDueDate).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
          {s.email && (
            <div className="flex items-center gap-1.5 text-slate-400 truncate">
              <Mail className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
              <span className="truncate">
                {s.email.sender} &bull; {s.email.subject}
              </span>
            </div>
          )}
          {s.aiReason && (
            <p className="text-[11px] text-slate-500 italic mt-0.5 break-words">
              Reason: &ldquo;{s.aiReason}&rdquo;
            </p>
          )}
        </div>

        {/* Mobile-Friendly Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5">
          <Button
            size="sm"
            onClick={onApprove}
            loading={isApproving}
            disabled={isApproving || isRejecting}
            leftIcon={<Check className="w-4 h-4" />}
            className="min-h-[44px] justify-center text-xs sm:text-sm font-semibold bg-purple-600 hover:bg-purple-500 active:scale-[0.98]"
          >
            {isApproving ? 'Approving...' : 'Approve'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            disabled={isApproving || isRejecting}
            leftIcon={<Edit className="w-3.5 h-3.5" />}
            className="min-h-[44px] justify-center text-xs sm:text-sm"
          >
            Edit & Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onReject}
            loading={isRejecting}
            disabled={isApproving || isRejecting}
            leftIcon={<X className="w-3.5 h-3.5" />}
            className="min-h-[44px] justify-center text-xs sm:text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10"
          >
            Reject
          </Button>
        </div>
      </div>
    </Card>
  );
}

function EmailCard({ email: e, onSelect }: { email: Email; onSelect: () => void }) {
  return (
    <Card
      hover
      onClick={onSelect}
      className="cursor-pointer transition-transform duration-150 active:scale-[0.99] border-white/8 hover:border-purple-500/30 p-3.5 sm:p-4"
    >
      <div className="flex flex-col gap-2.5">
        {/* Top Header Row: Sender + Relative Time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 font-semibold text-xs flex items-center justify-center flex-shrink-0">
              {e.sender ? e.sender[0].toUpperCase() : 'M'}
            </div>
            <p className="text-xs sm:text-sm font-medium text-slate-300 truncate">
              {e.sender || 'Unknown Sender'}
            </p>
          </div>
          <span className="text-[11px] text-slate-500 flex-shrink-0 whitespace-nowrap">
            {e.receivedAt ? formatRelative(e.receivedAt) : ''}
          </span>
        </div>

        {/* Email Subject */}
        <h4 className="text-sm sm:text-base font-semibold text-slate-100 break-words line-clamp-2 leading-snug">
          {e.subject || '(No subject)'}
        </h4>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {e.aiCategory && (
            <Badge variant="info" size="sm">
              {e.aiCategory}
            </Badge>
          )}
          {e.isImportant && (
            <Badge variant="warning" size="sm">
              Important
            </Badge>
          )}
          {e.suggestedTasks && e.suggestedTasks.length > 0 && (
            <Badge variant="success" size="sm">
              Task Created
            </Badge>
          )}
        </div>

        {/* AI Summary Highlight */}
        {(e.aiSummary || e.snippet) && (
          <div className="bg-dark-800/80 border border-white/5 rounded-xl p-2.5 text-xs text-slate-300 leading-relaxed break-words line-clamp-3">
            <span className="text-purple-400 font-medium inline-flex items-center gap-1 mr-1">
              <Sparkles className="w-3 h-3 flex-shrink-0" />
              AI Insight:
            </span>
            {e.aiSummary || e.snippet}
          </div>
        )}

        {/* Bottom hint */}
        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
          <span>Tap to view full email details</span>
          <ChevronRight className="w-4 h-4 text-slate-600" />
        </div>
      </div>
    </Card>
  );
}
