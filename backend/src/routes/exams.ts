import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const CreateExamSchema = z.object({
  subjectId: z.string().uuid().optional(),
  title: z.string().min(1),
  examDate: z.string().datetime(),
  duration: z.number().optional(),
  venue: z.string().optional(),
  syllabus: z.array(z.object({
    chapter: z.string(),
    topics: z.array(z.string()),
    completed: z.boolean().default(false),
  })).optional(),
  notes: z.string().optional(),
  totalMarks: z.number().optional(),
  passingMarks: z.number().optional(),
});

// Subjects
router.get('/subjects', async (req: AuthRequest, res: Response) => {
  try {
    const subjects = await prisma.subject.findMany({
      where: { userId: req.user!.userId },
      include: { _count: { select: { exams: true, studySessions: true } } },
    });
    return sendSuccess(res, subjects);
  } catch (error) {
    return sendError(res, 'Failed to fetch subjects');
  }
});

router.post('/subjects', async (req: AuthRequest, res: Response) => {
  try {
    const { name, code, semester, credits, color } = req.body;
    if (!name) return sendError(res, 'name is required', 400);

    const subject = await prisma.subject.create({
      data: { userId: req.user!.userId, name, code, semester, credits, color },
    });
    return sendSuccess(res, subject, 'Subject created', 201);
  } catch (error) {
    return sendError(res, 'Failed to create subject');
  }
});

// Exams
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { upcoming } = req.query;
    const where = {
      userId: req.user!.userId,
      ...(upcoming === 'true' && { examDate: { gte: new Date() }, isCompleted: false }),
    };

    const exams = await prisma.exam.findMany({
      where,
      orderBy: { examDate: 'asc' },
      include: { subject: true, _count: { select: { studySessions: true } } },
    });

    return sendSuccess(res, exams);
  } catch (error) {
    return sendError(res, 'Failed to fetch exams');
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const input = CreateExamSchema.parse(req.body);
    const exam = await prisma.exam.create({
      data: {
        userId: req.user!.userId,
        ...input,
        examDate: new Date(input.examDate),
        syllabus: input.syllabus as any,
      },
    });

    // Auto-create a task for this exam
    await prisma.task.create({
      data: {
        userId: req.user!.userId,
        title: `Exam: ${exam.title}`,
        description: exam.notes ?? undefined,
        category: 'EXAM',
        source: 'MANUAL',
        deadline: exam.examDate,
        priority: 'CRITICAL',
        status: 'UPCOMING',
        reminderSchedules: {
          create: [
            { userId: req.user!.userId, minutesBefore: 2880, channels: ['PUSH_ANDROID', 'PUSH_WEB'] },
            { userId: req.user!.userId, minutesBefore: 1440, channels: ['PUSH_ANDROID', 'PUSH_WEB'] },
            { userId: req.user!.userId, minutesBefore: 60, channels: ['PUSH_ANDROID', 'PUSH_WEB'] },
          ],
        },
      },
    });

    return sendSuccess(res, exam, 'Exam created', 201);
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ success: false, errors: error.errors });
    return sendError(res, 'Failed to create exam');
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const exam = await prisma.exam.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!exam) return sendError(res, 'Exam not found', 404);

    const updated = await prisma.exam.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        ...(req.body.examDate && { examDate: new Date(req.body.examDate) }),
      },
    });
    return sendSuccess(res, updated);
  } catch (error) {
    return sendError(res, 'Failed to update exam');
  }
});

// Study Sessions
router.get('/study-sessions', async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await prisma.studySession.findMany({
      where: { userId: req.user!.userId },
      orderBy: { scheduledAt: 'asc' },
      include: { subject: true, exam: { select: { title: true, examDate: true } } },
    });
    return sendSuccess(res, sessions);
  } catch (error) {
    return sendError(res, 'Failed to fetch study sessions');
  }
});

router.post('/study-sessions', async (req: AuthRequest, res: Response) => {
  try {
    const { subjectId, examId, title, scheduledAt, durationMin, notes, topicsCovered } = req.body;
    if (!title || !scheduledAt) return sendError(res, 'title and scheduledAt are required', 400);

    const session = await prisma.studySession.create({
      data: {
        userId: req.user!.userId,
        subjectId,
        examId,
        title,
        scheduledAt: new Date(scheduledAt),
        durationMin: durationMin ?? 60,
        notes,
        topicsCovered: topicsCovered ?? [],
      },
    });
    return sendSuccess(res, session, 'Study session created', 201);
  } catch (error) {
    return sendError(res, 'Failed to create study session');
  }
});

router.put('/study-sessions/:id/complete', async (req: AuthRequest, res: Response) => {
  try {
    const session = await prisma.studySession.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!session) return sendError(res, 'Session not found', 404);

    const updated = await prisma.studySession.update({
      where: { id: req.params.id },
      data: {
        isCompleted: true,
        completedAt: new Date(),
        topicsCovered: req.body.topicsCovered ?? session.topicsCovered,
        notes: req.body.notes ?? session.notes,
      },
    });
    return sendSuccess(res, updated, 'Study session completed');
  } catch (error) {
    return sendError(res, 'Failed to complete study session');
  }
});

export default router;
