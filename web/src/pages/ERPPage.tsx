import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, AlertCircle, CheckCircle2, Clock, ChevronRight, Info, Settings } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { ERPAssignment } from '../types';
import { formatDeadline, formatRelative } from '../lib/utils';
import api from '../lib/api';
import { format } from 'date-fns';

export function ERPPage() {
  const [status, setStatus] = useState<any>(null);
  const [allAssignments, setAllAssignments] = useState<ERPAssignment[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<ERPAssignment | null>(null);
  const [interval, setIntervalVal] = useState(30);
  const [savedInterval, setSavedInterval] = useState(false);
  const [filterTab, setFilterTab] = useState<'ALL' | 'AVAILABLE' | 'CLOSED'>('ALL');

  // Load all assignments once or silently in the background
  const fetchAssignmentsData = useCallback(async (isSilent = false) => {
    if (!isSilent) setInitialLoading(true);
    try {
      const [statusRes, assignmentsRes] = await Promise.all([
        api.get('/erp/status'),
        api.get('/erp/assignments?pageSize=100'),
      ]);
      setStatus(statusRes.data.data);
      const activeAssignments = (assignmentsRes.data.data.assignments ?? []).filter(
        (a: ERPAssignment) => a.status !== 'UPCOMING'
      );
      setAllAssignments(activeAssignments);
      if (statusRes.data.data.connection?.monitoringInterval) {
        setIntervalVal(statusRes.data.data.connection.monitoringInterval);
      }
    } catch {
      // Keep existing data on error without crashing
    } finally {
      if (!isSilent) setInitialLoading(false);
    }
  }, []);

  // Lightweight status check for background sync polling (avoids fetching 100 assignments repeatedly)
  const pollSyncStatus = useCallback(async () => {
    try {
      const res = await api.get('/erp/status');
      const latestStatus = res.data.data;
      setStatus(latestStatus);
      const currentSyncStatus = latestStatus?.connection?.lastSyncStatus;
      // If sync completed or failed, refresh assignments once and stop spinning
      if (currentSyncStatus === 'SUCCESS' || currentSyncStatus === 'FAILED') {
        setSyncing(false);
        fetchAssignmentsData(true);
      }
    } catch {
      // Ignore transient polling error
    }
  }, [fetchAssignmentsData]);

  // Initial load
  useEffect(() => {
    fetchAssignmentsData(false);
  }, [fetchAssignmentsData]);

  // Fast & efficient polling only while active sync is genuinely executing
  useEffect(() => {
    const isRunning = status?.connection?.lastSyncStatus === 'RUNNING' || syncing;
    if (!isRunning) return;

    let pollCount = 0;
    const maxPolls = 40; // Max 1 minute polling cutoff

    const timer = setInterval(() => {
      pollCount++;
      if (pollCount > maxPolls) {
        setSyncing(false);
        clearInterval(timer);
        return;
      }
      pollSyncStatus();
    }, 1500);

    return () => clearInterval(timer);
  }, [status?.connection?.lastSyncStatus, syncing, pollSyncStatus]);

  // Instantaneous zero-lag client-side tab switching
  const handleFilterChange = (tab: 'ALL' | 'AVAILABLE' | 'CLOSED') => {
    setFilterTab(tab);
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.post('/erp/sync');
      setTimeout(() => pollSyncStatus(), 600);
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Sync failed');
      setSyncing(false);
    }
  };

  const updateInterval = async () => {
    try {
      await api.put('/erp/settings', { monitoringInterval: interval });
      setSavedInterval(true);
      setTimeout(() => setSavedInterval(false), 3000);
      fetchAssignmentsData(true);
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Update failed');
    }
  };

  // Memoized assignment metrics (computes once in O(N), avoiding 4x array filtering on re-render)
  const metrics = useMemo(() => {
    let ongoing = 0;
    let closed = 0;
    let newCount = 0;
    for (let i = 0; i < allAssignments.length; i++) {
      const a = allAssignments[i];
      if (a.status === 'AVAILABLE') ongoing++;
      else if (a.status === 'CLOSED') closed++;
      if (a.isNew) newCount++;
    }
    return {
      total: allAssignments.length,
      ongoing,
      closed,
      newCount,
    };
  }, [allAssignments]);

  // Memoized filtered assignments for active tab - 0ms instantaneous switch!
  const filteredAssignments = useMemo(() => {
    if (filterTab === 'AVAILABLE') {
      return allAssignments.filter(a => a.status === 'AVAILABLE');
    }
    if (filterTab === 'CLOSED') {
      return allAssignments.filter(a => a.status === 'CLOSED');
    }
    return allAssignments;
  }, [allAssignments, filterTab]);

  const conn = status?.connection;
  const isSyncActive = conn?.lastSyncStatus === 'RUNNING' || syncing;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">ERP Assignments</h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">Aurora University · Assessment Portal</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button variant="outline" onClick={() => setShowSetup(true)} leftIcon={<Settings className="w-4 h-4" />}>
            Setup
          </Button>
          {conn && (
            <Button onClick={triggerSync} loading={isSyncActive} leftIcon={<RefreshCw className="w-4 h-4" />}>
              Sync Now
            </Button>
          )}
        </div>
      </div>

      {/* ERP 24/7 Status Notice */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0 text-emerald-400 mt-0.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div>
            <p className="text-emerald-300 font-semibold text-sm">24/7 Autonomous ERP Cloud Monitoring Active</p>
            <p className="text-emerald-200/75 text-xs mt-1 leading-relaxed">
              LifePilot runs continuous 24/7 cloud monitoring on{' '}
              <a
                href="https://admissions.aurora.edu.in/modules/assessments/assessments"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-emerald-300 hover:text-emerald-100 font-medium"
              >
                admissions.aurora.edu.in
              </a>{' '}
              every {conn?.monitoringInterval ?? 5} minutes. You <strong>do not need to stay on this page</strong> or keep your browser open — new assignments and deadlines are automatically synced and alerted via SMS & Gmail 24 hours a day, 7 days a week.
            </p>
          </div>
        </div>
      </div>

      {/* Live Background Sync Banner */}
      {isSyncActive && (
        <div className="bg-purple-600/15 border border-purple-500/30 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-5 h-5 text-purple-400 animate-spin flex-shrink-0" />
          <div className="flex-1">
            <p className="text-purple-200 font-semibold text-sm">Live Automated ERP Monitor Active</p>
            <p className="text-purple-300/80 text-xs mt-0.5">
              Automatically scanning all 10 enrolled subjects on admissions.aurora.edu.in in the background. Assignments refresh live as each course completes.
            </p>
          </div>
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3 mb-2">
            {conn?.lastSyncStatus === 'SUCCESS' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : conn?.lastSyncStatus === 'RUNNING' ? (
              <RefreshCw className="w-5 h-5 text-purple-400 animate-spin" />
            ) : conn?.lastSyncStatus === 'FAILED' ? (
              <AlertCircle className="w-5 h-5 text-red-400" />
            ) : (
              <Clock className="w-5 h-5 text-slate-500" />
            )}
            <p className="text-sm font-medium text-slate-300">Monitoring Status</p>
          </div>
          <Badge
            variant={
              conn?.lastSyncStatus === 'SUCCESS'
                ? 'success'
                : conn?.lastSyncStatus === 'RUNNING'
                ? 'info'
                : conn?.lastSyncStatus === 'FAILED'
                ? 'danger'
                : 'ghost'
            }
            dot
          >
            {conn?.isActive
              ? conn?.lastSyncStatus === 'RUNNING'
                ? 'Syncing...'
                : '24/7 Active'
              : 'Inactive'}
          </Badge>
          {conn?.lastSyncAt && (
            <p className="text-xs text-slate-500 mt-2">Last sync: {formatRelative(conn.lastSyncAt)}</p>
          )}
        </Card>

        <Card>
          <p className="text-3xl font-bold text-purple-400 mb-1">{metrics.total}</p>
          <p className="text-slate-500 text-sm">Total assignments</p>
          <p className="text-xs text-slate-600 mt-2">
            {metrics.newCount} new this sync
          </p>
        </Card>

        <Card>
          <p className="text-sm font-medium text-slate-300 mb-2">Check interval</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1440}
              value={interval}
              onChange={e => setIntervalVal(Number(e.target.value))}
              className="w-20 bg-dark-800 border border-white/10 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-purple-500/60"
            />
            <span className="text-slate-500 text-sm">min</span>
            <Button size="sm" variant="outline" onClick={updateInterval}>Save</Button>
          </div>
          {savedInterval && (
            <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1 animate-fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" /> Auto-sync set to every {interval} min
            </p>
          )}
        </Card>
      </div>

      {/* Error display */}
      {conn?.lastSyncError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-red-300 font-medium text-sm">Sync Error</p>
              <p className="text-red-300/70 text-xs mt-1">{conn.lastSyncError}</p>
              {conn.lastSyncError?.includes('SESSION_EXPIRED') && (
                <Button size="sm" className="mt-2" onClick={() => setShowSetup(true)}>
                  Reconnect ERP Session
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs - Instant 0ms switching */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-dark-900 border border-white/10 rounded-2xl p-1.5 overflow-x-auto max-w-full touch-pan-x">
          <button
            type="button"
            onClick={() => handleFilterChange('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[36px] transition-all cursor-pointer ${
              filterTab === 'ALL' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Active ({metrics.total})
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('AVAILABLE')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[36px] transition-all cursor-pointer ${
              filterTab === 'AVAILABLE' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ongoing ({metrics.ongoing})
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('CLOSED')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[36px] transition-all cursor-pointer ${
              filterTab === 'CLOSED' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Submitted & Evaluated ({metrics.closed})
          </button>
        </div>
        <span className="text-xs text-slate-500 hidden sm:inline">
          Showing assigned assessments across all subjects
        </span>
      </div>

      {/* Assignments list */}
      {initialLoading && allAssignments.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-dark-900 rounded-2xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : filteredAssignments.length === 0 ? (
        <EmptyState
          icon={<RefreshCw className="w-8 h-8" />}
          title={isSyncActive ? 'Live sync in progress...' : conn ? 'No assignments in this view' : 'ERP not configured'}
          description={
            isSyncActive
              ? 'Playwright automation is currently scanning all subjects on admissions.aurora.edu.in. Assignments will appear automatically.'
              : conn
              ? filterTab === 'AVAILABLE'
                ? 'No assignments are currently ongoing. Check the "Submitted & Evaluated" tab.'
                : 'No assignments match the selected filter.'
              : 'Connect your Aurora ERP credentials to start automatic live monitoring.'
          }
          action={
            conn
              ? { label: isSyncActive ? 'Syncing...' : 'Sync Now', onClick: triggerSync }
              : { label: 'Setup ERP', onClick: () => setShowSetup(true) }
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredAssignments.map(a => (
            <AssignmentCard key={a.id} assignment={a} onClick={() => setSelectedAssignment(a)} />
          ))}
        </div>
      )}

      {/* Setup Modal */}
      <Modal isOpen={showSetup} onClose={() => setShowSetup(false)} title="ERP Session Setup" size="lg">
        <ERPSetupGuide
          onSuccess={(immediateAssignments) => {
            setShowSetup(false);
            if (immediateAssignments && immediateAssignments.length > 0) {
              setAllAssignments(immediateAssignments);
            }
            fetchAssignmentsData(true);
          }}
        />
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={!!selectedAssignment} onClose={() => setSelectedAssignment(null)} title="Assignment Details">
        {selectedAssignment && <AssignmentDetail assignment={selectedAssignment} />}
      </Modal>
    </div>
  );
}

// React.memo prevents unnecessary re-rendering of all 49 assignment cards
const AssignmentCard = React.memo(function AssignmentCard({
  assignment: a,
  onClick,
}: {
  assignment: ERPAssignment;
  onClick: () => void;
}) {
  const isOngoing = a.status === 'AVAILABLE';
  const rawStatus = ((a.rawData as any)?.statusRaw || '').toUpperCase();
  const descUpper = (a.description || '').toUpperCase();
  const isEvaluated =
    descUpper.includes('EVALUATED') || descUpper.includes('RESULT') || rawStatus.includes('EVALUATED');
  const isSubmitted =
    descUpper.includes('SUBMITTED') || rawStatus.includes('SUBMITTED') || (!isOngoing && !isEvaluated);

  const badgeText = isOngoing ? 'Ongoing' : isEvaluated ? 'Evaluated' : isSubmitted ? 'Submitted' : 'Closed';
  const badgeVariant = isOngoing ? 'success' : isEvaluated ? 'info' : 'purple';

  return (
    <Card hover onClick={onClick} className="cursor-pointer transition-transform duration-150 active:scale-[0.995]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {a.isNew && <Badge variant="info" dot>New</Badge>}
            <Badge variant={badgeVariant as any}>{badgeText}</Badge>
            {a.subject && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 font-medium">
                {a.subject}
              </span>
            )}
          </div>
          <h3 className="text-slate-100 font-semibold text-sm leading-tight mt-1">{a.title}</h3>
          {a.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{a.description}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
            {a.openingDate && (
              <span className="text-xs text-slate-500">Opened: {format(new Date(a.openingDate), 'MMM d, yyyy')}</span>
            )}
            {a.closingDate && (
              <span className={`text-xs font-medium ${isOngoing ? 'text-amber-400' : 'text-slate-400'}`}>
                {isOngoing ? 'Due: ' : 'Deadline: '} {formatDeadline(a.closingDate)}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0 mt-1" />
      </div>
    </Card>
  );
});

function AssignmentDetail({ assignment: a }: { assignment: ERPAssignment }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-slate-100 font-semibold">{a.title}</h3>
        {a.subject && <p className="text-purple-400 text-sm mt-1">{a.subject}</p>}
      </div>
      {a.description && (
        <div className="bg-dark-800 rounded-xl p-4">
          <p className="text-slate-400 text-sm leading-relaxed">{a.description}</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {a.openingDate && (
          <div className="bg-dark-800 rounded-xl p-3">
            <p className="text-slate-500">Opening Date</p>
            <p className="text-slate-200 mt-0.5">{format(new Date(a.openingDate), 'PPP p')}</p>
          </div>
        )}
        {a.closingDate && (
          <div className="bg-dark-800 rounded-xl p-3">
            <p className="text-slate-500">Closing Date</p>
            <p className="text-slate-200 mt-0.5">{format(new Date(a.closingDate), 'PPP p')}</p>
          </div>
        )}
        {a.maxMarks && (
          <div className="bg-dark-800 rounded-xl p-3">
            <p className="text-slate-500">Maximum Marks</p>
            <p className="text-slate-200 mt-0.5">{a.maxMarks}</p>
          </div>
        )}
      </div>
      {a.history && a.history.length > 0 && (
        <div>
          <p className="text-sm font-medium text-slate-300 mb-2">Change History</p>
          <div className="space-y-2">
            {a.history.map(h => (
              <div key={h.id} className="flex items-center gap-3 text-xs">
                <span className="text-slate-600">{format(new Date(h.detectedAt), 'MMM d, HH:mm')}</span>
                <Badge variant={h.changeType === 'CREATED' ? 'success' : h.changeType.includes('DEADLINE') ? 'warning' : 'ghost'}>
                  {h.changeType.replace('_', ' ')}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ERPSetupGuide({ onSuccess }: { onSuccess: (assignments?: ERPAssignment[]) => void }) {
  const [username, setUsername] = useState('252U1R9175');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUser = username.trim();
    // Support both Student Roll Numbers and Email addresses
    const cleanUsername = trimmedUser.includes('@') ? trimmedUser : trimmedUser.toUpperCase();
    const cleanPassword = password.trim();
    if (!cleanUsername || !cleanPassword) {
      setError('Please provide your Student ID or Email and Password');
      return;
    }
    setSaving(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post('/erp/connect-credentials', { username: cleanUsername, password: cleanPassword }, { timeout: 60000 });
      const assignments = res.data?.data?.assignments;
      setSuccessMsg(res.data.message || 'Connected successfully! Assignments loaded.');
      setTimeout(() => {
        onSuccess(assignments);
      }, 400);
    } catch (e: any) {
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        setError('Portal response was slow, but if credentials were valid your monitor is starting. Please wait a moment.');
      } else {
        setError(e.response?.data?.message ?? 'Failed to connect. Please verify your Student ID/Email and Password.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleCredentialsLogin} className="space-y-4">
        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl">
          <p className="text-purple-300 font-medium text-sm mb-1">Direct Student Portal Authentication</p>
          <p className="text-purple-200/70 text-xs leading-relaxed">
            Enter your Aurora ERP credentials. LifePilot verifies your account at admissions.aurora.edu.in, encrypts your session, and starts automated background monitoring across all enrolled subjects.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Student User ID / Email / Hall Ticket</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter Student ID / Roll Number or Email"
            className="w-full bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-slate-100 text-base sm:text-sm min-h-[44px] focus:outline-none focus:border-purple-500/60 font-mono"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your ERP portal password"
            className="w-full bg-dark-800 border border-white/10 rounded-xl px-4 py-2.5 text-slate-100 text-base sm:text-sm min-h-[44px] focus:outline-none focus:border-purple-500/60"
          />
          <p className="text-[11px] text-slate-400 mt-1">Supports Student Roll Number or Registered Email Address · Password is case-sensitive.</p>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {successMsg && <p className="text-emerald-400 text-sm">{successMsg}</p>}
        <Button type="submit" loading={saving} className="w-full min-h-[48px] text-sm font-semibold">
          {saving ? 'Verifying Credentials...' : 'Authenticate & Sync ERP'}
        </Button>
      </form>
    </div>
  );
}
