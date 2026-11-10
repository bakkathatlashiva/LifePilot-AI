export type TaskCategory =
  | 'COLLEGE_ASSIGNMENT'
  | 'EXAM'
  | 'STUDY_SESSION'
  | 'PROJECT'
  | 'HACKATHON'
  | 'EVENT'
  | 'WORKSHOP'
  | 'PERSONAL'
  | 'MEETING'
  | 'REMINDER';

export type TaskStatus =
  | 'UPCOMING'
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'OVERDUE'
  | 'CANCELLED';

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
  bodyText?: string;
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
  };
}

export interface Exam {
  id: string;
  userId: string;
  subjectId?: string;
  subject?: { id: string; name: string; code?: string };
  title: string;
  examDate: string;
  duration?: number;
  venue?: string;
  syllabus?: string;
  notes?: string;
  totalMarks?: number;
  passingMarks?: number;
  isCompleted: boolean;
  score?: number;
  createdAt: string;
}

export interface StudySession {
  id: string;
  userId: string;
  subjectId?: string;
  subject?: { id: string; name: string; code?: string };
  examId?: string;
  exam?: { id: string; title: string; examDate: string };
  title: string;
  scheduledAt: string;
  durationMin: number;
  notes?: string;
  isCompleted: boolean;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  status: string;
  scheduledAt: string;
  sentAt?: string;
  readAt?: string;
  createdAt: string;
}

export interface UserPreference {
  id: string;
  userId: string;
  notificationsEnabled: boolean;
  pushWebEnabled: boolean;
  pushAndroidEnabled: boolean;
  emailNotificationsEnabled?: boolean;
  smsNotificationsEnabled?: boolean;
  smsGatewayEnabled?: boolean;
  phoneNumber?: string;
  telegramChatId?: string;
}

export interface DashboardStats {
  total: number;
  completed: number;
  inProgress: number;
  upcoming: number;
  overdue: number;
  dueToday: number;
  completionRate: number;
}

