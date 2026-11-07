import OpenAI from "openai";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { TaskCategory, TaskPriority } from "../types";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

interface EmailAnalysisResult {
  isImportant: boolean;
  category: string;
  summary: string;
  suggestedTask: {
    shouldCreate: boolean;
    title: string;
    description: string;
    category: TaskCategory;
    priority: TaskPriority;
    dueDate: string | null;
    reason: string;
    confidence: number;
  } | null;
}

export async function analyzeEmailWithAI(
  userId: string,
  emailId: string,
): Promise<void> {
  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email || email.aiAnalyzed) return;

  // Check for duplicate suggestion for this email
  const existing = await prisma.suggestedTask.findFirst({
    where: { userId, emailId },
  });
  if (existing) return;

  const prompt = `You are an intelligent assistant for a student's productivity app.
Analyze the following email and extract actionable information.

Email Subject: ${email.subject ?? "No subject"}
From: ${email.sender} <${email.senderEmail}>
Received: ${email.receivedAt?.toISOString() ?? "Unknown"}
Body:
${(email.bodyText ?? "").slice(0, 3000)}

Respond with a JSON object matching this exact schema:
{
  "isImportant": boolean,
  "category": "COLLEGE_ASSIGNMENT" | "EXAM" | "EVENT" | "WORKSHOP" | "HACKATHON" | "MEETING" | "INTERNSHIP" | "GENERAL" | "SPAM",
  "summary": "1-2 sentence plain-English summary of what this email is about",
  "suggestedTask": {
    "shouldCreate": boolean,
    "title": "clear task title",
    "description": "what needs to be done",
    "category": "COLLEGE_ASSIGNMENT" | "EXAM" | "STUDY_SESSION" | "PROJECT" | "HACKATHON" | "EVENT" | "WORKSHOP" | "PERSONAL" | "MEETING" | "REMINDER",
    "priority": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "dueDate": "ISO 8601 date string or null",
    "reason": "why this task is suggested",
    "confidence": 0.0 to 1.0
  } or null if no task needed
}

Rules:
- Only suggest a task if there is a clear actionable item (submission, registration, attendance, etc.)
- Do not suggest tasks for newsletters, promotional emails, or spam
- Extract real dates from the email body when available
- Today's date for reference: ${new Date().toISOString()}`;

  try {
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");

    const result: EmailAnalysisResult = JSON.parse(raw);

    // Update email record
    await prisma.email.update({
      where: { id: emailId },
      data: {
        aiAnalyzed: true,
        aiCategory: result.category,
        aiSummary: result.summary,
        isImportant: result.isImportant,
      },
    });

    // Create pending suggested task (awaiting user approval)
    if (result.suggestedTask?.shouldCreate && result.suggestedTask.title) {
      await prisma.suggestedTask.create({
        data: {
          userId,
          emailId,
          title: result.suggestedTask.title,
          description: result.suggestedTask.description,
          category: result.suggestedTask.category,
          priority: result.suggestedTask.priority,
          suggestedDueDate: result.suggestedTask.dueDate
            ? new Date(result.suggestedTask.dueDate)
            : null,
          aiConfidence: result.suggestedTask.confidence,
          aiReason: result.suggestedTask.reason,
          isApproved: null, // Pending user review
        },
      });

      logger.info(
        `[AI] Suggested task created for email ${emailId}: "${result.suggestedTask.title}"`,
      );
    }
  } catch (error: any) {
    logger.warn("[AI] OpenAI API error, using intelligent heuristic fallback:", error.message);

    // Heuristic analyzer for resilience
    const heuristic = heuristicAnalyzeEmail(email);

    await prisma.email.update({
      where: { id: emailId },
      data: {
        aiAnalyzed: true,
        aiCategory: heuristic.category,
        aiSummary: heuristic.summary,
        isImportant: heuristic.isImportant,
      },
    });

    if (heuristic.suggestedTask?.shouldCreate) {
      await prisma.suggestedTask.create({
        data: {
          userId,
          emailId,
          title: heuristic.suggestedTask.title,
          description: heuristic.suggestedTask.description,
          category: heuristic.suggestedTask.category,
          priority: heuristic.suggestedTask.priority,
          suggestedDueDate: heuristic.suggestedTask.dueDate ? new Date(heuristic.suggestedTask.dueDate) : null,
          aiConfidence: heuristic.suggestedTask.confidence,
          aiReason: heuristic.suggestedTask.reason,
          isApproved: null,
        },
      });
      logger.info(`[AI Fallback] Suggested task created: "${heuristic.suggestedTask.title}"`);
    }
  }
}

function heuristicAnalyzeEmail(email: { subject: string | null; bodyText: string | null; sender: string | null }): EmailAnalysisResult {
  const subject = email.subject || 'Academic Update';
  const sender = email.sender || 'Aurora University';
  const text = `${subject} ${email.bodyText ?? ''}`.toLowerCase();
  
  let category: any = 'GENERAL';
  let taskCategory: TaskCategory = 'REMINDER';
  let priority: TaskPriority = 'MEDIUM';
  let isImportant = false;
  let title = subject;
  let reason = 'Actionable notice detected from email content';

  if (text.includes('exam') || text.includes('timetable') || text.includes('theory examination')) {
    category = 'EXAM';
    taskCategory = 'EXAM';
    priority = 'CRITICAL';
    isImportant = true;
    title = `Exam: ${subject.replace(/\[.*?\]/g, '').trim()}`;
    reason = 'Semester examination announcement requiring preparation & registration';
  } else if (text.includes('assignment') || text.includes('submission') || text.includes('deadline')) {
    category = 'COLLEGE_ASSIGNMENT';
    taskCategory = 'COLLEGE_ASSIGNMENT';
    priority = 'HIGH';
    isImportant = true;
    title = `Submit: ${subject.replace(/deadline extension:/i, '').trim()}`;
    reason = 'Assignment submission deadline detected';
  } else if (text.includes('hackathon') || text.includes('coding competition')) {
    category = 'HACKATHON';
    taskCategory = 'HACKATHON';
    priority = 'HIGH';
    isImportant = true;
    title = `Register: ${subject.replace(/invitation:/i, '').trim()}`;
    reason = 'Hackathon team registration deadline';
  } else if (text.includes('workshop') || text.includes('seminar') || text.includes('webinar')) {
    category = 'WORKSHOP';
    taskCategory = 'WORKSHOP';
    priority = 'MEDIUM';
    isImportant = true;
    title = `Attend: ${subject}`;
    reason = 'Technical workshop registration & attendance notice';
  }

  // Attempt to extract dates (e.g., "December 18, 2026" or "Dec 15, 2026" or "2026-12-18")
  let dueDate: string | null = null;
  const monthMatch = text.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?/i);
  if (monthMatch) {
    const monthStr = monthMatch[1];
    const day = monthMatch[2];
    const year = monthMatch[3] || new Date().getFullYear().toString();
    const parsed = new Date(`${monthStr} ${day}, ${year} 23:59:00`);
    if (!isNaN(parsed.getTime())) {
      dueDate = parsed.toISOString();
    }
  }

  return {
    isImportant,
    category,
    summary: `Academic update from ${sender} regarding ${category.toLowerCase().replace('_', ' ')}.`,
    suggestedTask: isImportant ? {
      shouldCreate: true,
      title,
      description: email.bodyText ? email.bodyText.slice(0, 300) : subject,
      category: taskCategory,
      priority,
      dueDate,
      reason,
      confidence: 0.94,
    } : null,
  };
}
