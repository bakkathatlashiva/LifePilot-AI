import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import { prisma } from '../config/database';
import { sendError } from '../utils/apiResponse';
import { valkeyCache } from '../config/valkey';

export interface AuthRequest extends Request {
  user?: JWTPayload & { id: string };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return sendError(res, 'Authentication required', 401);
    }

    // Check Valkey revocation blacklist
    const isRevoked = await valkeyCache.isTokenBlacklisted(token);
    if (isRevoked) {
      return sendError(res, 'Session terminated. Please sign in again.', 401);
    }

    const payload = verifyAccessToken(token);

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return sendError(res, 'User not found or deactivated', 401);
    }

    req.user = { ...payload, id: payload.userId };
    next();
  } catch (error) {
    return sendError(res, 'Invalid or expired token', 401);
  }
}
