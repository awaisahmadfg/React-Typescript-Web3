import type { Request, Response } from "express";
import { type Plan, type User } from "@shared/schema";
import { storage } from "../database/storage";
import type { IdParam, PlanAssignmentsBody, PlanTeamsBody, PlanUpdateBody } from "../types/payloads";

const clampDelay = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.floor(v)) : undefined);

function sanitizeDelays(body: PlanUpdateBody): PlanUpdateBody {
  const result = { ...body };
  const email = clampDelay(body.emailDelayDays);
  const message = clampDelay(body.messageDelayDays);
  const call = clampDelay(body.callDelayDays);
  if (email !== undefined) result.emailDelayDays = email;
  if (message !== undefined) result.messageDelayDays = message;
  if (call !== undefined) result.callDelayDays = call;
  return result;
}

const PLAN_TASK_STATUS_ACTIVE = ["OPEN", "PENDING", "IN_PROGRESS"] as const;
const MAX_TASKS_PER_CHANNEL = 4;

type PlanChannel = "EMAIL" | "LINKEDIN" | "CALL";

const addDays = (base: Date, days: number) => {
  const out = new Date(base);
  out.setDate(out.getDate() + Math.max(0, Math.floor(days)));
  return out;
};

const toDateString = (d: Date) => d.toISOString().slice(0, 10);

const getEnabledPlanChannels = (plan: Plan): PlanChannel[] => {
  const raw = String(plan.initialContactChannel ?? "").toLowerCase();
  const channels = new Set<PlanChannel>();

  if (raw.includes("both")) {
    channels.add("EMAIL");
    channels.add("LINKEDIN");
  } else {
    if (raw.includes("email")) channels.add("EMAIL");
    if (raw.includes("linkedin")) channels.add("LINKEDIN");
  }

  if (raw.includes("call") || Number(plan.callDelayDays ?? 0) > 0) {
    channels.add("CALL");
  }

  // Backward-compatible inference from delays so old plans still generate expected tasks
  // even if initialContactChannel was saved incorrectly.
  if (Number(plan.emailDelayDays ?? 0) > 0) {
    channels.add("EMAIL");
  }
  if (Number(plan.messageDelayDays ?? 0) > 0) {
    channels.add("LINKEDIN");
  }

  if (channels.size === 0) {
    channels.add("LINKEDIN");
  }

  return Array.from(channels);
};

const getDelayByChannel = (plan: Plan, channel: PlanChannel): number => {
  if (channel === "EMAIL") return Math.max(0, Number(plan.emailDelayDays ?? 0));
  if (channel === "LINKEDIN") return Math.max(0, Number(plan.messageDelayDays ?? 0));
  return Math.max(0, Number(plan.callDelayDays ?? 0));
};

const getTaskTypeByChannel = (channel: PlanChannel): string => {
  if (channel === "EMAIL") return "Email Follow-up";
  if (channel === "LINKEDIN") return "LinkedIn Message";
  return "Phone Call";
};

const syncPlanTasks = async (plan: Plan) => {
  const existingPlanTasks = await storage.getTasks({ planId: plan.id });
  const pendingPlanTaskIds = existingPlanTasks
    .filter((t) => PLAN_TASK_STATUS_ACTIVE.includes((String(t.status ?? "OPEN").toUpperCase() as (typeof PLAN_TASK_STATUS_ACTIVE)[number])))
    .map((t) => t.id);

  if (!plan.isActive) {
    if (pendingPlanTaskIds.length > 0) {
      await Promise.all(pendingPlanTaskIds.map((taskId) => storage.deleteTask(taskId)));
    }
    return;
  }

  // Idempotent regeneration: remove pending plan-generated tasks and recreate from latest plan settings.
  if (pendingPlanTaskIds.length > 0) {
    await Promise.all(pendingPlanTaskIds.map((taskId) => storage.deleteTask(taskId)));
  }

  const assignments = await storage.getPlanAssignments(plan.id);
  const assigneeId = assignments[0]?.userId || plan.ownerId;
  const assignee = assigneeId ? await storage.getUser(assigneeId) : undefined;
  if (!assignee || assignee.isActive === false) return;

  const channels = getEnabledPlanChannels(plan);
  const baseDate = new Date();

  for (const channel of channels) {
    const delayDays = getDelayByChannel(plan, channel);
    const taskType = getTaskTypeByChannel(channel);

    for (let i = 0; i < MAX_TASKS_PER_CHANNEL; i += 1) {
      const dueDate = toDateString(addDays(baseDate, delayDays * i));
      const scheduleKey = `${plan.id}:${channel}:${i + 1}`;
      await storage.createTask({
        leadId: null,
        planId: plan.id,
        scheduleKey,
        userId: assignee.id,
        createdByUserId: plan.ownerId,
        type: taskType,
        status: "OPEN",
        priority: "MEDIUM",
        dueDate,
        notes: `Auto-generated from plan "${plan.name}" (${channel.toLowerCase()} touch ${i + 1})`,
      });
    }
  }
};

