export type TaskCategory =
  | 'COLLEGE_ASSIGNMENT' | 'EXAM' | 'STUDY_SESSION' | 'PROJECT'
  | 'HACKATHON' | 'EVENT' | 'WORKSHOP' | 'PERSONAL' | 'MEETING' | 'REMINDER';

export type TaskStatus = 'UPCOMING' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskSource = 'ERP' | 'GMAIL' | 'MANUAL' | 'AI_SUGGESTED';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category: TaskCategory;
  source: TaskSource;
  startDate?: string;
  openingDate?: string;
  deadline?: string;
  priority: TaskPriority;
  status: TaskStatus;
  completedAt?: string;
  isRecurring: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  reminderSchedules?: ReminderSchedule[];
}

export interface ReminderSchedule {
  id: string;
  minutesBefore: number;
  channels: string[];
  isActive: boolean;
  lastFiredAt?: string;
}

export interface ERPAssignment {
  id: string;
  erpId: string;
  title: string;
  subject?: string;
  description?: string;
  openingDate?: string;
  closingDate?: string;
  status: 'UPCOMING' | 'AVAILABLE' | 'CLOSED' | 'CANCELLED';
  maxMarks?: number;
  rawData?: Record<string, any>;
  isNew: boolean;
  isNotified: boolean;
  createdAt: string;
  history?: AssignmentHistory[];
}

export interface AssignmentHistory {
  id: string;
  changeType: string;
  changedFields: Record<string, { old: unknown; new: unknown }>;
  detectedAt: string;
}

export interface ERPConnection {
  id: string;
  erpUrl: string;
  monitoringInterval: number;
  isActive: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
  lastSyncError?: string;
  sessionExpiry?: string;
}

export interface Email {
  id: string;
  gmailMessageId: string;
  subject?: string;
  sender?: string;
  senderEmail?: string;
  snippet?: string;
  receivedAt?: string;
  isImportant: boolean;
  aiAnalyzed: boolean;
  aiCategory?: string;
  aiSummary?: string;
  suggestedTasks?: { id: string; isApproved: boolean | null; title: string }[];
}

export interface SuggestedTask {
  id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  priority: TaskPriority;
  suggestedDueDate?: string;
  aiConfidence?: number;
  aiReason?: string;
  isApproved: boolean | null;
  email?: {
    subject?: string;
    sender?: string;
    receivedAt?: string;
    gmailMessageId: string;
  };
}

export interface Exam {
  id: string;
  subjectId?: string;
  title: string;
  examDate: string;
  duration?: number;
  venue?: string;
  syllabus?: SyllabusChapter[];
  notes?: string;
  totalMarks?: number;
  isCompleted: boolean;
  subject?: { name: string; color?: string };
}

export interface SyllabusChapter {
  chapter: string;
  topics: string[];
  completed: boolean;
}

export interface Notification {
  id: string;
  type: string;
  status: string;
  title: string;
  body: string;
  scheduledAt: string;
  readAt?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  profilePicture?: string;
  connectedAccounts?: { provider: string; isActive: boolean; tokenExpiry?: string }[];
  preferences?: UserPreference;
}

export interface UserPreference {
  timezone: string;
  theme: string;
  notificationsEnabled: boolean;
  pushWebEnabled: boolean;
  pushAndroidEnabled: boolean;
  phoneCallsEnabled: boolean;
  phoneNumber?: string;
  erpMonitoringEnabled: boolean;
  gmailSyncEnabled: boolean;
  defaultReminderTimes: number[];
}

export interface DashboardStats {
  total: number;
  completed: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  completionRate: number;
  byCategory: { category: string; _count: { _all: number } }[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: { total: number; page: number; pageSize: number; totalPages: number };
}
