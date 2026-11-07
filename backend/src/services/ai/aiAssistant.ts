import OpenAI from "openai";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function chatWithAssistant(
  userId: string,
  message: string,
): Promise<string> {
  // Gather current context from DB
  const now = new Date();
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [tasks, overdueTasks, exams, pendingSuggestions, allAssignmentsCount] = await Promise.all([
    prisma.task.findMany({
      where: {
        userId,
        status: { in: ["UPCOMING", "AVAILABLE", "IN_PROGRESS"] },
      },
      orderBy: { deadline: "asc" },
      take: 20,
    }),
    prisma.task.findMany({
      where: { userId, status: "OVERDUE" },
      orderBy: { deadline: "asc" },
      take: 10,
    }),
    prisma.exam.findMany({
      where: { userId, examDate: { gte: now }, isCompleted: false },
      orderBy: { examDate: "asc" },
      take: 10,
    }),
    prisma.suggestedTask.findMany({
      where: { userId, isApproved: null },
      take: 5,
    }),
    prisma.eRPAssignment.count({
      where: { erpConnection: { userId } },
    }),
  ]);

  const context = `
Current Date/Time: ${now.toISOString()}
Total Tracked ERP Assignments: ${allAssignmentsCount}
User's Upcoming Tasks: ${JSON.stringify(
    tasks.slice(0, 10).map((t: (typeof tasks)[0]) => ({
      title: t.title,
      category: t.category,
      deadline: t.deadline,
      priority: t.priority,
      status: t.status,
    })),
  )}
Overdue Tasks: ${JSON.stringify(overdueTasks.map((t: (typeof overdueTasks)[0]) => ({ title: t.title, deadline: t.deadline })))}
Upcoming Exams: ${JSON.stringify(exams.map((e: (typeof exams)[0]) => ({ title: e.title, examDate: e.examDate })))}
Pending Task Suggestions (from emails): ${pendingSuggestions.length}
`;

  const systemPrompt = `You are LifePilot AI, an intelligent personal assistant for a student.
You have access to the user's real task data, deadlines, and exams.
Answer questions accurately based on the provided context.
Be concise, helpful, and proactive about urgent items.
When the user asks to create a task, respond with a JSON action: {"action":"create_task","data":{...}}
When the user asks to show tasks, provide a clear summary from the context data.
Never fabricate data — if something isn't in the context, say so.

Context:
${context}`;

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    return (
      response.choices[0]?.message?.content ??
      "I could not generate a response. Please try again."
    );
  } catch (error: any) {
    logger.warn("[AI Assistant] OpenAI API unavailable, using local intelligence engine:", error.message);
    return localChatFallback(message, tasks, overdueTasks, exams, pendingSuggestions.length, allAssignmentsCount);
  }
}

function localChatFallback(
  message: string,
  tasks: any[],
  overdueTasks: any[],
  exams: any[],
  pendingSuggestionsCount: number,
  allAssignmentsCount: number
): string {
  const q = message.toLowerCase();

  if (q.includes("assignment") || q.includes("task") || q.includes("pending") || q.includes("closing") || q.includes("due")) {
    const topTasks = tasks.slice(0, 5).map(t => `• ${t.title}${t.deadline ? ` (Due: ${new Date(t.deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })})` : ''}`).join('\n');
    return `You have **${allAssignmentsCount || tasks.length} assignments and tasks** tracked in your LifePilot workspace.\n\n**Next upcoming:**\n${topTasks || 'No immediate upcoming deadlines.'}\n\nYou can view and manage all of them in the **ERP Assignments** or **My Tasks** tabs.`;
  }

  if (q.includes("exam") || q.includes("test")) {
    if (exams.length > 0) {
      const examList = exams.map(e => `• ${e.title} on ${new Date(e.examDate).toLocaleDateString('en-IN')}`).join('\n');
      return `Here are your scheduled examinations:\n${examList}`;
    }
    return `You have end-semester examinations announced starting **December 22, 2026**. Check your **Exams** tab to add subject-wise preparation modules.`;
  }

  if (q.includes("email") || q.includes("suggestion") || q.includes("gmail")) {
    return `You have **${pendingSuggestionsCount} pending task suggestions** detected from your academic emails (including exam notices and deadline extensions). Head over to **Gmail Intelligence** to approve or edit them.`;
  }

  if (q.includes("remind") || q.includes("create")) {
    return `To create a task, you can add it directly in **My Tasks** or tell me what to remind you of with a deadline!`;
  }

  return `I'm tracking **${allAssignmentsCount} Aurora ERP assignments** and **${pendingSuggestionsCount} email suggestions** for you. Ask me about your upcoming assignments, exam dates, or study schedules!`;
}

