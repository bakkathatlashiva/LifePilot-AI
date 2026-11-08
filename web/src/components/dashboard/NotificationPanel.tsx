import React from 'react';
import { Bell, X, Check } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { useNotificationStore } from '../../store/notificationStore';
import { formatRelative } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export function NotificationPanel() {
  const { notifications, unreadCount, markRead, dismiss, markAllRead } = useNotificationStore();
  const navigate = useNavigate();
  const recent = notifications.slice(0, 6);

  return (
    <Card>
      <CardHeader
        title="Notifications"
        subtitle={`${unreadCount} unread`}
        action={
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead}>Mark all read</Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/notifications')}>
              View all
            </Button>
          </div>
        }
      />

      {recent.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-6">No notifications</p>
      ) : (
        <div className="space-y-2">
          {recent.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                !n.readAt ? 'bg-purple-600/10 border border-purple-500/15' : 'hover:bg-white/5'
              }`}
            >
              <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.readAt ? 'bg-purple-400' : 'bg-slate-600'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 leading-tight">{n.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
                <p className="text-xs text-slate-600 mt-1">{formatRelative(n.scheduledAt)}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {!n.readAt && (
                  <button
                    onClick={() => markRead(n.id)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/20 active:bg-emerald-500/30 transition-colors"
                    aria-label="Mark read"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => dismiss(n.id)}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/20 active:bg-red-500/30 transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
