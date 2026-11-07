import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  getDashboardStats,
  CreateTaskSchema,
  UpdateTaskSchema,
} from '../services/taskService';
import { sendSuccess, sendError, sendPaginated } from '../utils/apiResponse';
import { logger } from '../utils/logger';

export async function handleCreateTask(req: AuthRequest, res: Response) {
  try {
    const input = CreateTaskSchema.parse(req.body);
    const task = await createTask(req.user!.userId, input);
    return sendSuccess(res, task, 'Task created', 201);
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ success: false, errors: error.errors });
    logger.error('Create task error', error);
    return sendError(res, error.message || 'Failed to create task');
  }
}

export async function handleGetTasks(req: AuthRequest, res: Response) {
  try {
    const { status, category, priority, search, page, pageSize, dueBefore, dueAfter } = req.query;
    const result = await getTasks(req.user!.userId, {
      status: status as any,
      category: category as any,
      priority: priority as any,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      pageSize: pageSize ? parseInt(pageSize as string) : 20,
      dueBefore: dueBefore ? new Date(dueBefore as string) : undefined,
      dueAfter: dueAfter ? new Date(dueAfter as string) : undefined,
    });
    return sendPaginated(res, result.tasks, result.total, result.page, result.pageSize);
  } catch (error: any) {
    return sendError(res, 'Failed to fetch tasks');
  }
}

export async function handleGetTask(req: AuthRequest, res: Response) {
  try {
    const task = await getTaskById(req.user!.userId, req.params.id);
    if (!task) return sendError(res, 'Task not found', 404);
    return sendSuccess(res, task);
  } catch (error: any) {
    return sendError(res, 'Failed to fetch task');
  }
}

export async function handleUpdateTask(req: AuthRequest, res: Response) {
  try {
    const input = UpdateTaskSchema.parse(req.body);
    const task = await updateTask(req.user!.userId, req.params.id, input);
    return sendSuccess(res, task, 'Task updated');
  } catch (error: any) {
    if (error.message === 'Task not found') return sendError(res, 'Task not found', 404);
    if (error.name === 'ZodError') return res.status(400).json({ success: false, errors: error.errors });
    return sendError(res, 'Failed to update task');
  }
}

export async function handleDeleteTask(req: AuthRequest, res: Response) {
  try {
    await deleteTask(req.user!.userId, req.params.id);
    return sendSuccess(res, null, 'Task deleted');
  } catch (error: any) {
    if (error.message === 'Task not found') return sendError(res, 'Task not found', 404);
    return sendError(res, 'Failed to delete task');
  }
}

export async function handleDashboardStats(req: AuthRequest, res: Response) {
  try {
    const stats = await getDashboardStats(req.user!.userId);
    return sendSuccess(res, stats);
  } catch (error) {
    return sendError(res, 'Failed to fetch dashboard stats');
  }
}
