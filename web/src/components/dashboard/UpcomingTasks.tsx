import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Task } from '../../types';
import { formatDeadline, STATUS_CONFIG, CATEGORY_CONFIG } from '../../lib/utils';
import { useTaskStore } from '../../store/taskStore';

interface UpcomingTasksProps {
  tasks: Task[];
  loading?: boolean;
}

export function UpcomingTasks({ tasks, loading }: UpcomingTasksProps) {
  const { completeTask } = useTaskStore();
  const navigate = useNavigate();

  const upcoming = tasks
    .filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
    .slice(0, 8);

  return (
    <Card>
      <CardHeader
        title="Upcoming Tasks"
        subtitle={`${upcoming.length} pending`}
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}
            rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>
            View all
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-8">🎉 You're all caught up!</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map((task) => {
            const cat = CATEGORY_CONFIG[task.category];
            const isOverdue = task.status === 'OVERDUE';

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group cursor-pointer"
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <button
                  className="flex-shrink-0 min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-500 hover:text-emerald-400 active:scale-90 transition"
                  onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                  aria-label="Mark complete"
                >
                  <Circle className="w-5 h-5" />
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isOverdue ? 'text-red-300' : 'text-slate-200'}`}>
                    {isOverdue && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-400" />}
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500">{cat.icon} {cat.label}</span>
                    <span className="text-slate-600">·</span>
                    <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                      {formatDeadline(task.deadline)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
