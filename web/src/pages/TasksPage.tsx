import React, { useEffect, useState } from 'react';
import { Plus, Search, Filter, CheckCircle2, Circle, Trash2, Edit, AlertTriangle } from 'lucide-react';
import { useTaskStore } from '../store/taskStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskForm } from '../components/tasks/TaskForm';
import { Task, TaskStatus, TaskCategory, TaskPriority } from '../types';
import { formatDeadline, PRIORITY_CONFIG, STATUS_CONFIG, CATEGORY_CONFIG } from '../lib/utils';
import { format } from 'date-fns';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'COMPLETED', label: 'Completed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'COLLEGE_ASSIGNMENT', label: 'Assignment' },
  { value: 'EXAM', label: 'Exam' },
  { value: 'STUDY_SESSION', label: 'Study' },
  { value: 'PROJECT', label: 'Project' },
  { value: 'HACKATHON', label: 'Hackathon' },
  { value: 'EVENT', label: 'Event' },
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'REMINDER', label: 'Reminder' },
];

export function TasksPage() {
  const { tasks, isLoading, filters, setFilters, fetchTasks, completeTask, deleteTask } = useTaskStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setFilters({ ...filters, search: e.target.value || undefined });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Tasks</h1>
          <p className="text-slate-500 text-sm mt-1">{tasks.length} tasks</p>
        </div>
        <Button onClick={() => setShowCreate(true)} leftIcon={<Plus className="w-4 h-4" />}>
          New Task
        </Button>
      </div>

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 p-2">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search tasks..."
              value={search}
              onChange={handleSearch}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="w-44">
            <Select
              options={STATUS_OPTIONS}
              value={filters.status ?? ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            />
          </div>
          <div className="w-44">
            <Select
              options={CATEGORY_OPTIONS}
              value={filters.category ?? ''}
              onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
            />
          </div>
        </div>
      </Card>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 bg-dark-900 rounded-2xl animate-pulse border border-white/5" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="w-8 h-8" />}
          title="No tasks found"
          description="Create your first task or adjust the filters above."
          action={{ label: '+ Create Task', onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => <TaskRow key={task.id} task={task} onComplete={completeTask} onDelete={deleteTask} onEdit={setEditTask} />)}
        </div>
      )}

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Task" size="lg">
        <TaskForm onSuccess={() => setShowCreate(false)} />
      </Modal>

      {/* Edit modal */}
      <Modal isOpen={!!editTask} onClose={() => setEditTask(null)} title="Edit Task" size="lg">
        {editTask && <TaskForm task={editTask} onSuccess={() => setEditTask(null)} />}
      </Modal>
    </div>
  );
}

function TaskRow({ task, onComplete, onDelete, onEdit }: {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const cat = CATEGORY_CONFIG[task.category];
  const prio = PRIORITY_CONFIG[task.priority];
  const stat = STATUS_CONFIG[task.status];
  const isOverdue = task.status === 'OVERDUE';
  const isCompleted = task.status === 'COMPLETED';

  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200 group
      ${isCompleted
        ? 'bg-dark-900/40 border-white/5 opacity-60'
        : isOverdue
        ? 'bg-red-500/5 border-red-500/15 hover:border-red-500/25'
        : 'bg-dark-900 border-white/8 hover:border-purple-500/25'}`}>

      {/* Complete button */}
      <button
        className={`flex-shrink-0 transition-colors ${isCompleted ? 'text-emerald-400' : 'text-slate-600 hover:text-emerald-400'}`}
        onClick={() => !isCompleted && onComplete(task.id)}
        disabled={isCompleted}
        aria-label="Mark complete"
      >
        {isCompleted
          ? <CheckCircle2 className="w-5 h-5" />
          : <Circle className="w-5 h-5" />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium ${isCompleted ? 'line-through text-slate-500' : 'text-slate-100'}`}>
            {isOverdue && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-red-400" />}
            {task.title}
          </p>
          <Badge variant={isOverdue ? 'danger' : isCompleted ? 'ghost' : 'ghost'}>
            {stat.label}
          </Badge>
        </div>
        {task.description && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-slate-500">{cat.icon} {cat.label}</span>
          {task.deadline && (
            <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
              {formatDeadline(task.deadline)}
            </span>
          )}
          {task.source !== 'MANUAL' && (
            <Badge variant="ghost" size="sm">{task.source}</Badge>
          )}
        </div>
      </div>

      {/* Priority indicator */}
      <div className={`w-2 h-8 rounded-full flex-shrink-0 ${prio.dot}`} />

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" onClick={() => onEdit(task)} aria-label="Edit task">
          <Edit className="w-4 h-4" />
        </Button>
        {confirming ? (
          <div className="flex gap-1">
            <Button variant="danger" size="sm" onClick={() => onDelete(task.id)}>Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => setConfirming(true)} aria-label="Delete task"
            className="hover:text-red-400 hover:bg-red-500/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
