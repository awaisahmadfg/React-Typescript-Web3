import type { Request, Response } from "express";
import type { User } from "@shared/schema";
import { storage } from "../database/storage";

export const dashboardHandlers = {
  aeStats: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const stats = await storage.getAEDashboardStats(currentUser);
    res.json(stats);
  },
};
