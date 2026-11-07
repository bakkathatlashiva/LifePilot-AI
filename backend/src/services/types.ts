// Shared type definitions used before Prisma generates its client enums.
// Once `npx prisma generate` runs, you can import directly from '@prisma/client'.

export type TaskCategory =
  | 'COLLEGE_ASSIGNMENT' | 'EXAM' | 'STUDY_SESSION' | 'PROJECT'
  | 'HACKATHON' | 'EVENT' | 'WORKSHOP' | 'PERSONAL' | 'MEETING' | 'REMINDER';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatus = 'UPCOMING' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
export type TaskSource = 'ERP' | 'GMAIL' | 'MANUAL' | 'AI_SUGGESTED';
export type AssignmentStatus = 'UPCOMING' | 'AVAILABLE' | 'CLOSED' | 'CANCELLED';
export type SyncStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'RUNNING';
export type NotificationType = 'PUSH_ANDROID' | 'PUSH_WEB' | 'EMAIL' | 'PHONE_CALL' | 'IN_APP';
export type CallStatus = 'QUEUED' | 'INITIATED' | 'RINGING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'BUSY' | 'NO_ANSWER';
