import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { users, userTeams, type User } from "@shared/schema";
import { db } from "../database/db";
import { sendUserWelcomeEmail } from "../email";
import { storage } from "../database/storage";
import type { IdParam, UserCreateBody, UserUpdateBody } from "../types/payloads";

function stripPassword<T extends { password?: unknown }>(u: T): Omit<T, "password"> {
  const { password: _pw, ...safe } = u;
  return safe;
}

async function enrichUsersWithTeamIds(userList: typeof users.$inferSelect[]) {
  const enriched = await Promise.all(
    userList.map(async (u) => {
      const teamIds = await storage.getUserTeamIds(u.id);
      return stripPassword({ ...u, teamIds });
    }),
  );
  return enriched;
}

export const userHandlers = {
  listActive: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const allUsers = await db.select().from(users).where(eq(users.isActive, true));
    res.json(await enrichUsersWithTeamIds(allUsers));
  },

  listAdmin: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    const allUsers = await db.select().from(users);
    res.json(await enrichUsersWithTeamIds(allUsers));
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    const body = req.body as UserCreateBody;
    const { name, email, role, teamId, password, sendEmail } = body;

    if (!name || !email || !role) {
      return res.status(400).json({ message: "name, email and role are required" });
    }

    const VALID_ROLES = ["ADMIN", "TEAM_LEAD", "AE", "SDR"];
    if (!VALID_ROLES.includes(String(role).toUpperCase())) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` });
    }

    const existingUser = await storage.getUserByUsername(email);

    const initialPassword =
      (typeof password === "string" && password.trim().length > 0
        ? password.trim()
        : Math.random().toString(36).slice(-10)) || "password";

    if (existingUser) {
      const duplicateNameRole =
        String(existingUser.name || "").trim().toLowerCase() === name.trim().toLowerCase() &&
        String(existingUser.role || "").trim().toUpperCase() === role.trim().toUpperCase();
      if (existingUser.isActive) {
        return res.status(409).json({
          message: duplicateNameRole
            ? `User "${name}" already exists with email "${email}" and role "${role}".`
            : `A user with email "${email}" already exists.`,
        });
      }
      return res.status(409).json({
        message: `A deactivated user with email "${email}" already exists. Please reactivate from Inactive Users instead of creating a duplicate.`,
      });
    }

    const user = await storage.createUser({
      username: email,
      password: initialPassword,
      name,
      email,
      role,
      teamId: teamId ?? null,
      timezone: "Asia/Karachi",
      isActive: true,
    });

    // Sync junction table for multi-team support
    if (teamId) {
      await storage.addUserToTeam(user.id, teamId);
    }

    if (sendEmail) {
      sendUserWelcomeEmail({
        to: email,
        name,
        password: initialPassword,
      }).catch((err) => {
        console.error("[email] Failed to send new-user credentials email", err);
      });
    }

    const enriched = await enrichUsersWithTeamIds([user]);
    res.status(201).json(enriched[0]);
  },

  update: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params as IdParam;
    const body = req.body as UserUpdateBody;
    const updated = await storage.updateUser(id, body);
    // Sync junction table when teamId is updated
    if (typeof body.teamId === "string" && body.teamId.trim().length > 0) {
      await storage.addUserToTeam(id, body.teamId);
    }
    const enriched = await enrichUsersWithTeamIds([updated]);
    res.json(enriched[0]);
  },

  remove: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });
    if (currentUser.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params as IdParam;
    await db.delete(userTeams).where(eq(userTeams.userId, id));
    await db.delete(users).where(eq(users.id, id));
    res.status(204).end();
  },
};
