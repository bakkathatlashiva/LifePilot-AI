import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Database, Smartphone, Mail, Link, Unlink, CheckCircle2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
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

  const isGmailConnected = user?.connectedAccounts?.some(
    (a) => a.provider === 'google_gmail' && a.isActive
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-xs sm:text-sm mt-0.5">Manage your account and preferences</p>
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

                </div>
              )}
            </div>

            {/* SMS Notifications (SIM Gateway) */}
            <div className="border-t border-white/5 pt-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-200">SMS Notifications</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Automated
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Automatically receive SMS alerts for ongoing and missed assignments on your mobile device
                  </p>
                </div>
                <Toggle
                  checked={prefs.smsNotificationsEnabled ?? true}
                  onChange={(v) => savePrefs({ smsNotificationsEnabled: v })}
                />
              </div>
              {(prefs.smsNotificationsEnabled ?? true) && (
                <div className="mt-3 pl-3 border-l-2 border-emerald-500/30">
                  <Input
                    label="Mobile Phone Number for SMS Alerts"
                    placeholder="+91 9876543210"
                    value={prefs.phoneNumber ?? ''}
                    onChange={(e) => setPrefs((p: any) => ({ ...p, phoneNumber: e.target.value }))}
                    onBlur={() => savePrefs({ phoneNumber: prefs.phoneNumber })}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Alerts include Course Subject, Assignment Title, and Due Date automatically dispatched via your SMS Gateway.
                  </p>
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
    <div className="min-h-[44px] min-w-[44px] flex items-center justify-end">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 cursor-pointer ${
          checked ? 'bg-purple-600' : 'bg-slate-700'
        }`}
      >
        <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 mx-0.5 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    </div>
  );
}
