import React, { useState, useEffect } from 'react';
import { User, Bell, Shield, Database, Phone, Mail, Link, Unlink } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import api from '../lib/api';

export function SettingsPage() {
  const { user } = useAuthStore();
  const { registerWebPush } = useNotificationStore();
  const [prefs, setPrefs] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchPrefs = async () => {
    try {
      const { data } = await api.get('/preferences');
      setPrefs(data.data);
    } catch {}
  };

  useEffect(() => { fetchPrefs(); }, []);

  const savePrefs = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      await api.put('/preferences', updates);
      setPrefs((prev: any) => ({ ...prev, ...updates }));
    } catch {}
    finally { setSaving(false); }
  };

  const connectGmail = () => {
    window.location.href = `${import.meta.env.VITE_API_URL ?? '/api'}/auth/google/gmail`;
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