export async function generateDailyBriefing(
  userId: string,
  type: "morning" | "evening",
): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const [todayTasks, upcomingTasks, completedToday, overdue, upcomingExams, importantEmails, totalAssignments] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          userId,
          deadline: { gte: todayStart, lte: todayEnd },
          status: { not: "COMPLETED" },
        },
        orderBy: [{ priority: "desc" }, { deadline: "asc" }],
      }),
      prisma.task.findMany({
        where: {
          userId,
          status: { in: ["UPCOMING", "AVAILABLE", "IN_PROGRESS"] },
        },
        orderBy: { deadline: "asc" },
        take: 5,
      }),
      prisma.task.findMany({
        where: { userId, completedAt: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.task.findMany({
        where: { userId, status: "OVERDUE" },
        orderBy: { deadline: "asc" },
      }),
      prisma.exam.findMany({
        where: {
          userId,
          examDate: {
            gte: now,
            lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
          isCompleted: false,
        },
        orderBy: { examDate: "asc" },
      }),
      prisma.email.findMany({
        where: { userId, isImportant: true },
        orderBy: { receivedAt: "desc" },
        take: 5,
      }),
      prisma.eRPAssignment.count({
        where: { erpConnection: { userId } },
      }),
    ]);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  const userName = user?.name ? user.name.split(" ")[0] : "there";

  const isMorning = type === "morning";
  const prompt = isMorning
    ? `Generate a friendly, concise morning briefing for a student named ${userName}. Today is ${now.toDateString()}.
Today's tasks: ${JSON.stringify(todayTasks.map((t: (typeof todayTasks)[0]) => ({ title: t.title, deadline: t.deadline, priority: t.priority })))}
Upcoming deadlines: ${JSON.stringify(upcomingTasks.map((t: (typeof upcomingTasks)[0]) => ({ title: t.title, deadline: t.deadline })))}
Total ERP assignments tracked: ${totalAssignments}
Overdue tasks: ${overdue.length}
Upcoming exams: ${JSON.stringify(upcomingExams.map((e: (typeof upcomingExams)[0]) => ({ title: e.title, date: e.examDate })))}
Important emails today: ${importantEmails.length}
Be motivating, highlight urgent items, keep it clean and formatted with bullet points. Under 200 words.`
    : `Generate a friendly evening summary for a student named ${userName}. Today is ${now.toDateString()}.
Completed today: ${completedToday.length} tasks
Still pending: ${todayTasks.length} tasks today, ${totalAssignments} total assignments tracked
Overdue: ${overdue.length} tasks
Upcoming priorities: ${JSON.stringify(upcomingTasks.slice(0, 3).map((t: (typeof upcomingTasks)[0]) => t.title))}
Be encouraging, acknowledge progress, and set a positive tone for tomorrow. Keep it under 200 words.`;

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 400,
    });

    return (
      response.choices[0]?.message?.content ??
      generateSmartLocalBriefing(userName, type, upcomingTasks, overdue.length, completedToday.length, upcomingExams.length, importantEmails.length, totalAssignments)
    );
  } catch (error: any) {
    logger.warn("[AI Briefing] OpenAI unavailable, using smart local generator:", error.message);
    return generateSmartLocalBriefing(userName, type, upcomingTasks, overdue.length, completedToday.length, upcomingExams.length, importantEmails.length, totalAssignments);
  }
}

