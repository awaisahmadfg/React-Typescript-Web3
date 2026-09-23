import type { Request, Response } from "express";
import type { User } from "@shared/schema";
import { storage } from "../database/storage";
import type { GoalCreateBody, GoalFiltersQuery } from "../types/payloads";

export const goalHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const filters = req.query as GoalFiltersQuery;
    const goals = await storage.getGoals(filters);

    if (currentUser.role === "ADMIN") {
      return res.json(goals);
    }

    // Non-admins only see goals for their own teams
    const userTeamIds = await storage.getUserTeamIds(currentUser.id);
    const teamSet = new Set(userTeamIds);
    if (currentUser.teamId) teamSet.add(currentUser.teamId);
    // TEAM_LEAD also sees goals for teams they head (even if not in userTeams)
    if (currentUser.role === "TEAM_LEAD") {
      const allTeams = await storage.getTeams();
      allTeams.forEach((t) => { if (t.leadId === currentUser.id) teamSet.add(t.id); });
    }
    return res.json(goals.filter((g) => g.teamId && teamSet.has(g.teamId)));
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Only admins and team leads can set goals." });
    }

    const body = req.body as GoalCreateBody;
    const { teamId, userId, metric, period, target } = body;

    if (!teamId || !metric || !period || !target) {
      return res.status(400).json({ message: "teamId, metric, period and target are required" });
    }

    const VALID_PERIODS = ["DAY", "WEEK", "MONTH"];
    if (!VALID_PERIODS.includes(String(period).toUpperCase())) {
      return res.status(400).json({ message: `Invalid period. Must be one of: ${VALID_PERIODS.join(", ")}` });
    }

    const now = new Date();
    const startDate = new Date(now);
    let endDate = new Date(now);

    if (period === "DAY") {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === "WEEK") {
      const day = startDate.getDay() || 7;
      startDate.setDate(startDate.getDate() - (day - 1));
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === "MONTH") {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
    }

    // upsert by team + metric + period (update first match, else create)
    const existing = await storage.getGoals({ teamId, metric, period });
    if (existing.length > 0) {
      const updated = await storage.updateGoal(existing[0].id, {
        target,
        startDate,
        endDate,
      });
      return res.status(200).json(updated);
    }

    const goal = await storage.createGoal({
      teamId,
      userId: userId ?? null,
      period,
      startDate,
      endDate,
      metric,
      target,
    });

    res.status(201).json(goal);
  },
};
