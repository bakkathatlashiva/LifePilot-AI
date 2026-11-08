import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Signal, Battery, BatteryCharging, Send, Clock,
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Trash2, Calendar
} from 'lucide-react';
import api from '../lib/api';
import { format } from 'date-fns';

interface GatewayStatus {
  isConfigured: boolean;
  isOnline: boolean;
  device: {
    id: string;
    deviceId: string;
    deviceName: string;
    simOperator: string | null;
    batteryLevel: number | null;
    isCharging: boolean;
    status: 'ONLINE' | 'OFFLINE' | 'PAUSED';
    lastHeartbeatAt: string;
    totalSent: number;
    totalFailed: number;
  } | null;
  queue: {
    pending: number;
    processing: number;
    sentToday: number;
    failed: number;
  };
}

interface SmsJob {
  id: string;
  recipientPhone: string;
  message: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RETRYING' | 'CANCELLED';
  retries: number;
  simSlot?: number | null;
  error?: string | null;
  createdAt: string;
}

const safeFormatDate = (val?: string | null, fmt = 'MMM dd, HH:mm'): string => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '—';
    return format(d, fmt);
  } catch {
    return '—';
  }
};

export function SmsGatewayPage() {
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [jobs, setJobs] = useState<SmsJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Composer Form
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sendType, setSendType] = useState<'NOW' | 'SCHEDULED'>('NOW');
  const [scheduledDate, setScheduledDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchGatewayData = useCallback(async () => {
    try {
      const [statusRes, jobsRes] = await Promise.all([
        api.get('/sms/gateway/status'),
        api.get('/sms/jobs?pageSize=30'),
      ]);
      const raw = statusRes.data?.data || null;
      if (raw) {
        setGatewayStatus({
          isConfigured: raw.isConfigured ?? raw.hasGateway ?? false,
          isOnline: raw.isOnline ?? raw.activeGateway?.isOnline ?? false,
          device: raw.device || raw.activeGateway || null,
          queue: {
            pending: raw.queue?.pending ?? raw.queueStats?.pending ?? 0,
            processing: raw.queue?.processing ?? raw.queueStats?.processing ?? 0,
            sentToday: raw.queue?.sentToday ?? raw.queueStats?.sent ?? 0,
            failed: raw.queue?.failed ?? raw.queueStats?.failed ?? 0,
          },
        });
      } else {
        setGatewayStatus(null);
      }
      setJobs(Array.isArray(jobsRes.data?.data) ? jobsRes.data.data : []);
    } catch (err: any) {
      console.warn('Failed to load SMS Gateway data:', err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGatewayData();
    const interval = setInterval(fetchGatewayData, 10000); // 10s auto refresh
    return () => clearInterval(interval);
  }, [fetchGatewayData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchGatewayData();
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await api.delete(`/sms/jobs/${jobId}`);
      await fetchGatewayData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to cancel SMS job');
    }
  };

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!recipient.trim()) {
      setErrorMsg('Please enter a valid recipient phone number.');
      return;
    }
    if (!message.trim()) {
      setErrorMsg('Message body cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        recipientPhone: recipient.trim(),
        message: message.trim(),
      };

      if (sendType === 'SCHEDULED' && scheduledDate) {
        payload.scheduledAt = new Date(scheduledDate).toISOString();
      }

      const res = await api.post('/sms/jobs', payload);
      setSuccessMsg(
        sendType === 'NOW'
          ? 'SMS queued! Your connected Android phone will dispatch it via SIM card shortly.'
          : 'SMS reminder scheduled successfully!'
      );
      setRecipient('');
      setMessage('');
      setScheduledDate('');
      setSendType('NOW');
      await fetchGatewayData();
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || 'Failed to create SMS job');
    } finally {
      setSubmitting(false);
    }
  };

  const templates = [
    { label: '⚠️ ERP Assignment Due', text: 'LifePilot Alert: Your pending ERP assignment is due in 24 hours. Submit today to avoid penalty!' },
    { label: '📚 Exam Reminder', text: 'LifePilot Notice: Your upcoming semester exam starts tomorrow at 10:00 AM. Best of luck!' },
    { label: '⏰ Academic Study Session', text: 'LifePilot Focus: Time for your scheduled study session. Open your dashboard to review tasks.' },
  ];

  const charCount = message.length;
  const smsSegments = Math.ceil(Math.max(charCount, 1) / 160);

  const filteredJobs = (Array.isArray(jobs) ? jobs : []).filter(j => {
    if (filterStatus === 'ALL') return true;
    return j.status === filterStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Sent</span>;
      case 'PROCESSING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20"><RefreshCw className="w-3 h-3 animate-spin" /> Processing</span>;
      case 'RETRYING':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20"><Clock className="w-3 h-3" /> Retrying</span>;
      case 'FAILED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20"><XCircle className="w-3 h-3" /> Failed</span>;
      case 'CANCELLED':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">Cancelled</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20"><Clock className="w-3 h-3" /> Pending</span>;
    }
  };

  // Page Title & Refresh
  const [pairModalOpen, setPairModalOpen] = useState(false);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairExpiresIn, setPairExpiresIn] = useState(600);
  const [generatingCode, setGeneratingCode] = useState(false);

  const handleGeneratePairCode = async () => {
    setGeneratingCode(true);
    try {
      const res = await api.post('/auth/pair/generate');
      setPairCode(res.data?.data?.code || '123456');
      setPairExpiresIn(res.data?.data?.expiresIn || 600);
      setPairModalOpen(true);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to generate pairing code. Please make sure you are logged in.');
    } finally {
      setGeneratingCode(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Smartphone className="w-6 h-6" />
            </span>
            Personal SIM SMS Gateway
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Send SMS reminders & alerts through your physical Android phone's active SIM card. Zero paid API fees.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleGeneratePairCode}
            disabled={generatingCode}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-purple-600/20 active:scale-95 transition cursor-pointer min-h-[44px]"
          >
            <Smartphone className="w-4 h-4" />
            {generatingCode ? 'Generating...' : '📱 Link Phone Gateway'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium border border-slate-700 active:scale-95 transition cursor-pointer min-h-[44px]"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Pairing Modal */}
      {pairModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-purple-500/30 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl relative">
            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              <span>📱</span> Link Android Phone
            </h3>
            <p className="text-slate-400 text-xs mt-2 leading-relaxed">
              Open the LifePilot app on your Android phone, tap <strong>"🔗 Link via 6-Digit Web Code"</strong>, and enter this one-time security PIN:
            </p>

            <div className="my-5 p-4 sm:p-6 bg-slate-950 border border-purple-500/40 rounded-2xl text-center">
              <p className="text-xs uppercase font-bold tracking-wider text-purple-400 mb-1">Your 6-Digit Device Code</p>
              <div className="text-3xl sm:text-4xl font-extrabold tracking-widest text-white font-mono break-all">
                {pairCode}
              </div>
              <p className="text-xs text-slate-500 mt-2">Valid for 10 minutes · No browser redirects or ngrok required</p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPairModalOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition cursor-pointer min-h-[44px]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automated ERP Assignment SMS Rules Banner */}
      <div className="bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-purple-900/40 border border-purple-500/30 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Automated ERP Assignment SMS Dispatch
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-purple-200/80">
              The scheduler automatically dispatches alerts straight to your phone's SMS inbox via your SIM Gateway:
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-purple-300">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <strong>New Assignments:</strong> Instant SMS when opened
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <strong>Pending Items:</strong> Every 12 hours
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <strong>Urgent Deadline:</strong> 24 hours before due date
              </span>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-purple-500/30 rounded-xl px-4 py-2 text-right">
            <p className="text-[10px] text-purple-300 uppercase font-semibold">Inbox Target</p>
            <p className="text-sm font-mono font-bold text-white">+91 9550802806</p>
          </div>
        </div>
      </div>

      {/* Gateway Hardware Status Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`p-4 rounded-2xl border ${
              gatewayStatus?.isOnline
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}>
              <Signal className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-white">
                  {gatewayStatus?.device?.deviceName || 'Personal Android Device'}
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  gatewayStatus?.isOnline
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    gatewayStatus?.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`} />
                  {gatewayStatus?.isOnline ? 'GATEWAY ONLINE' : 'GATEWAY OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {gatewayStatus?.isOnline
                  ? `Connected & dispatching via SIM carrier (${gatewayStatus?.device?.simOperator || 'Active SIM'}).`
                  : 'Open the LifePilot Android app on your phone and toggle "SIM SMS Gateway" ON to dispatch jobs.'}
              </p>
              {gatewayStatus?.device && (
                <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    {gatewayStatus.device.isCharging ? (
                      <BatteryCharging className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Battery className="w-4 h-4 text-slate-400" />
                    )}
                    Battery: {gatewayStatus.device.batteryLevel ?? 100}%
                  </span>
                  <span>Carrier: <strong className="text-slate-200">{gatewayStatus.device.simOperator || 'SIM 1'}</strong></span>
                  <span>Heartbeat: <strong className="text-slate-200">{safeFormatDate(gatewayStatus.device.lastHeartbeatAt, 'HH:mm:ss')}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Metrics summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 font-medium uppercase">Pending</p>
              <p className="text-xl font-bold text-purple-400 mt-1">{gatewayStatus?.queue?.pending ?? 0}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 font-medium uppercase">Processing</p>
              <p className="text-xl font-bold text-blue-400 mt-1">{gatewayStatus?.queue?.processing ?? 0}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 font-medium uppercase">Sent Today</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{gatewayStatus?.queue?.sentToday ?? 0}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 font-medium uppercase">Failed</p>
              <p className="text-xl font-bold text-red-400 mt-1">{gatewayStatus?.queue?.failed ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: SMS Composer + Templates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Composer Form (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
            <Send className="w-5 h-5 text-purple-400" />
            Compose & Dispatch SMS
          </h2>
          <p className="text-xs text-slate-400 mb-6">
            Creates an SMS dispatch request in the database. Your Android phone claims and transmits it using native SmsManager.
          </p>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-400 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSendSms} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                Recipient Phone Number
              </label>
              <input
                type="tel"
                placeholder="+919876543210 or 10-digit mobile number"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500 transition"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase">
                  SMS Message Body
                </label>
                <span className="text-xs text-slate-500">
                  {charCount} chars ({smsSegments} SMS {smsSegments > 1 ? 'segments' : 'segment'})
                </span>
              </div>
              <textarea
                rows={4}
                placeholder="Enter alert, deadline reminder, or academic notification text..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-purple-500 transition resize-none"
                required
              />
            </div>

            {/* Timing radio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                sendType === 'NOW'
                  ? 'bg-purple-600/10 border-purple-500 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}>
                <input
                  type="radio"
                  name="sendType"
                  value="NOW"
                  checked={sendType === 'NOW'}
                  onChange={() => setSendType('NOW')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <p className="text-sm font-semibold">Send Immediately</p>
                  <p className="text-xs text-slate-400">Transmits via phone SIM right away</p>
                </div>
              </label>

              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${
                sendType === 'SCHEDULED'
                  ? 'bg-purple-600/10 border-purple-500 text-white'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}>
                <input
                  type="radio"
                  name="sendType"
                  value="SCHEDULED"
                  checked={sendType === 'SCHEDULED'}
                  onChange={() => setSendType('SCHEDULED')}
                  className="text-purple-600 focus:ring-purple-500"
                />
                <div>
                  <p className="text-sm font-semibold">Schedule for Later</p>
                  <p className="text-xs text-slate-400">Timed reminder dispatch</p>
                </div>
              </label>
            </div>

            {sendType === 'SCHEDULED' && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-2">
                  Dispatch Date & Time
                </label>
                <div className="relative">
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition"
                    required={sendType === 'SCHEDULED'}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3.5 px-6 rounded-xl shadow-lg shadow-purple-900/30 transition disabled:opacity-60 cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Queuing SMS Job...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {sendType === 'NOW' ? 'Dispatch via Phone SIM' : 'Save Scheduled SMS'}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Quick Templates & Architecture Guide */}
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-400" />
              Quick Notification Templates
            </h3>
            <p className="text-xs text-slate-400 mb-4">Click any template to auto-populate the message composer.</p>
            <div className="space-y-2.5">
              {templates.map((tmpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setMessage(tmpl.text)}
                  className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 transition text-xs group"
                >
                  <p className="font-semibold text-purple-300 group-hover:text-purple-200">{tmpl.label}</p>
                  <p className="text-slate-400 mt-1 line-clamp-2 leading-relaxed">{tmpl.text}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 via-purple-950/20 to-slate-900 border border-purple-500/20 rounded-2xl p-6">
            <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-2">
              How the SIM Gateway Works:
            </h4>
            <ul className="text-xs text-slate-300 space-y-2 leading-relaxed list-disc list-inside">
              <li>Messages are created in the backend with atomic queue locking.</li>
              <li>Your Android phone polls eligible jobs every few seconds.</li>
              <li>Android's native <code className="text-purple-300 bg-purple-950/80 px-1 py-0.5 rounded">SmsManager</code> sends the SMS directly via physical SIM.</li>
              <li>Delivery reports are uploaded back to database automatically.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* SMS Queue & History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">SMS Job Queue & History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Real-time status of all SMS jobs processed through your phone.</p>
          </div>

          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {['ALL', 'PENDING', 'PROCESSING', 'SENT', 'FAILED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterStatus === st
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-500" />
            Loading SMS jobs...
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No SMS jobs matching filter "{filterStatus}".
          </div>
        ) : (
          <div>
            <p className="sm:hidden text-[11px] text-slate-400 mb-2">👉 Swipe horizontally to view full queue</p>
            <div className="table-responsive">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead className="bg-slate-950/70 text-slate-400 uppercase border-b border-slate-800 font-semibold">
                <tr>
                  <th className="px-4 py-3">Recipient</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Scheduled At</th>
                  <th className="px-4 py-3">Sent At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                      📱 {job.recipientPhone}
                    </td>
                    <td className="px-4 py-3 text-slate-300 max-w-xs truncate" title={job.message}>
                      {job.message}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {safeFormatDate(job.scheduledAt, 'MMM dd, HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {safeFormatDate(job.sentAt, 'MMM dd, HH:mm')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {getStatusBadge(job.status)}
                      {job.error && (
                        <p className="text-[10px] text-red-400 mt-1 truncate max-w-xs" title={job.error}>
                          {job.error}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {(job.status === 'PENDING' || job.status === 'RETRYING') && (
                        <button
                          onClick={() => handleCancelJob(job.id)}
                          className="text-xs text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 transition"
                          title="Cancel Job"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

