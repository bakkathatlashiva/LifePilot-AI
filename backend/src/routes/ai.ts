import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { chatWithAssistant, generateDailyBriefing, parseNaturalLanguageTask } from '../services/ai/aiAssistant';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { aiLimiter } from '../middleware/rateLimiter';
import { createTask } from '../services/taskService';
import { valkeyCache } from '../config/valkey';

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);

// AI Chat
router.post('/chat', async (req: AuthRequest, res: Response) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') return sendError(res, 'message is required', 400);

    const response = await chatWithAssistant(req.user!.userId, message);

    // Handle action responses from AI
    try {
      const parsed = JSON.parse(response);
      if (parsed.action === 'create_task' && parsed.data) {
        const task = await createTask(req.user!.userId, {
          ...parsed.data,
          source: 'AI_SUGGESTED',
        });
        return sendSuccess(res, { message: `Task "${task.title}" created!`, task, type: 'task_created' });
      }
    } catch {
      // Not JSON, return as plain text
    }

    return sendSuccess(res, { message: response, type: 'text' });
  } catch (error: any) {
    return sendError(res, error.message || 'AI assistant error');
  }
});

// Daily briefing with Valkey caching
router.get('/briefing/:type', async (req: AuthRequest, res: Response) => {
  try {
    const type = req.params.type as 'morning' | 'evening';
    if (!['morning', 'evening'].includes(type)) return sendError(res, 'type must be morning or evening', 400);

    const userId = req.user!.userId;
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `valkey:briefing:${userId}:${type}:${today}`;
    const forceRefresh = req.query.refresh === 'true';

    if (!forceRefresh) {
      const cached = await valkeyCache.get(cacheKey);
      if (cached) {
        return sendSuccess(res, cached);
      }
    }

    const briefing = await generateDailyBriefing(userId, type);
    const payload = { briefing, type, generatedAt: new Date() };

    // Cache in Valkey for 30 minutes
    await valkeyCache.set(cacheKey, payload, 1800);

    return sendSuccess(res, payload);
  } catch (error: any) {
    return sendError(res, error.message || 'Failed to generate briefing');
  }
});

// Parse natural language task
router.post('/parse-task', async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) return sendError(res, 'text is required', 400);

    const parsed = await parseNaturalLanguageTask(req.user!.userId, text);
    return sendSuccess(res, parsed);
  } catch (error: any) {
    return sendError(res, error.message || 'Failed to parse task');
  }
});

export default router;
