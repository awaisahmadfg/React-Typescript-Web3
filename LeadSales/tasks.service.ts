import type { Request, Response } from "express";
import { activityTimeline, type User } from "@shared/schema";
import { sql } from "drizzle-orm";
import { db } from "../database/db";
import { storage } from "../database/storage";
import type { IdParam, TaskCreateBody, TaskFiltersQuery, TaskUpdateBody } from "../types/payloads";

type OutreachActivityMapping =
  | { activityType: "email"; body: string }
  | { activityType: "linkedin_message"; body: string; channel: "conn" | "dm" }
  | { activityType: "call"; body: string };

const mapTaskTypeToOutreachActivity = (taskType: string): OutreachActivityMapping | null => {
  const normalized = taskType.toLowerCase();
  if (normalized.includes("email")) {
    return { activityType: "email", body: "Task completion: email sent" };
  }
  if (normalized.includes("linkedin") && normalized.includes("connection request")) {
    // Explicit connection-request tasks count towards LinkedIn sent metrics.
    return {
      activityType: "linkedin_message",
      channel: "conn",
        body: "Task completion: LinkedIn message sent",
    };
  }
  if (normalized.includes("linkedin")) {
    // Generic LinkedIn message tasks should not increase connection-request efficiency metrics.
    // They are logged as DM activity for timeline/audit visibility only.
    return {
      activityType: "linkedin_message",
      channel: "dm",
      body: "Task completion: LinkedIn DM sent",
    };
  }
  if (normalized.includes("call") || normalized.includes("phone")) {
    return { activityType: "call", body: "Task completion: cold call made" };
  }
  return null;
};

