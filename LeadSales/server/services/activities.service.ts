import type { Request, Response } from "express";
import type { User } from "@shared/schema";
import { storage } from "../database/storage";

export const activityHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const filters = req.query as Record<string, string | string[] | undefined>;

    if (currentUser.role === "ADMIN") {
      const activities = await storage.getActivities(filters);
      return res.json(activities);
    }

    if (currentUser.role === "TEAM_LEAD") {
      // TL sees activities for teams they head
      const allTeams = await storage.getTeams();
      const headedTeamIds = allTeams
        .filter((t) => t.leadId === currentUser.id)
        .map((t) => t.id);
      const activities = await storage.getActivities(filters);
      return res.json(activities.filter((a) => headedTeamIds.includes(a.teamId) || a.userId === currentUser.id));
    }

    // AE/SDR: only own activities
    const activities = await storage.getActivities(filters);
    return res.json(activities.filter((a) => a.userId === currentUser.id));
  },
};
