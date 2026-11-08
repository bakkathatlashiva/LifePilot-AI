import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, CalendarClock, TrendingUp, ListTodo } from 'lucide-react';
import { Card } from '../ui/Card';
import { DashboardStats } from '../../types';
import { cn } from '../../lib/utils';

interface StatsGridProps {
  stats: DashboardStats | null;
  loading?: boolean;
}

export function StatsGrid({ stats, loading }: StatsGridProps) {
  const items = [
    {
      label: 'Total Tasks',
      value: stats?.total ?? 0,
      icon: <ListTodo className="w-5 h-5" />,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'Completed',
      value: stats?.completed ?? 0,
      icon: <CheckCircle2 className="w-5 h-5" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      sub: stats ? `${stats.completionRate}% rate` : '',
    },
    {
      label: 'Overdue',
      value: stats?.overdue ?? 0,
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
    },
    {
      label: 'Due Today',
      value: stats?.dueToday ?? 0,
      icon: <Clock className="w-5 h-5" />,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      label: 'This Week',
      value: stats?.dueThisWeek ?? 0,
      icon: <CalendarClock className="w-5 h-5" />,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    {
      label: 'Completion',
      value: `${stats?.completionRate ?? 0}%`,
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      isProgress: true,
      progress: stats?.completionRate ?? 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-4">
      {items.map((item) => (
        <Card key={item.label} className={cn('border min-w-0 p-3 sm:p-4', item.border)} padding="none">
          <div className={cn('w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2 sm:mb-3', item.bg, item.color)}>
            {item.icon}
          </div>
          {loading ? (
            <div className="h-6 sm:h-7 w-14 sm:w-16 bg-white/5 rounded-lg animate-pulse mb-1" />
          ) : (
            <p className={cn('text-lg sm:text-2xl font-bold tracking-tight truncate', item.color)}>{item.value}</p>
          )}
          <p className="text-slate-400 text-[11px] sm:text-xs mt-0.5 truncate">{item.label}</p>
          {item.isProgress && (
            <div className="mt-2 bg-dark-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-700"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          )}
          {item.sub && <p className="text-slate-500 text-[10px] sm:text-xs mt-0.5 truncate">{item.sub}</p>}
        </Card>
      ))}
    </div>
  );
}
