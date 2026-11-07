import React, { useEffect } from 'react';
import { Bell, Check, X, Clock, BellOff } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useNotificationStore } from '../store/notificationStore';
import { formatRelative } from '../lib/utils';

export function NotificationsPage() {
  const { notifications, unreadCount, isLoading, fetchNotifications, markRead, dismiss, markAllRead } = useNotificationStore();

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const notifTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      PUSH_ANDROID: '📱',
      PUSH_WEB: '🔔',
      EMAIL: '📧',
      PHONE_CALL: '📞',
      IN_APP: '🔔',
    };
    return icons[type] ?? '🔔';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-slate-500 text-sm mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllRead} leftIcon={<Check className="w-4 h-4" />}>
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-dark-900 rounded-2xl animate-pulse border border-white/5" />)}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<BellOff className="w-8 h-8" />}
          title="No notifications"
          description="You're all caught up! Notifications will appear here when assignments are detected or deadlines approach."
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 group ${
                !n.readAt
                  ? 'bg-purple-600/10 border-purple-500/20'
                  : 'bg-dark-900 border-white/8 opacity-70'
              }`}
            >
              {/* Icon */}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${
                !n.readAt ? 'bg-purple-600/20' : 'bg-dark-800'
              }`}>
                {notifTypeIcon(n.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className={`text-sm font-medium ${!n.readAt ? 'text-slate-100' : 'text-slate-400'}`}>
                    {n.title}
                  </p>
                  {!n.readAt && <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0" />}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{n.body}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-slate-600">{formatRelative(n.scheduledAt)}</span>
                  <Badge variant="ghost" size="sm">{n.status}</Badge>
                  <Badge variant="ghost" size="sm">{n.type}</Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {!n.readAt && (
                  <Button variant="ghost" size="icon" onClick={() => markRead(n.id)} aria-label="Mark read"
                    className="hover:text-emerald-400 hover:bg-emerald-500/10">
                    <Check className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => dismiss(n.id)} aria-label="Dismiss"
                  className="hover:text-red-400 hover:bg-red-500/10">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
