import type { Request, Response } from "express";
import { storage } from "../database/storage";
import type { User } from "@shared/schema";

/** Get array of user IDs that the current user is allowed to manage (view/create/assign). */
async function getManageableUserIds(currentUser: User): Promise<string[]> {
  if (currentUser.role === "ADMIN") {
    const allUsers = await storage.getUsers(); // we need a method to get all users (active)
    return allUsers.map(u => u.id);
  }
  if (currentUser.role === "TEAM_LEAD") {
    const allTeams = await storage.getTeams();
    const headedTeamIds = allTeams.filter(t => t.leadId === currentUser.id).map(t => t.id);
    if (headedTeamIds.length === 0) return [currentUser.id];
    const memberIds = await Promise.all(headedTeamIds.map(tid => storage.getTeamMemberIds(tid)));
    const uniqueIds = Array.from(new Set([currentUser.id, ...memberIds.flat()]));
    return uniqueIds;
  }
  // SDR, AE – only themselves
  return [currentUser.id];
}

export const linkedinHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const allowedUserIds = await getManageableUserIds(currentUser);
    const profiles = await storage.getLinkedinProfiles(allowedUserIds);
    res.json(profiles);
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const { userId, name, url } = req.body;
    if (!userId || !name || !url) {
      return res.status(400).json({ message: "userId, name, url are required" });
    }
    const allowedUserIds = await getManageableUserIds(currentUser);
    if (!allowedUserIds.includes(userId)) {
      return res.status(403).json({ message: "You cannot create a profile for this user" });
    }
    const profile = await storage.createLinkedinProfile({ userId, name, url, status: "Active" });
    res.status(201).json(profile);
  },

  update: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const { id } = req.params;
    const { userId, name, url, status } = req.body;
    const existing = await storage.getLinkedinProfile(id);
    if (!existing) return res.status(404).json({ message: "Profile not found" });
    const allowedUserIds = await getManageableUserIds(currentUser);
    if (!allowedUserIds.includes(existing.userId)) {
      return res.status(403).json({ message: "You cannot modify this profile" });
    }
    if (userId && userId !== existing.userId && !allowedUserIds.includes(userId)) {
      return res.status(403).json({ message: "Cannot reassign to this user" });
    }
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (url !== undefined) updates.url = url;
    if (status !== undefined) updates.status = status;
    if (userId !== undefined) updates.userId = userId;
    const updated = await storage.updateLinkedinProfile(id, updates);
    res.json(updated);
  },

  delete: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const { id } = req.params;
    const existing = await storage.getLinkedinProfile(id);
    if (!existing) return res.status(404).json({ message: "Profile not found" });
    const allowedUserIds = await getManageableUserIds(currentUser);
    if (!allowedUserIds.includes(existing.userId)) {
      return res.status(403).json({ message: "You cannot delete this profile" });
    }
    await storage.deleteLinkedinProfile(id);
    res.status(204).end();
  },
};

export const emailHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const allowedUserIds = await getManageableUserIds(currentUser);
    const accounts = await storage.getEmailAccounts(allowedUserIds);
    res.json(accounts);
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const { userId, address, provider } = req.body;
    if (!userId || !address) {
      return res.status(400).json({ message: "userId and address are required" });
    }
    const allowedUserIds = await getManageableUserIds(currentUser);
    if (!allowedUserIds.includes(userId)) {
      return res.status(403).json({ message: "You cannot create an email account for this user" });
    }
    const account = await storage.createEmailAccount({
      userId,
      address,
      provider: provider || "Google",
      status: "Active",
    });
    res.status(201).json(account);
  },

  update: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const { id } = req.params;
    const { userId, address, provider, status } = req.body;
    const existing = await storage.getEmailAccount(id);
    if (!existing) return res.status(404).json({ message: "Email account not found" });
    const allowedUserIds = await getManageableUserIds(currentUser);
    if (!allowedUserIds.includes(existing.userId)) {
      return res.status(403).json({ message: "You cannot modify this email account" });
    }
    if (userId && userId !== existing.userId && !allowedUserIds.includes(userId)) {
      return res.status(403).json({ message: "Cannot reassign to this user" });
    }
    const updates: any = {};
    if (address !== undefined) updates.address = address;
    if (provider !== undefined) updates.provider = provider;
    if (status !== undefined) updates.status = status;
    if (userId !== undefined) updates.userId = userId;
    const updated = await storage.updateEmailAccount(id, updates);
    res.json(updated);
  },

  delete: async (req: Request, res: Response) => {
    const currentUser = req.user as User;
    const { id } = req.params;
    const existing = await storage.getEmailAccount(id);
    if (!existing) return res.status(404).json({ message: "Email account not found" });
    const allowedUserIds = await getManageableUserIds(currentUser);
    if (!allowedUserIds.includes(existing.userId)) {
      return res.status(403).json({ message: "You cannot delete this email account" });
    }
    await storage.deleteEmailAccount(id);
    res.status(204).end();
  },
};