export const planHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const plans = await storage.getPlans();

    if (currentUser.role === "ADMIN") {
      return res.json(plans);
    }

    // For TEAM_LEAD / AE / SDR: return only plans assigned to their team(s)
    const userTeamIds = await storage.getUserTeamIds(currentUser.id);
    // Also include legacy single teamId
    if (currentUser.teamId && !userTeamIds.includes(currentUser.teamId)) {
      userTeamIds.push(currentUser.teamId);
    }

    if (userTeamIds.length === 0) {
      // No team membership — only return plans owned by the user (TEAM_LEAD)
      if (currentUser.role === "TEAM_LEAD") {
        return res.json(plans.filter((p) => p.ownerId === currentUser.id));
      }
      return res.json([]);
    }

    // Collect all plan IDs accessible via any of the user's teams
    const accessiblePlanIds = new Set<string>();
    for (const teamId of userTeamIds) {
      const teamPlanIds = await storage.getTeamPlanIds(teamId);
      for (const planId of teamPlanIds) {
        accessiblePlanIds.add(planId);
      }
    }

    // TEAM_LEAD also sees plans they created
    const filtered = plans.filter(
      (p) =>
        accessiblePlanIds.has(p.id) ||
        (currentUser.role === "TEAM_LEAD" && p.ownerId === currentUser.id),
    );
    return res.json(filtered);
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const body = req.body as PlanUpdateBody;
    const trimmedName = String(body.name ?? "").trim();
    if (!trimmedName) {
      return res.status(400).json({ message: "Plan name is required." });
    }
    const sanitized = sanitizeDelays({ ...body, name: trimmedName });
    const plan = await storage.createPlan({ ...sanitized, ownerId: sanitized.ownerId ?? currentUser.id });
    await syncPlanTasks(plan);
    res.status(201).json(plan);
  },

  update: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params as IdParam;
    const plan = await storage.getPlan(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // ADMIN can edit any plan; TEAM_LEAD can edit plans visible to them
    if (currentUser.role !== "ADMIN") {
      if (currentUser.role !== "TEAM_LEAD") {
        return res.status(403).json({ message: "Forbidden" });
      }
      // Check if TEAM_LEAD owns the plan or it's assigned to their team
      const userTeamIds = await storage.getUserTeamIds(currentUser.id);
      if (currentUser.teamId && !userTeamIds.includes(currentUser.teamId)) {
        userTeamIds.push(currentUser.teamId);
      }
      let canEdit = plan.ownerId === currentUser.id;
      if (!canEdit) {
        for (const teamId of userTeamIds) {
          const teamPlanIds = await storage.getTeamPlanIds(teamId);
          if (teamPlanIds.includes(plan.id)) { canEdit = true; break; }
        }
      }
      if (!canEdit) return res.status(403).json({ message: "Forbidden" });
    }

    const body = req.body as PlanUpdateBody;
    if ("name" in body) {
      const trimmedName = String(body.name ?? "").trim();
      if (!trimmedName) {
        return res.status(400).json({ message: "Plan name is required." });
      }
      body.name = trimmedName;
    }
    const updated = await storage.updatePlan(id, sanitizeDelays(body));
    await syncPlanTasks(updated);
    res.json(updated);
  },

  remove: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params as IdParam;
    const plan = await storage.getPlan(id);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }
    // TEAM_LEAD can only delete plans they own
    if (currentUser.role === "TEAM_LEAD" && plan.ownerId !== currentUser.id) {
      return res.status(403).json({ message: "You can only delete plans you created" });
    }

    await storage.deletePlan(id);
    res.status(204).end();
  },

  listAssignments: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { id } = req.params as IdParam;
    const assignments = await storage.getPlanAssignments(id);
    res.json(assignments);
  },

  setAssignments: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params as IdParam;
    const body = req.body as PlanAssignmentsBody;
    const { userIds } = body;

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ message: "userIds must be an array" });
    }

    await storage.setPlanAssignments(id, userIds);
    const updatedPlan = await storage.getPlan(id);
    if (updatedPlan) {
      await syncPlanTasks(updatedPlan);
    }
    const assignments = await storage.getPlanAssignments(id);
    res.json(assignments);
  },

  listTeams: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { id } = req.params as IdParam;
    const teamIds = await storage.getPlanTeamIds(id);
    res.json({ teamIds });
  },

  setTeams: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Only admins and team leads can assign plans to teams" });
    }

    const { id } = req.params as IdParam;

    if (currentUser.role === "TEAM_LEAD") {
      const plan = await storage.getPlan(id);
      if (!plan) return res.status(404).json({ message: "Plan not found" });
      if (plan.ownerId !== currentUser.id) {
        return res.status(403).json({ message: "You can only manage teams for plans you created" });
      }
    }

    const body = req.body as PlanTeamsBody;
    const { teamIds } = body;

    if (!Array.isArray(teamIds)) {
      return res.status(400).json({ message: "teamIds must be an array" });
    }

    if (currentUser.role === "TEAM_LEAD" && teamIds.length > 0) {
      const userTeamIds = await storage.getUserTeamIds(currentUser.id);
      const unauthorized = teamIds.filter((tid) => !userTeamIds.includes(tid));
      if (unauthorized.length > 0) {
        return res.status(403).json({ message: "You can only assign plans to teams you belong to" });
      }
    }

    await storage.setPlanTeams(id, teamIds);
    const updatedTeamIds = await storage.getPlanTeamIds(id);
    res.json({ teamIds: updatedTeamIds });
  },
};
