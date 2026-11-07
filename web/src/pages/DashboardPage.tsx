import React, { useEffect } from 'react';
import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { useTaskStore } from '../store/taskStore';
import { getGreeting } from '../lib/utils';
import { StatsGrid } from '../components/dashboard/StatsGrid';
import { DailyBriefing } from '../components/dashboard/DailyBriefing';
import { UpcomingTasks } from '../components/dashboard/UpcomingTasks';
import { ERPStatus } from '../components/dashboard/ERPStatus';
import { TaskChart } from '../components/dashboard/TaskChart';
import { NotificationPanel } from '../components/dashboard/NotificationPanel';
import { GmailSyncStatus } from '../components/dashboard/GmailSyncStatus';

export function DashboardPage() {
  const { user } = useAuthStore();
  const { tasks, stats, isLoading, fetchTasks, fetchStats } = useTaskStore();

  useEffect(() => {
    fetchTasks();
    fetchStats();
  }, [fetchTasks, fetchStats]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{getGreeting(user?.name)}</h1>
          <p className="text-slate-500 text-sm mt-1">
            {format(new Date(), "EEEE, MMMM d, yyyy")} · Let's stay on top of things.
          </p>
        </div>
        {user?.profilePicture && (
          <img
            src={user.profilePicture}
            alt={user.name}
            className="w-12 h-12 rounded-2xl ring-2 ring-purple-500/30"
          />
        )}
      </div>

      {/* Stats */}
      <StatsGrid stats={stats} loading={isLoading} />

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column: 2/3 */}
        <div className="xl:col-span-2 space-y-6">
          <DailyBriefing />
          <UpcomingTasks tasks={tasks} loading={isLoading} />
          <TaskChart stats={stats} />
        </div>

        {/* Right column: 1/3 */}
        <div className="space-y-4">
          <ERPStatus />
          <GmailSyncStatus />
          <NotificationPanel />
        </div>
      </div>
    </div>
  );
}
