import React, { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Signal, Send, RefreshCw, ChevronRight,
  BatteryCharging, Battery, CheckCircle2, AlertCircle, Phone
} from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';

interface GatewayStatusData {
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
  } | null;
  queue: {
    pending: number;
    processing: number;
    sentToday: number;
    failed: number;
  };
}

export function SmsGatewayWidget() {
  const [data, setData] = useState<GatewayStatusData | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testSentMsg, setTestSentMsg] = useState('');
  const navigate = useNavigate();

  const fetchStatus = useCallback(async () => {
    try {
      const [gwRes, prefsRes] = await Promise.all([
        api.get('/sms/gateway/status'),
        api.get('/preferences').catch(() => ({ data: { data: {} } })),
      ]);
      const raw = gwRes.data?.data || null;
      if (raw) {
        setData({
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
      }
      if (prefsRes.data?.data?.phoneNumber) {
        setPhoneNumber(prefsRes.data.data.phoneNumber);
        setNewPhone(prefsRes.data.data.phoneNumber);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSavePhone = async () => {
    if (!newPhone.trim()) return;
    setSavingPhone(true);
    try {
      await api.patch('/preferences', {
        phoneNumber: newPhone.trim(),
        smsNotificationsEnabled: true,
        smsGatewayEnabled: true,
      });
      setPhoneNumber(newPhone.trim());
      setIsEditingPhone(false);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to save phone number');
    } finally {
      setSavingPhone(false);
    }
  };

  const handleSendTestSms = async () => {
    const target = phoneNumber || '+919550802806';
    setTestSending(true);
    setTestSentMsg('');
    try {
      await api.post('/sms/jobs', {
        recipientPhone: target,
        message: '⚡ LifePilot SIM Gateway test: Automated assignment reminders are active!',
      });
      setTestSentMsg('Test SMS queued! Dispatches via your Android SIM.');
      fetchStatus();
      setTimeout(() => setTestSentMsg(''), 5000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to queue test SMS');
    } finally {
      setTestSending(false);
    }
  };

  const isOnline = data?.isOnline;
  const pendingCount = data?.queue?.pending ?? 0;

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-sm shadow-xl">
      <CardHeader
        title="SIM SMS Gateway"
        subtitle="Automated SMS via Personal SIM"
        icon={<Smartphone className="w-5 h-5 text-purple-400" />}
        action={
          <Badge variant={isOnline ? 'success' : 'default'} className="text-xs">
            {isOnline ? 'ONLINE' : 'ACTIVE'}
          </Badge>
        }
      />

      <div className="p-4 pt-1 space-y-4">
        {/* Recipient Phone Card */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-purple-400" />
              Recipient Phone Number
            </span>
            {!isEditingPhone ? (
              <button
                onClick={() => setIsEditingPhone(true)}
                className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
              >
                Change
              </button>
            ) : null}
          </div>

          {!isEditingPhone ? (
            <p className="text-sm font-mono font-bold text-white">
              {phoneNumber ? (phoneNumber.startsWith('+') ? phoneNumber : `+91 ${phoneNumber}`) : '+91 9550802806'}
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+91..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
              />
              <button
                onClick={handleSavePhone}
                disabled={savingPhone}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {savingPhone ? '...' : 'Save'}
              </button>
              <button
                onClick={() => setIsEditingPhone(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5">
            <p className="text-[10px] uppercase font-bold text-slate-500">Queue</p>
            <p className="text-base font-bold text-purple-400 mt-0.5">{pendingCount}</p>
          </div>
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5">
            <p className="text-[10px] uppercase font-bold text-slate-500">Sent Today</p>
            <p className="text-base font-bold text-emerald-400 mt-0.5">{data?.queue?.sentToday ?? 0}</p>
          </div>
          <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5">
            <p className="text-[10px] uppercase font-bold text-slate-500">Automated</p>
            <p className="text-base font-bold text-blue-400 mt-0.5">Active</p>
          </div>
        </div>

        {/* Schedule Feature Badges */}
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-purple-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span>Instant SMS when assignments open</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-purple-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span>12-hour reminder interval for pending items</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-purple-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
            <span>24-hour urgent deadline warning to inbox</span>
          </div>
        </div>

        {testSentMsg && (
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{testSentMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestSms}
            disabled={testSending}
            className="flex-1 text-xs border-purple-500/30 hover:bg-purple-500/10 text-purple-300"
          >
            <Send className="w-3.5 h-3.5 mr-1.5" />
            {testSending ? 'Queueing...' : 'Test SMS'}
          </Button>

          <Button
            size="sm"
            onClick={() => navigate('/sms-gateway')}
            className="flex-1 text-xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            Open Gateway
            <ChevronRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
