import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, AlertCircle, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { formatRelative } from '../../lib/utils';

interface ERPStatusData {
  connection: {
    id: string;
    lastSyncAt?: string;
    lastSyncStatus?: string;
    lastSyncError?: string;
    monitoringInterval: number;
    isActive: boolean;
    _count: { assignments: number };
  } | null;
  recentLogs: Array<{
    id: string;
    status: string;
    startedAt: string;
    itemsFound: number;
    itemsNew: number;
    errorMessage?: string;
  }>;
}

export function ERPStatus() {
  const [data, setData] = useState<ERPStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const navigate = useNavigate();

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get('/erp/status');
      setData(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.post('/erp/sync');
      setTimeout(fetchStatus, 2000);
    } catch (e: any) {
      alert(e.response?.data?.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 30_000);
    return () => clearInterval(timer);
  }, []);

  const conn = data?.connection;
  const statusVariant =
    conn?.lastSyncStatus === 'SUCCESS' ? 'success' :
    conn?.lastSyncStatus === 'FAILED' ? 'danger' :
    conn?.lastSyncStatus === 'RUNNING' ? 'info' : 'ghost';

  return (
    <Card>
      <CardHeader
        title="ERP Monitor"
        subtitle="Aurora University · 24/7 Background Sync"
        icon={<Activity className="w-5 h-5 text-purple-400" />}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/erp')}
            rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>
            View
          </Button>
        }
      />

      {!conn ? (
        <div className="text-center py-4">
          <p className="text-slate-500 text-sm mb-3">ERP monitoring not configured</p>
          <Button size="sm" onClick={() => navigate('/erp')}>Connect ERP</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {conn.lastSyncStatus === 'SUCCESS' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : conn.lastSyncStatus === 'FAILED' ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : (
                <Clock className="w-4 h-4 text-slate-500" />
              )}
              <Badge variant={statusVariant} dot>
                {conn.lastSyncStatus === 'RUNNING' ? 'Syncing...' : '24/7 Active'}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={triggerSync}
              loading={syncing}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-dark-800 rounded-xl p-3">
              <p className="text-2xl font-bold text-purple-400">{conn._count.assignments}</p>
              <p className="text-slate-500 text-xs mt-0.5">Total assignments</p>
            </div>
            <div className="bg-dark-800 rounded-xl p-3">
              <p className="text-sm font-medium text-slate-300">
                {conn.lastSyncAt ? formatRelative(conn.lastSyncAt) : 'Never'}
              </p>
              <p className="text-slate-500 text-xs mt-0.5">Last synced</p>
            </div>
          </div>

          {conn.lastSyncError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-red-400 text-xs">{conn.lastSyncError}</p>
            </div>
          )}

          <p className="text-slate-600 text-xs">Checks every {conn.monitoringInterval} min</p>
        </div>
      )}
    </Card>
  );
}
