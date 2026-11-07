import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode = 200, meta?: Record<string, unknown>) {
  return res.status(statusCode).json({ success: true, data, message, meta } satisfies ApiResponse<T>);
}

export function sendError(res: Response, message: string, statusCode = 500, error?: string) {
  return res.status(statusCode).json({ success: false, message, error } satisfies ApiResponse);
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  pageSize: number
) {
  return res.status(200).json({
    success: true,
    data,
    meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
  } satisfies ApiResponse<T[]>);
}
