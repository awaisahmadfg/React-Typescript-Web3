import type { Request, Response } from "express";
import { activityTimeline } from "@shared/schema";
import { sql } from "drizzle-orm";
import { db } from "../database/db";
import { storage } from "../database/storage";
import type { IdParam, TaskCreateBody, TaskFiltersQuery, TaskUpdateBody } from "../types/payloads";

export const taskHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as { id: string; role: string; teamId?: string | null } | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const filters = req.query as TaskFiltersQuery;
    const tasks = await storage.getTasks(filters);

    if (currentUser.role === "ADMIN") {
      return res.json(tasks);
    }

    if (currentUser.role === "TEAM_LEAD") {
      const teamLeads = await storage.getLeads({
        teamId: currentUser.teamId ?? undefined,
        includeStale: "true",
      });
      const teamLeadIds = new Set(teamLeads.map((lead) => lead.id));
      return res.json(tasks.filter((task) => teamLeadIds.has(task.leadId)));
    }

    return res.json(tasks.filter((task) => task.userId === currentUser.id));
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as { id: string; role: string; teamId?: string | null } | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const body = req.body as TaskCreateBody;
    const { leadId, userId, type, status, priority, dueDate, notes } = body;

    if (!leadId || !type || !dueDate) {
      return res.status(400).json({ message: "leadId, type and dueDate are required" });
    }

    const [lead] = await storage.getLeads({ id: leadId, includeStale: "true" });
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    let effectiveUserId = userId || currentUser.id;
    const assignee = await storage.getUser(effectiveUserId);
    if (!assignee || assignee.role !== "TEAM_LEAD") {
      return res.status(400).json({ message: "Task assignee must be a Team Lead." });
    }
    if (currentUser.role === "ADMIN") {
      if (lead.teamId && assignee.teamId !== lead.teamId) {
        return res
          .status(400)
          .json({ message: "Selected Team Lead must belong to the lead's assigned team." });
      }
    } else if (currentUser.role === "TEAM_LEAD") {
      if (lead.teamId !== currentUser.teamId) {
        return res.status(403).json({ message: "You can only create tasks for leads in your team." });
      }
      if (assignee.teamId !== currentUser.teamId) {
        return res.status(403).json({ message: "You can only assign tasks to Team Leads in your team." });
      }
    } else {
      if (lead.ownerId !== currentUser.id) {
        return res.status(403).json({ message: "You can only create tasks for your own leads." });
      }
      if (!currentUser.teamId || assignee.teamId !== currentUser.teamId) {
        return res.status(403).json({ message: "You can only assign tasks to your team's Team Lead." });
      }
    }

    const task = await storage.createTask({
      leadId,
      userId: effectiveUserId,
      type,
      status: status ?? "OPEN",
      priority: priority ?? "MEDIUM",
      dueDate,
      notes,
    });

    // Log creation into activity timeline so Lead Profile Activity Journey reflects it
    try {
      const leadsForActivity = await storage.getLeads({ id: leadId });
      const teamId = leadsForActivity[0]?.teamId ?? "unassigned";

      const dueDateLabel = new Date(`${dueDate}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      await db.insert(activityTimeline).values({
        leadId,
        teamId,
        createdByUserId: currentUser.id,
        activityType: "task_created",
        body: `Task created: ${type} (due ${dueDateLabel})`,
        notes: notes ?? null,
        // Store UTC-normalized timestamp to avoid client timezone double shifts.
        happenedAt: sql`NOW() AT TIME ZONE 'UTC'`,
      });
    } catch {
      // Non-fatal if logging fails
    }

    res.status(201).json(task);
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const body = req.body as TaskUpdateBody;
    const previousTasks = await storage.getTasks({ id });
    const previous = previousTasks[0];

    const updated = await storage.updateTask(id, body);

    // If status transitioned to COMPLETED, log it in the activity timeline
    if (updated && previous && previous.status !== "COMPLETED" && updated.status === "COMPLETED") {
      try {
        const leadsForActivity = await storage.getLeads({ id: updated.leadId });
        const teamId = leadsForActivity[0]?.teamId ?? "unassigned";

        await db.insert(activityTimeline).values({
          leadId: updated.leadId,
          teamId,
          createdByUserId: updated.userId,
          activityType: "task_completed",
          body: `Task completed: ${updated.type}`,
          notes: updated.notes ?? null,
          // Store UTC-normalized timestamp to avoid client timezone double shifts.
          happenedAt: sql`NOW() AT TIME ZONE 'UTC'`,
        });
      } catch {
        // non-fatal
      }
    }

    res.json(updated);
  },

  remove: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    await storage.deleteTask(id);
    res.status(204).end();
  },
};
