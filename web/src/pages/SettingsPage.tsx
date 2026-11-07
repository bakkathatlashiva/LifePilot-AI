import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Database, Phone, Mail, Link, Unlink, Send, CheckCircle2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import api, { API_BASE_URL } from '../lib/api';

export function SettingsPage() {
  const { user } = useAuthStore();
  const { registerWebPush } = useNotificationStore();
  const [prefs, setPrefs] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailFeedback, setTestEmailFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{ isConnected: boolean; hasSendScope: boolean } | null>(null);

  const fetchPrefs = async () => {
    try {
      const { data } = await api.get('/preferences');
      setPrefs(data.data);
    } catch {}
  };

  const fetchGmailStatus = async () => {
    try {
      const { data } = await api.get('/notifications/gmail-status');
      setGmailStatus(data.data);
    } catch {}
  };

  useEffect(() => {
    fetchPrefs();
    fetchGmailStatus();
  }, []);

  const savePrefs = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.put('/preferences', updates);
      setPrefs((prev: any) => ({ ...prev, ...updates }));
    } catch {}
    finally { setSaving(false); }
  };

  const connectGmail = () => {
    const returnTo = encodeURIComponent(`${window.location.origin}/settings`);
    window.location.href = `${API_BASE_URL}/auth/google/gmail?returnTo=${returnTo}`;
  };

  const disconnectAccount = async (provider: string) => {
    try {
      await api.delete(`/auth/accounts/${provider}`);
      window.location.reload();
    } catch {}
  };

  const handleSendTestEmail = async () => {
    setTestEmailLoading(true);
    setTestEmailFeedback(null);
    try {
      const res = await api.post('/notifications/test-email');
      setTestEmailFeedback({
        type: 'success',
        message: res.data.message || 'Test email successfully sent to your Gmail inbox!',
      });
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to deliver test email. Please check your Gmail connection.';
      setTestEmailFeedback({
        type: 'error',
        message: errorMsg,
      });
    } finally {
      setTestEmailLoading(false);
    }
  };

  const isGmailConnected = user?.connectedAccounts?.some(
    (a) => a.provider === 'google_gmail' && a.isActive
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader title="Profile" icon={<User className="w-5 h-5" />} />
        <div className="flex items-center gap-4">
          {user?.profilePicture && (
            <img src={user.profilePicture} alt={user.name}
              className="w-16 h-16 rounded-2xl ring-2 ring-purple-500/20" />
          )}
          <div>
            <p className="text-slate-100 font-medium">{user?.name}</p>
            <p className="text-slate-500 text-sm">{user?.email}</p>
          </div>
        </div>
      </Card>

      {/* Connected Accounts */}
      <Card>
        <CardHeader title="Connected Accounts" icon={<Link className="w-5 h-5" />} />
        <div className="space-y-3">
          {/* Gmail */}
          <div className="flex items-center justify-between p-3 bg-dark-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-300">Gmail</p>
                <p className="text-xs text-slate-500">Email intelligence & task suggestions</p>
              </div>
            </div>
            {isGmailConnected ? (
              <div className="flex items-center gap-2">
                <Badge variant="success" dot>Connected</Badge>
                <Button variant="ghost" size="sm" onClick={() => disconnectAccount('google_gmail')}>
                  <Unlink className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={connectGmail}>Connect</Button>
            )}
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader title="Notifications" icon={<Bell className="w-5 h-5" />} />
        {prefs && (
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Enable notifications</span>
              <Toggle
                checked={prefs.notificationsEnabled}
                onChange={(v) => savePrefs({ notificationsEnabled: v })}
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Web push notifications</span>
              <Toggle
                checked={prefs.pushWebEnabled}
                onChange={(v) => {
                  savePrefs({ pushWebEnabled: v });
                  if (v) registerWebPush();
                }}
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Android push notifications</span>
              <Toggle
                checked={prefs.pushAndroidEnabled}
                onChange={(v) => savePrefs({ pushAndroidEnabled: v })}
              />
            </label>

            {/* Gmail Email Notifications */}
            <div className="border-t border-white/5 pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-200">Gmail Email Notifications</p>
                    {isGmailConnected ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {gmailStatus?.hasSendScope ? 'Active' : 'Connected'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Receive important deadlines, exam reminders, and overdue alerts in your Gmail inbox
                  </p>
                </div>
                <Toggle
                  checked={prefs.emailNotificationsEnabled ?? true}
                  onChange={(v) => savePrefs({ emailNotificationsEnabled: v })}
                />
              </div>

              {(prefs.emailNotificationsEnabled ?? true) && (
                <div className="mt-3 pl-3 border-l-2 border-purple-500/30 space-y-3">
                  {!isGmailConnected && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-amber-300">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>Connect your Google account to start receiving email alerts</span>
                      </div>
                      <Button size="sm" onClick={connectGmail}>Connect Gmail</Button>
                    </div>
                  )}

                  {isGmailConnected && !gmailStatus?.hasSendScope && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-purple-300">
                        <Sparkles className="w-4 h-4 flex-shrink-0" />
                        <span>Authorize Gmail Send permissions to enable automated reminders</span>
                      </div>
                      <Button size="sm" onClick={connectGmail}>Authorize Sending</Button>
                    </div>
                  )}

                  {/* Minimum Priority */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Minimum Priority for Emails</span>
                    <select
                      value={prefs.emailMinPriority ?? 'MEDIUM'}
                      onChange={(e) => savePrefs({ emailMinPriority: e.target.value })}
                      className="bg-dark-800 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
                    >
                      <option value="LOW">All Notifications (Low+)</option>
                      <option value="MEDIUM">Medium & Above (Default)</option>
                      <option value="HIGH">High Priority Only</option>
                      <option value="CRITICAL">Critical & Urgent Only</option>
                    </select>
                  </div>

                  {/* Send Test Email Button */}
                  <div className="pt-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-300">Test Gmail Delivery</p>
                      <p className="text-[11px] text-slate-500">Send an immediate test notification to verify your connection</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleSendTestEmail}
                      disabled={testEmailLoading || !isGmailConnected}
                      leftIcon={testEmailLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    >
                      {testEmailLoading ? 'Sending...' : 'Send Test Email'}
                    </Button>
                  </div>

                  {/* Test Email Feedback */}
                  {testEmailFeedback && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                        testEmailFeedback.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      {testEmailFeedback.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p>{testEmailFeedback.message}</p>
                        {testEmailFeedback.type === 'error' && (
                          <button
                            onClick={connectGmail}
                            className="text-purple-400 underline font-medium mt-1 hover:text-purple-300 block"
                          >
                            Click here to reconnect Google account with Send permissions &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-4">
              <label className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">Phone call reminders</p>
                  <p className="text-xs text-slate-500">Optional Twilio voice calls for critical tasks</p>
                </div>
                <Toggle
                  checked={prefs.phoneCallsEnabled}
                  onChange={(v) => savePrefs({ phoneCallsEnabled: v })}
                />
              </label>
              {prefs.phoneCallsEnabled && (
                <div className="mt-3">
                  <Input
                    label="Phone Number"
                    placeholder="+91 9876543210"
                    value={prefs.phoneNumber ?? ''}
                    onChange={(e) => setPrefs((p: any) => ({ ...p, phoneNumber: e.target.value }))}
                    onBlur={() => savePrefs({ phoneNumber: prefs.phoneNumber })}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ERP Monitoring */}
      <Card>
        <CardHeader title="ERP Monitoring" icon={<Database className="w-5 h-5" />} />
        {prefs && (
          <div className="space-y-4">
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Enable ERP monitoring</span>
              <Toggle
                checked={prefs.erpMonitoringEnabled}
                onChange={(v) => savePrefs({ erpMonitoringEnabled: v })}
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Enable Gmail sync</span>
              <Toggle
                checked={prefs.gmailSyncEnabled}
                onChange={(v) => savePrefs({ gmailSyncEnabled: v })}
              />
            </label>
          </div>
        )}
      </Card>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 ${
        checked ? 'bg-purple-600' : 'bg-slate-700'
      }`}
    >
      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 mx-0.5 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  );
}
