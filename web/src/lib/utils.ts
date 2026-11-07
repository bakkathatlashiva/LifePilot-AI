import { type ClassValue, clsx } from 'clsx';
import { formatDistanceToNow, format, isToday, isTomorrow, isPast, differenceInDays } from 'date-fns';
import { TaskPriority, TaskStatus, TaskCategory } from '../types';

// Simple clsx-like utility (no extra dep)
export function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]): string {
  return inputs
    .flatMap((input) => {
      if (!input) return [];
      if (typeof input === 'string') return [input];
      return Object.entries(input)
        .filter(([, v]) => v)
        .map(([k]) => k);
    })
    .join(' ');
}

export function formatDeadline(dateStr?: string): string {
  if (!dateStr) return 'No deadline';
  const date = new Date(dateStr);
  if (isToday(date)) return `Today at ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow at ${format(date, 'h:mm a')}`;
  const days = differenceInDays(date, new Date());
  if (days < 7) return `${days}d left — ${format(date, 'EEE, MMM d')}`;
  return format(date, 'MMM d, yyyy');
}

export function formatRelative(dateStr?: string): string {
  if (!dateStr) return '';
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export function isOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  return isPast(new Date(dateStr));
}

export function getDaysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  return differenceInDays(new Date(dateStr), new Date());
}

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; dot: string }> = {
  LOW: { label: 'Low', color: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-400' },
  MEDIUM: { label: 'Medium', color: 'text-amber-400', bg: 'bg-amber-500/10', dot: 'bg-amber-400' },
  HIGH: { label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10', dot: 'bg-orange-400' },
  CRITICAL: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-400' },
};

export const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  UPCOMING: { label: 'Upcoming', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  AVAILABLE: { label: 'Available', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  IN_PROGRESS: { label: 'In Progress', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  COMPLETED: { label: 'Completed', color: 'text-slate-400', bg: 'bg-slate-500/10' },
  OVERDUE: { label: 'Overdue', color: 'text-red-400', bg: 'bg-red-500/10' },
  CANCELLED: { label: 'Cancelled', color: 'text-slate-600', bg: 'bg-slate-700/20' },
};

export const CATEGORY_CONFIG: Record<TaskCategory, { label: string; icon: string; color: string }> = {
  COLLEGE_ASSIGNMENT: { label: 'Assignment', icon: '📝', color: 'text-purple-400' },
  EXAM: { label: 'Exam', icon: '📋', color: 'text-red-400' },
  STUDY_SESSION: { label: 'Study', icon: '📚', color: 'text-blue-400' },
  PROJECT: { label: 'Project', icon: '🚀', color: 'text-orange-400' },
  HACKATHON: { label: 'Hackathon', icon: '💻', color: 'text-green-400' },
  EVENT: { label: 'Event', icon: '🎯', color: 'text-yellow-400' },
  WORKSHOP: { label: 'Workshop', icon: '🔧', color: 'text-cyan-400' },
  PERSONAL: { label: 'Personal', icon: '👤', color: 'text-pink-400' },
  MEETING: { label: 'Meeting', icon: '🤝', color: 'text-indigo-400' },
  REMINDER: { label: 'Reminder', icon: '🔔', color: 'text-amber-400' },
};

export function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${greeting}, ${name.split(' ')[0]}!` : `${greeting}!`;
}