function generateSmartLocalBriefing(
  userName: string,
  type: "morning" | "evening",
  upcomingTasks: any[],
  overdueCount: number,
  completedTodayCount: number,
  examCount: number,
  emailCount: number,
  totalAssignments: number
): string {
  const dateStr = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (type === "morning") {
    const upcomingList = upcomingTasks.slice(0, 3).map(t => {
      const due = t.deadline ? ` (Due ${new Date(t.deadline).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })})` : '';
      return `  • ${t.title}${due}`;
    }).join('\n');

    return `Good morning, ${userName}! ☀️\n\nHere is your academic briefing for ${dateStr}:\n\n` +
      `📚 Aurora ERP: ${totalAssignments} active assignments tracked across all enrolled subjects.\n` +
      (upcomingList ? `⏳ Next Approaching Deadlines:\n${upcomingList}\n` : '') +
      (emailCount > 0 ? `📧 Academic Emails: ${emailCount} notices analyzed in Gmail Intelligence.\n` : '') +
      (overdueCount > 0 ? `⚠️ Overdue Items: ${overdueCount} task(s) require attention.\n` : '') +
      `\n💡 Priority: Keep progressing through your lab coursework and check your task suggestions. Have a productive day!`;
  } else {
    return `Good evening, ${userName}! 🌙\n\nHere is your daily recap for ${dateStr}:\n\n` +
      `✅ Progress: ${completedTodayCount} task(s) marked complete today.\n` +
      `📚 Aurora ERP: All ${totalAssignments} course assessments remain synchronized.\n` +
      `🎯 Priorities for tomorrow:\n` +
      upcomingTasks.slice(0, 3).map(t => `  • ${t.title}`).join('\n') +
      `\n\n🌟 Great work staying on top of your semester responsibilities. Rest well tonight!`;
  }
}

export async function parseNaturalLanguageTask(userId: string, text: string) {
  const prompt = `Parse this natural language task request into structured data.
Input: "${text}"
Current date: ${new Date().toISOString()}

Respond with JSON:
{
  "title": "task title",
  "description": "details if any",
  "category": "COLLEGE_ASSIGNMENT|EXAM|STUDY_SESSION|PROJECT|HACKATHON|EVENT|WORKSHOP|PERSONAL|MEETING|REMINDER",
  "priority": "LOW|MEDIUM|HIGH|CRITICAL",
  "deadline": "ISO 8601 datetime or null",
  "needsClarification": boolean,
  "clarificationQuestion": "question to ask user if date/time is ambiguous, else null"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 400,
    });

    return JSON.parse(response.choices[0]?.message?.content ?? "{}");
  } catch (error: any) {
    logger.warn("[AI Parser] OpenAI unavailable, using heuristic task parser:", error.message);
    
    // Fallback heuristic parser
    const lower = text.toLowerCase();
    let category = "PERSONAL";
    let priority = "MEDIUM";
    if (lower.includes("assignment") || lower.includes("lab") || lower.includes("quiz")) category = "COLLEGE_ASSIGNMENT";
    if (lower.includes("exam") || lower.includes("test")) { category = "EXAM"; priority = "HIGH"; }
    if (lower.includes("project")) { category = "PROJECT"; priority = "HIGH"; }

    let deadline: string | null = null;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (lower.includes("tomorrow")) {
      if (lower.includes("8 pm") || lower.includes("8pm")) tomorrow.setHours(20, 0, 0, 0);
      else if (lower.includes("9 am") || lower.includes("9am")) tomorrow.setHours(9, 0, 0, 0);
      else tomorrow.setHours(18, 0, 0, 0);
      deadline = tomorrow.toISOString();
    }

    const title = text.replace(/remind me to/i, '').replace(/remind me/i, '').trim();

    return {
      title: title || text,
      description: text,
      category,
      priority,
      deadline,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }
}
