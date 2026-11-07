import { prisma } from "../config/database";
import { z } from "zod";
import { valkeyCache } from "../config/valkey";

// ─── Enums as const (Prisma enums not available until `prisma generate`) ─────
const TASK_CATEGORIES = [
  "COLLEGE_ASSIGNMENT",
  "EXAM",
  "STUDY_SESSION",
  "PROJECT",
  "HACKATHON",
  "EVENT",
  "WORKSHOP",
  "PERSONAL",
  "MEETING",
  "REMINDER",
] as const;

const TASK_STATUSES = [
  "UPCOMING",
  "AVAILABLE",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
  "CANCELLED",
] as const;
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const TASK_SOURCES = ["ERP", "GMAIL", "MANUAL", "AI_SUGGESTED"] as const;

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  category: z.enum(TASK_CATEGORIES),
  source: z.enum(TASK_SOURCES).optional().default("MANUAL"),
  startDate: z.string().datetime().optional(),
  openingDate: z.string().datetime().optional(),
  deadline: z.string().datetime().optional(),
  priority: z.enum(TASK_PRIORITIES).optional().default("MEDIUM"),
  tags: z.array(z.string()).optional().default([]),
  isRecurring: z.boolean().optional().default(false),
  recurringRule: z.string().optional(),
  reminderMinutes: z.array(z.number()).optional().default([1440, 60, 30]),
});

export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  status: z.enum(TASK_STATUSES).optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export async function createTask(userId: string, input: CreateTaskInput) {
  const task = await prisma.task.create({
    data: {
      userId,
      title: input.title,
      description: input.description,
      category: input.category as any,
      source: (input.source ?? "MANUAL") as any,
      startDate: input.startDate ? new Date(input.startDate as string) : null,
      openingDate: input.openingDate
        ? new Date(input.openingDate as string)
        : null,
      deadline: input.deadline ? new Date(input.deadline as string) : null,
      priority: (input.priority ?? "MEDIUM") as any,
      tags: input.tags ?? [],
      isRecurring: input.isRecurring ?? false,
      recurringRule: input.recurringRule,
      reminderSchedules: {
        create: (input.reminderMinutes ?? [1440, 60, 30]).map(
          (minutes: number) => ({
            userId,
            minutesBefore: minutes,
            channels: ["PUSH_ANDROID", "PUSH_WEB"] as any,
          }),
        ),
      },
    },
    include: { reminderSchedules: true },
  });
  await valkeyCache.del(`valkey:stats:${userId}`).catch(() => {});
  return task;
}

export async function getTasks(
  userId: string,
  filters: {
    status?: string;
    category?: string;
    priority?: string;
    search?: string;
    page?: number;
    pageSize?: number;
    dueBefore?: Date;
    dueAfter?: Date;
  },
) {
  const { page = 1, pageSize = 20, ...rest } = filters;
  const skip = (page - 1) * pageSize;

  const where: any = {
    userId,
    ...(rest.status && { status: rest.status }),
    ...(rest.category && { category: rest.category }),
    ...(rest.priority && { priority: rest.priority }),
    ...(rest.search && {
      OR: [
        { title: { contains: rest.search, mode: "insensitive" } },
        { description: { contains: rest.search, mode: "insensitive" } },
      ],
    }),
    ...(rest.dueBefore && { deadline: { lte: rest.dueBefore } }),
    ...(rest.dueAfter && { deadline: { gte: rest.dueAfter } }),
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [
        { deadline: "asc" },
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    }),
    prisma.task.count({ where }),
  ]);

  return { tasks, total, page, pageSize };
}

export async function getTaskById(userId: string, taskId: string) {
  return prisma.task.findFirst({
    where: { id: taskId, userId },
    include: {
      reminderSchedules: true,
      erpAssignment: true,
      suggestedTask: { include: { email: true } },
      notifications: { orderBy: { scheduledAt: "desc" }, take: 10 },
    },
  });
}

export async function updateTask(
  userId: string,
  taskId: string,
  input: UpdateTaskInput,
) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("Task not found");

  const data: any = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.category !== undefined && { category: input.category }),
    ...(input.priority !== undefined && { priority: input.priority }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.deadline !== undefined && {
      deadline: input.deadline ? new Date(input.deadline as string) : null,
    }),
    ...(input.startDate !== undefined && {
      startDate: input.startDate ? new Date(input.startDate as string) : null,
    }),
    ...(input.openingDate !== undefined && {
      openingDate: input.openingDate
        ? new Date(input.openingDate as string)
        : null,
    }),
    ...(input.tags !== undefined && { tags: input.tags }),
    ...(input.isRecurring !== undefined && { isRecurring: input.isRecurring }),
    ...(input.recurringRule !== undefined && {
      recurringRule: input.recurringRule,
    }),
  };

  if (input.status === "COMPLETED") {
    data.completedAt = new Date();
  }

  const updated = await prisma.task.update({ where: { id: taskId }, data });
  await valkeyCache.del(`valkey:stats:${userId}`).catch(() => {});
  return updated;
}

export async function deleteTask(userId: string, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("Task not found");
  await prisma.task.delete({ where: { id: taskId } });
  await valkeyCache.del(`valkey:stats:${userId}`).catch(() => {});
}

export async function getDashboardStats(userId: string) {
  const cacheKey = `valkey:stats:${userId}`;
  const cached = await valkeyCache.get<any>(cacheKey);
  if (cached) {
    return cached;
  }

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [total, completed, overdue, dueToday, dueThisWeek, byCategory] =
    await Promise.all([
      prisma.task.count({ where: { userId, status: { not: "CANCELLED" } } }),
      prisma.task.count({ where: { userId, status: "COMPLETED" } }),
      prisma.task.count({ where: { userId, status: "OVERDUE" } }),
      prisma.task.count({
        where: {
          userId,
          deadline: { gte: todayStart, lte: todayEnd },
          status: { not: "COMPLETED" },
        },
      }),
      prisma.task.count({
        where: {
          userId,
          deadline: { gte: new Date(), lte: weekEnd },
          status: { not: "COMPLETED" },
        },
      }),
      prisma.task.groupBy({
        by: ["category"],
        where: { userId },
        _count: { _all: true },
      }),
    ]);

  const stats = {
    total,
    completed,
    overdue,
    dueToday,
    dueThisWeek,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
    byCategory,
  };

  await valkeyCache.set(cacheKey, stats, 30);
  return stats;
}