export const taskHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const filters = req.query as TaskFiltersQuery;
    const tasks = await storage.getTasks(filters);

    const enrichTasksWithLeadMeta = async (scopedTasks: typeof tasks) => {
      const leads = await storage.getLeads({ includeStale: "true" });
      const leadById = new Map(leads.map((lead) => [lead.id, lead]));
      const plans = await storage.getPlans();
      const teams = await storage.getTeams();
      const planById = new Map(plans.map((plan) => [plan.id, plan]));
      const teamById = new Map(teams.map((team) => [team.id, team]));
      const uniquePlanIds = Array.from(
        new Set(scopedTasks.map((task) => task.planId).filter((id): id is string => !!id)),
      );
      const planPrimaryTeamName = new Map<string, string>();
      await Promise.all(
        uniquePlanIds.map(async (planId) => {
          const teamIds = await storage.getPlanTeamIds(planId);
          const firstTeamName = teamIds.map((teamId) => teamById.get(teamId)?.name).find(Boolean) ?? "Unassigned Team";
          planPrimaryTeamName.set(planId, firstTeamName);
        }),
      );
      return scopedTasks.map((task) => {
        const lead = task.leadId ? leadById.get(task.leadId) : undefined;
        const plan = task.planId ? planById.get(task.planId) : undefined;
        const planTeamName = task.planId ? planPrimaryTeamName.get(task.planId) : undefined;
        const isPlanLevelTask = !task.leadId && !!task.planId;
        return {
          ...task,
          leadName: lead
            ? `${lead.firstName} ${lead.lastName}`
            : isPlanLevelTask
              ? `Plan: ${plan?.name ?? "Unnamed Plan"}`
              : "Unknown Lead",
          company: lead?.company ?? planTeamName ?? "Unknown",
          planName: plan?.name ?? null,
          teamName: planTeamName ?? null,
        };
      });
    };

    const userTeamIds = await storage.getUserTeamIds(currentUser.id);
    if (currentUser.teamId && !userTeamIds.includes(currentUser.teamId)) {
      userTeamIds.push(currentUser.teamId);
    }
    const visiblePlanIds = new Set<string>();
    for (const teamId of userTeamIds) {
      const planIds = await storage.getTeamPlanIds(teamId);
      planIds.forEach((planId) => visiblePlanIds.add(planId));
    }

    if (currentUser.role === "ADMIN") {
      return res.json(await enrichTasksWithLeadMeta(tasks));
    }

    if (currentUser.role === "TEAM_LEAD") {
      // TL sees tasks for: own leads + leads assigned to teams they HEAD
      const allTeams = await storage.getTeams();
      const headedTeamIds = new Set<string>();
      allTeams.forEach((team) => {
        if (team.leadId === currentUser.id) {
          headedTeamIds.add(team.id);
        }
      });

      const visibleLeadIds = new Set(
        (await storage.getLeads({ includeStale: "true" }))
          .filter((lead) =>
            lead.ownerId === currentUser.id ||
            (lead.teamId && headedTeamIds.has(lead.teamId)),
          )
          .map((lead) => lead.id),
      );

      const visibleTasks = tasks.filter((task) => {
          const isLeadVisibleToTl = !!task.leadId && visibleLeadIds.has(task.leadId);
          const isAssignedToTl = task.userId === currentUser.id;
          const isCreatedByTl = task.createdByUserId === currentUser.id;
          const isVisiblePlanTask = !!task.planId && visiblePlanIds.has(task.planId);
          return isLeadVisibleToTl || isAssignedToTl || isCreatedByTl || isVisiblePlanTask;
        });
      return res.json(await enrichTasksWithLeadMeta(visibleTasks));
    }

    const visibleTasks = tasks.filter((task) => {
      const isAssignedToUser = task.userId === currentUser.id;
      const isVisiblePlanTask = !!task.planId && visiblePlanIds.has(task.planId);
      return isAssignedToUser || isVisiblePlanTask;
    });
    return res.json(await enrichTasksWithLeadMeta(visibleTasks));
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const body = req.body as TaskCreateBody;
    const { leadId, userId, type, status, priority, dueDate, notes } = body;

    if (!leadId || !type || !dueDate) {
      return res.status(400).json({ message: "leadId, type and dueDate are required" });
    }

    // Validate dueDate is a valid ISO date string (YYYY-MM-DD)
    const dueDateStr = String(dueDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr) || isNaN(Date.parse(dueDateStr))) {
      return res.status(400).json({ message: "dueDate must be a valid date in YYYY-MM-DD format." });
    }

    if (priority != null) {
      const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
      if (!VALID_PRIORITIES.includes(String(priority).toUpperCase())) {
        return res.status(400).json({ message: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}` });
      }
    }

    const KNOWN_TASK_TYPES = ["EMAIL", "LINKEDIN", "CALL", "OTHER"];
    const typeStr = String(type).trim();
    if (!typeStr) {
      return res.status(400).json({ message: "Task type cannot be empty." });
    }
    // Accept known enum values; any other non-empty string is a custom type (for OTHER category)
    // Reject strings that look like attempted enum values but are misspelled
    const upperType = typeStr.toUpperCase();
    const looksLikeEnum = /^[A-Z_]+$/.test(upperType); // all uppercase letters/underscores
    if (looksLikeEnum && !KNOWN_TASK_TYPES.includes(upperType)) {
      return res.status(400).json({ message: `Invalid task type. Known types: ${KNOWN_TASK_TYPES.join(", ")}` });
    }

    const [lead] = await storage.getLeads({ id: leadId, includeStale: "true" });
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    let effectiveUserId = userId || currentUser.id;
    const assignee = await storage.getUser(effectiveUserId);
    if (!assignee) {
      return res.status(400).json({ message: "Selected assignee does not exist." });
    }
    if (assignee.isActive === false) {
      return res.status(400).json({ message: "Selected assignee is inactive." });
    }

    const assigneeTeamIds = await storage.getUserTeamIds(assignee.id);

    if (currentUser.role === "ADMIN") {
      // Admin can assign to any active user (no team restriction).
    } else if (currentUser.role === "TEAM_LEAD") {
      const allTeams = await storage.getTeams();
      const managedTeamIds = new Set<string>();
      allTeams.forEach((team) => {
        if (team.leadId === currentUser.id) {
          managedTeamIds.add(team.id);
        }
      });

      if (!lead.teamId || !managedTeamIds.has(lead.teamId)) {
        return res
          .status(403)
          .json({ message: "You can only create tasks for leads in your own or managed teams." });
      }

      const isSelfAssignable = assignee.id === currentUser.id;
      const isManagedTeamMember = assigneeTeamIds.some((tid) => managedTeamIds.has(tid));
      if (!isSelfAssignable && !isManagedTeamMember) {
        return res
          .status(403)
          .json({ message: "You can assign tasks only to yourself or AE/SDR members of your managed teams." });
      }
    } else {
      if (lead.ownerId !== currentUser.id) {
        return res.status(403).json({ message: "You can only create tasks for your own leads." });
      }
      if (assignee.id !== currentUser.id) {
        return res.status(403).json({ message: "You can assign tasks only to yourself." });
      }
    }

    const task = await storage.createTask({
      leadId,
      userId: effectiveUserId,
      createdByUserId: currentUser.id,
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
        happenedAt: sql`NOW() AT TIME ZONE 'UTC'`,
      });
    } catch {
      // Non-fatal if logging fails
    }

    res.status(201).json(task);
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const body = req.body as TaskUpdateBody;
    const previousTasks = await storage.getTasks({ id });
    const previous = previousTasks[0];
    if (!previous) {
      return res.status(404).json({ message: "Task not found" });
    }
    const creatorId = previous.createdByUserId || previous.userId;
    const isCreator = creatorId === currentUser.id;
    const isAssignedUser = previous.userId === currentUser.id;
    // Requirement: assigned users can edit tasks.
    const canEdit =
      currentUser.role === "ADMIN" ||
      currentUser.role === "TEAM_LEAD" ||
      isCreator ||
      isAssignedUser;
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit this task." });
    }

    if (body.status != null) {
      const VALID_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "OPEN"];
      if (!VALID_STATUSES.includes(String(body.status).toUpperCase())) {
        return res.status(400).json({ message: `Invalid status. Must be one of: PENDING, IN_PROGRESS, COMPLETED` });
      }
    }

    if (body.priority != null) {
      const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH"];
      if (!VALID_PRIORITIES.includes(String(body.priority).toUpperCase())) {
        return res.status(400).json({ message: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(", ")}` });
      }
    }

    const updated = await storage.updateTask(id, body);

    // If status transitioned to COMPLETED, log it in the activity timeline
    if (updated && previous && previous.status !== "COMPLETED" && updated.status === "COMPLETED") {
      try {
        if (updated.leadId) {
          const leadsForActivity = await storage.getLeads({ id: updated.leadId });
          const teamId = leadsForActivity[0]?.teamId ?? "unassigned";

          await db.insert(activityTimeline).values({
            leadId: updated.leadId,
            teamId,
            createdByUserId: updated.userId,
            activityType: "task_completed",
            body: `Task completed: ${updated.type}`,
            notes: updated.notes ?? null,
            happenedAt: sql`NOW() AT TIME ZONE 'UTC'`,
          });

          const outreachActivity = mapTaskTypeToOutreachActivity(updated.type);
          if (outreachActivity) {
            await db.insert(activityTimeline).values({
              leadId: updated.leadId,
              teamId,
              createdByUserId: currentUser.id,
              activityType: outreachActivity.activityType,
              channel: "channel" in outreachActivity ? outreachActivity.channel : null,
              body: outreachActivity.body,
              notes: `Auto-logged from completed task: ${updated.type}`,
              happenedAt: sql`NOW() AT TIME ZONE 'UTC'`,
            });
          }
        }
      } catch {
        // non-fatal
      }
    }

    res.json(updated);
  },

  remove: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [existing] = await storage.getTasks({ id });
    if (!existing) {
      return res.status(404).json({ message: "Task not found" });
    }
    const canDelete =
      currentUser.role === "ADMIN" ||
      currentUser.role === "TEAM_LEAD" ||
      existing.userId === currentUser.id;
    if (!canDelete) {
      return res.status(403).json({ message: "You do not have permission to delete this task." });
    }
    await storage.deleteTask(id);
    res.status(204).end();
  },
};
