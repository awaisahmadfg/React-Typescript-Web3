import type { NextFunction, Request, Response } from "express";
import passport from "passport";
import { storage } from "../database/storage";
import type { User } from "@shared/schema";

export const authHandlers = {
  me: async (req: Request, res: Response) => {
    const user = req.user as User | undefined;
    if (!user) return res.status(200).json(null);

    const teamIds = await storage.getUserTeamIds(user.id);
    const { id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId } = user;
    res.json({ id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId, teamIds });
  },

  login: (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate(
      "local",
      (
        err: Error | null,
        user: Express.User | false | null,
        info: { message?: string } | undefined,
      ) => {
        if (err) return next(err);
        if (!user) {
          return res.status(401).json({ message: info?.message || "Invalid credentials" });
        }
        req.logIn(user, async (err2: Error | null) => {
          if (err2) return next(err2);
          const loggedInUser = user as User;
          const teamIds = await storage.getUserTeamIds(loggedInUser.id);
          const { id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId } =
            loggedInUser;
          return res.json({ id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId, teamIds });
        });
      },
    )(req, res, next);
  },

  logout: (req: Request, res: Response, next: NextFunction) => {
    req.logout((err: Error | null) => {
      if (err) return next(err);
      res.json({ success: true });
    });
  },

  changePassword: async (req: Request, res: Response) => {
    const u = req.user as User | undefined;
    if (!u?.id) {
      return res.status(401).json({ message: "You must be logged in to change password." });
    }
    const body = req.body as { currentPassword?: string; newPassword?: string };
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }
    const user = await storage.getUser(u.id);
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }
    if (user.password !== currentPassword) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }
    await storage.updateUser(u.id, { password: newPassword });
    res.json({ success: true });
  },
};
