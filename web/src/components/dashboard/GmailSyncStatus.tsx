import React, { useState, useEffect } from 'react';
import { Mail, RefreshCw, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { formatRelative } from '../../lib/utils';

export function GmailSyncStatus() {
  const [data, setData] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();

  const fetch = async () => {
    try {
      const { data: res } = await api.get('/gmail/status');
      setData(res.data);
    } catch {}
  };

  useEffect(() => {
    fetch();
    const timer = setInterval(fetch, 30_000);
    return () => clearInterval(timer);
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      await api.post('/gmail/sync');
      setTimeout(fetch, 3000);
    } catch {}
    finally { setSyncing(false); }
  };

  const isConnected = data?.account?.isActive;
  const lastLog = data?.recentLogs?.[0];

  return (
    <Card>
      <CardHeader
        title="Gmail Intelligence"
        subtitle="24/7 Mailbox Monitoring & AI Analysis"
        icon={<Mail className="w-5 h-5 text-blue-400" />}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/gmail')}
            rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>
            View
          </Button>
        }
      />

      {!isConnected ? (
        <div className="text-center py-4">
          <p className="text-slate-500 text-sm mb-3">Gmail not connected</p>
          <Button size="sm" onClick={() => navigate('/settings')}>Connect Gmail</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="success" dot>24/7 Active</Badge>
            <Button variant="ghost" size="sm" onClick={sync} loading={syncing}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>Sync</Button>
          </div>

          {lastLog && (
            <div className="bg-dark-800 rounded-xl p-3 space-y-1">
              <div className="flex items-center gap-2">
                {lastLog.status === 'SUCCESS'
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  : <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className="text-xs text-slate-400">
                  Last sync {formatRelative(lastLog.startedAt)}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {lastLog.itemsNew} new emails · {lastLog.itemsUpdated} analyzed
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
