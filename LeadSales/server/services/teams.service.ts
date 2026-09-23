import type { Request, Response } from "express";
import type { User } from "@shared/schema";
import { storage } from "../database/storage";
import type { IdParam, TeamCreateBody, TeamReassignBody, TeamUpdateBody } from "../types/payloads";

export const teamHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const teams = await storage.getTeams();
    // Enrich with live member count from junction table
    const enriched = await Promise.all(
      teams.map(async (team) => {
        const memberIds = await storage.getTeamMemberIds(team.id);
        return { ...team, memberCount: memberIds.length };
      }),
    );
    res.json(enriched);
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const body = req.body as TeamCreateBody;
    const { name, leadId, memberIds = [] } = body;

    if (!name) {
      return res.status(400).json({ message: "Team name is required" });
    }

    let team;
    try {
      team = await storage.createTeam({
        name,
        leadId,
        memberCount: Array.isArray(memberIds) ? memberIds.length : 0,
      });
    } catch (error) {
      const dbError = error as { code?: string };
      if (dbError.code === "23505") {
        return res
          .status(409)
          .json({ message: `Team "${name}" already exists. Please choose a different name.` });
      }
      throw error;
    }

    const assignedUserIds = new Set<string>();
    if (Array.isArray(memberIds)) {
      memberIds.forEach((userId: string) => {
        if (userId) assignedUserIds.add(userId);
      });
    }

    if (assignedUserIds.size > 0) {
      await Promise.all(
        Array.from(assignedUserIds).map((userId) => storage.addUserToTeam(userId, team.id)),
      );
      await storage.updateTeam(team.id, { memberCount: assignedUserIds.size });
    }

    res.status(201).json(team);
  },

  update: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params as IdParam;
    const updates = req.body as TeamUpdateBody;
    const previousTeam = await storage.getTeam(id);
    const updated = await storage.updateTeam(id, updates);

    // Ensure selected team lead is always assigned to the same team.
    const nextLeadId = typeof updates.leadId === "string" && updates.leadId.trim().length > 0
      ? updates.leadId
      : undefined;
    if (nextLeadId) {
      await storage.addUserToTeam(nextLeadId, id);
    }
    // If team lead changed, remove previous lead from this team when they have no other reason to be here.
    if (previousTeam?.leadId && nextLeadId && previousTeam.leadId !== nextLeadId) {
      const prevLeadTeamIds = await storage.getUserTeamIds(previousTeam.leadId);
      // Only remove if their sole connection to this team was being the lead
      if (prevLeadTeamIds.includes(id)) {
        await storage.removeUserFromTeam(previousTeam.leadId, id);
        const memberIds = await storage.getTeamMemberIds(id);
        await storage.updateTeam(id, { memberCount: memberIds.length });
      }
    }

    res.json(updated);
  },

  addMember: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id: teamId } = req.params as IdParam;
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    await storage.addUserToTeam(userId, teamId);
    const memberIds = await storage.getTeamMemberIds(teamId);
    await storage.updateTeam(teamId, { memberCount: memberIds.length });
    res.json({ success: true });
  },

  removeMember: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id: teamId, userId } = req.params as { id: string; userId: string };
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    await storage.removeUserFromTeam(userId, teamId);
    const memberIds = await storage.getTeamMemberIds(teamId);
    await storage.updateTeam(teamId, { memberCount: memberIds.length });
    res.json({ success: true });
  },

  // Kept for backward compatibility
  reassignMember: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const body = req.body as TeamReassignBody;
    const { userId, newTeamId } = body;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    if (newTeamId) {
      await storage.addUserToTeam(userId, newTeamId);
      const memberIds = await storage.getTeamMemberIds(newTeamId);
      await storage.updateTeam(newTeamId, { memberCount: memberIds.length });
    }
    // If newTeamId is null, we don't remove from all teams — that's a different operation
    const user = await storage.getUser(userId);
    const teamIds = user ? await storage.getUserTeamIds(userId) : [];
    res.json(user ? { ...user, teamIds } : user);
  },

  remove: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN") {
      return res.status(403).json({ message: "Only admins can delete teams" });
    }

    const { id } = req.params as IdParam;
    await storage.deleteTeam(id);
    res.status(204).end();
  },

  listPlans: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const { id: teamId } = req.params as IdParam;
    const planIds = await storage.getTeamPlanIds(teamId);
    if (planIds.length === 0) return res.json([]);
    const allPlans = await storage.getPlans();
    const teamPlans = allPlans.filter((p) => planIds.includes(p.id));
    res.json(teamPlans);
  },
};
