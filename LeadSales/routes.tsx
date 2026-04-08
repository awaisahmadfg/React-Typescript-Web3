import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { users, activityTimeline } from "@shared/schema";
import { eq } from "drizzle-orm";
import passport from "passport";
import { sendUserWelcomeEmail } from "./email";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  app.get("/api/auth/me", (req, res) => {
    const user = req.user as any;
    if (!user) {
      return res.status(200).json(null);
    }

    const { id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId } = user;
    res.json({ id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId });
  });

  app.post("/api/auth/login", (req, res, next) => {
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
      req.logIn(user, (err2) => {
        if (err2) return next(err2);
        const { id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId } =
          user as any;
        return res.json({ id, email, name, role, timezone, isActive, avatar, avatarUrl, teamId });
      });
      },
    )(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ success: true });
    });
  });

  app.post("/api/auth/change-password", async (req, res) => {
    const u = req.user as any;
    if (!u?.id) {
      return res.status(401).json({ message: "You must be logged in to change password." });
    }
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }
    const user = await storage.getUser(u.id);
    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }
    if ((user as any).password !== currentPassword) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }
    await storage.updateUser(u.id, { password: newPassword });
    res.json({ success: true });
  });

  app.get("/api/dashboard/ae-stats", async (req, res) => {
    const username = req.query.username as string || "sarah@salespulse.com";
    const user = await storage.getUserByUsername(username);
    
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const stats = await storage.getAEDashboardStats(user);
    res.json(stats);
  });

  app.get("/api/leads", async (req, res) => {
    const currentUser = req.user as any;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const filters: Record<string, any> = { ...req.query };
    if (currentUser.role === "ADMIN") {
      // Admin sees all leads
    } else if (currentUser.role === "TEAM_LEAD") {
      filters.teamId = currentUser.teamId;
    } else {
      // AE/SDR: only own leads
      filters.ownerId = currentUser.id;
    }

    const leads = await storage.getLeads(filters);
    res.json(leads);
  });

  app.get("/api/leads/:id", async (req, res) => {
    const currentUser = req.user as any;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [lead] = await storage.getLeads({ id: req.params.id });
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    const canView =
      currentUser.role === "ADMIN" ||
      (currentUser.role === "TEAM_LEAD" && lead.teamId === currentUser.teamId) ||
      lead.ownerId === currentUser.id;
    if (!canView) {
      return res.status(403).json({ message: "You do not have permission to view this lead." });
    }
    res.json(lead);
  });

  app.post("/api/leads", async (req, res) => {
    const currentUser = req.user as any;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const payload = req.body as {
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
      email?: string;
      linkedinUrl?: string;
      teamId?: string;
    };

    const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
    const normalizeOptional = (value: unknown) => {
      const v = String(value ?? "").trim();
      return v.length > 0 ? v : null;
    };

    const isSameLeadIdentity = (candidate: any, incoming: typeof payload) => {
      const byEmail =
        !!incoming.email &&
        !!candidate.email &&
        normalize(candidate.email) === normalize(incoming.email);
      const byLinkedin =
        !!incoming.linkedinUrl &&
        !!candidate.linkedinUrl &&
        normalize(candidate.linkedinUrl) === normalize(incoming.linkedinUrl);
      const byCoreFields =
        normalize(candidate.firstName) === normalize(incoming.firstName) &&
        normalize(candidate.lastName) === normalize(incoming.lastName) &&
        normalize(candidate.company) === normalize(incoming.company) &&
        normalize(candidate.title) === normalize(incoming.title);

      return byEmail || byLinkedin || byCoreFields;
    };

    const isWithinTwoMonths = (dateLike: string | Date | null | undefined) => {
      if (!dateLike) return true;
      const d = new Date(dateLike);
      if (Number.isNaN(d.getTime())) return true;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 2);
      return d >= cutoff;
    };

    const isNotFitStage = (stage: string | null | undefined) => {
      const normalized = String(stage || "").toUpperCase();
      return normalized === "LOST" || normalized === "CLOSED_LOST";
    };

    // Duplication rule: check across the entire database (not team-specific).
    const existingLeads = await storage.getLeads({
      includeStale: "true",
    });
    const matched = existingLeads.filter((l) => isSameLeadIdentity(l, payload));
    const matchedNotFitLead = matched.find((l: any) => isNotFitStage(l.stage));

    if (matchedNotFitLead) {
      const markerUser = await storage.getUser(matchedNotFitLead.ownerId);
      const markerName =
        matchedNotFitLead.ownerName ||
        markerUser?.name ||
        "Unknown user";
      return res.status(409).json({
        message: `This lead was previously marked Not a Fit by ${markerName}.`,
      });
    }

    const hasRecentMatch = matched.some((l: any) => {
      const anchorRaw = l.statusChangedAt ?? l.createdAt;
      const anchor = anchorRaw ? new Date(anchorRaw) : null;
      if (!anchor || Number.isNaN(anchor.getTime())) return false;
      return isWithinTwoMonths(anchor);
    });

    if (hasRecentMatch) {
      return res.status(409).json({
        message:
          "Similar lead already exists with a stage change in the last 2 months. Duplicate creation is blocked.",
      });
    }

    const requestedOwnerId = String((req.body as any)?.ownerId || "").trim();
    const requestedTeamId = String((req.body as any)?.teamId || "").trim();

    let ownerId = requestedOwnerId || currentUser.id;
    let teamId = requestedTeamId || currentUser.teamId;

    if (currentUser.role === "ADMIN") {
      // Admin can create for any owner/team
      ownerId = requestedOwnerId || currentUser.id;
      teamId = requestedTeamId || currentUser.teamId;
    } else if (currentUser.role === "TEAM_LEAD") {
      // Team lead can create/manange only within own team
      ownerId = requestedOwnerId || currentUser.id;
      teamId = currentUser.teamId;
    } else {
      // AE/SDR can create only own leads in own team
      ownerId = currentUser.id;
      teamId = currentUser.teamId;
    }

    const lead = await storage.createLead({
      ...req.body,
      ownerId,
      teamId,
      email: normalizeOptional(payload.email),
      linkedinUrl: normalizeOptional(payload.linkedinUrl),
      firstName: String(payload.firstName ?? "").trim(),
      lastName: String(payload.lastName ?? "").trim(),
      company: String(payload.company ?? "").trim(),
      title: String(payload.title ?? "").trim(),
    });
    res.json(lead);
  });

  app.patch("/api/leads/:id", async (req, res) => {
    const { id } = req.params;
    const currentUser = req.user as any;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [existing] = await storage.getLeads({ id });
    if (!existing) {
      return res.status(404).json({ message: "Lead not found" });
    }
    const canEdit =
      currentUser.role === "ADMIN" ||
      (currentUser.role === "TEAM_LEAD" && existing.teamId === currentUser.teamId) ||
      existing.ownerId === currentUser.id;
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit this lead." });
    }

    const updates = req.body as { stage?: string } & Record<string, unknown>;
    const stageChanging =
      typeof updates.stage === "string" && updates.stage !== existing.stage;

    const lead = await storage.updateLead(id, req.body);

    if (stageChanging) {
      const actorId = (req.user as any)?.id ?? existing.ownerId;
      if (actorId) {
        const teamId = existing.teamId ?? "unassigned";
        await db.insert(activityTimeline).values({
          leadId: id,
          teamId,
          createdByUserId: actorId,
          activityType: "status_change",
          body: `Stage changed to ${updates.stage}`,
        });
      }
    }

    res.json(lead);
  });

  app.get("/api/teams", async (req, res) => {
    const teams = await storage.getTeams();
    res.json(teams);
  });

  app.post("/api/teams", async (req, res) => {
    const { name, leadId, memberIds = [] } = req.body as {
      name: string;
      leadId?: string;
      memberIds?: string[];
    };

    if (!name) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const team = await storage.createTeam({
      name,
      leadId,
      memberCount: Array.isArray(memberIds) ? memberIds.length : 0,
    });

    if (Array.isArray(memberIds) && memberIds.length > 0) {
      await Promise.all(
        memberIds.map((userId: string) => storage.assignUserToTeam(userId, team.id)),
      );
    }

    res.status(201).json(team);
  });

  app.patch("/api/teams/:id", async (req, res) => {
    const { id } = req.params;
    const updated = await storage.updateTeam(id, req.body);
    res.json(updated);
  });

  app.post("/api/teams/reassign-member", async (req, res) => {
    const { userId, newTeamId } = req.body as { userId: string; newTeamId: string | null };
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    const updatedUser = await storage.assignUserToTeam(userId, newTeamId ?? null);
    res.json(updatedUser);
  });

  app.delete("/api/teams/:id", async (req, res) => {
    const { id } = req.params;
    await storage.deleteTeam(id);
    res.status(204).end();
  });

  app.get("/api/plans", async (req, res) => {
    const plans = await storage.getPlans();
    res.json(plans);
  });

  app.post("/api/plans", async (req, res) => {
    const plan = await storage.createPlan(req.body);
    res.status(201).json(plan);
  });

  app.patch("/api/plans/:id", async (req, res) => {
    const { id } = req.params;
    const updated = await storage.updatePlan(id, req.body);
    res.json(updated);
  });

  app.delete("/api/plans/:id", async (req, res) => {
    const { id } = req.params;
    await storage.deletePlan(id);
    res.status(204).end();
  });

  app.get("/api/plans/:id/assignments", async (req, res) => {
    const { id } = req.params;
    const assignments = await storage.getPlanAssignments(id);
    res.json(assignments);
  });

  app.post("/api/plans/:id/assignments", async (req, res) => {
    const { id } = req.params;
    const { userIds } = req.body as { userIds: string[] };

    if (!Array.isArray(userIds)) {
      return res.status(400).json({ message: "userIds must be an array" });
    }

    await storage.setPlanAssignments(id, userIds);
    const assignments = await storage.getPlanAssignments(id);
    res.json(assignments);
  });

  app.get("/api/activities", async (req, res) => {
    const activities = await storage.getActivities(req.query);
    res.json(activities);
  });

  app.get("/api/users", async (req, res) => {
    // In a real app, this should be restricted
    const allUsers = await db.select().from(users).where(eq(users.isActive, true));
    res.json(allUsers);
  });

  app.get("/api/admin/users", async (_req, res) => {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  });

  app.post("/api/users", async (req, res) => {
    const { name, email, role, teamId, password, sendEmail } = req.body as {
      name: string;
      email: string;
      role: string;
      teamId?: string;
      password?: string;
      sendEmail?: boolean;
    };

    if (!name || !email || !role) {
      return res.status(400).json({ message: "name, email and role are required" });
    }

    const existingUser = await storage.getUserByUsername(email);

    const initialPassword =
      (typeof password === "string" && password.trim().length > 0
        ? password.trim()
        : Math.random().toString(36).slice(-10)) || "password";

    if (existingUser) {
      const updated = await storage.updateUser(existingUser.id, {
        name,
        email,
        role,
        teamId: teamId ?? null,
        isActive: true,
      });

      if (sendEmail) {
        // Best-effort email; do not block response on failure
        sendUserWelcomeEmail({
          to: email,
          name,
          password: initialPassword,
        }).catch((err) => {
          console.error("[email] Failed to send existing-user credentials email", err);
        });
      }

      return res.status(200).json(updated);
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

    if (sendEmail) {
      sendUserWelcomeEmail({
        to: email,
        name,
        password: initialPassword,
      }).catch((err) => {
        console.error("[email] Failed to send new-user credentials email", err);
      });
    }

    res.status(201).json(user);
  });

  app.patch("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    const body = { ...req.body };
    delete (body as any).password; // password must be changed via POST /api/auth/change-password
    const updated = await storage.updateUser(id, body);
    res.json(updated);
  });

  app.delete("/api/users/:id", async (req, res) => {
    const { id } = req.params;
    // Hard delete for now
    await db.delete(users).where(eq(users.id, id));
    res.status(204).end();
  });

  app.get("/api/goals", async (req, res) => {
    const goals = await storage.getGoals(req.query);
    res.json(goals);
  });

  app.post("/api/goals", async (req, res) => {
    const { teamId, userId, metric, period, target } = req.body as {
      teamId: string;
      userId?: string;
      metric: string;
      period: "DAY" | "WEEK" | "MONTH";
      target: number;
    };

    if (!teamId || !metric || !period || !target) {
      return res.status(400).json({ message: "teamId, metric, period and target are required" });
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
  });

  app.get("/api/tasks", async (req, res) => {
    const tasks = await storage.getTasks(req.query);
    res.json(tasks);
  });

  app.post("/api/tasks", async (req, res) => {
    const { leadId, userId, type, status, priority, dueDate, notes } = req.body as {
      leadId: string;
      userId: string;
      type: string;
      status?: string;
      priority?: string;
      dueDate: string;
      notes?: string;
    };

    if (!leadId || !userId || !type || !dueDate) {
      return res.status(400).json({ message: "leadId, userId, type and dueDate are required" });
    }

    const task = await storage.createTask({
      leadId,
      userId,
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

      await db.insert(activityTimeline).values({
        leadId,
        teamId,
        createdByUserId: userId,
        activityType: "task_created",
        body: `Task created: ${type} (due ${dueDate})`,
        notes: notes ?? null,
      });
    } catch {
      // Non-fatal if logging fails
    }

    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const previousTasks = await storage.getTasks({ id });
    const previous = previousTasks[0];

    const updated = await storage.updateTask(id, req.body);

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
        });
      } catch {
        // non-fatal
      }
    }

    res.json(updated);
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const { id } = req.params;
    await storage.deleteTask(id);
    res.status(204).end();
  });

  app.get("/api/clients", async (req, res) => {
    const currentUser = req.user as any;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const filters: Record<string, any> = { ...req.query };
    if (currentUser.role === "ADMIN") {
      // Admin sees all
    } else if (currentUser.role === "TEAM_LEAD") {
      filters.teamId = currentUser.teamId;
    } else {
      filters.ownerId = currentUser.id;
    }

    const all = await storage.getClients(filters);
    res.json(all);
  });

  app.get("/api/clients/:id", async (req, res) => {
    const { id } = req.params;
    const currentUser = req.user as any;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canView =
      currentUser?.role === "ADMIN" ||
      (currentUser?.role === "TEAM_LEAD" && client.teamId === currentUser.teamId) ||
      client.ownerId === currentUser?.id;
    if (!canView) {
      return res.status(403).json({ message: "You do not have permission to view this client." });
    }

    res.json(client);
  });

  const syncClientLedgerFromInvoices = async (clientId: string) => {
    const entries = await storage.getClientInvoiceEntries(clientId);
    const sorted = [...entries].sort(
      (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime(),
    );
    const latest = sorted[0];
    const totalInvoiced = entries.reduce((sum, e) => sum + Number(e.invoiceAmount || 0), 0);
    const totalReceived = entries.reduce((sum, e) => sum + Number(e.receivedAmount || 0), 0);
    const deltaAmount = Math.max(totalInvoiced - totalReceived, 0);

    await storage.updateClient(clientId, {
      deltaAmount,
      paymentStatus: deltaAmount > 0 ? "UNPAID" : "PAID",
      invoiceNumber: latest?.invoiceNumber ?? null,
      invoiceAmount: Number(latest?.invoiceAmount || 0),
    });
  };

  app.post("/api/clients", async (req, res) => {
    const currentUser = req.user as any;
    const {
      projectName,
      company,
      startDate,
      ticketSize,
      paymentTerms,
      billingFrequency,
      hourlyRate,
      resourceCount,
      invoiceNumber,
      invoiceAmount = 0,
      paymentStatus = "UNPAID",
      deltaAmount = 0,
      googleSheetLink,
      clientPOC,
      ownerId,
      teamId,
    } = req.body as {
      projectName?: string;
      company?: string;
      startDate?: string;
      ticketSize?: number;
      paymentTerms?: string;
      billingFrequency?: string;
      hourlyRate?: number;
      resourceCount?: number;
      invoiceNumber?: string;
      invoiceAmount?: number;
      paymentStatus?: "PAID" | "UNPAID";
      deltaAmount?: number;
      googleSheetLink?: string;
      clientPOC?: string;
      ownerId?: string;
      teamId?: string;
    };

    if (
      !projectName ||
      !company ||
      ticketSize == null ||
      !paymentTerms ||
      !billingFrequency ||
      hourlyRate == null ||
      resourceCount == null ||
      !clientPOC ||
      !(ownerId || currentUser?.id) ||
      !(teamId || currentUser?.teamId)
    ) {
      return res.status(400).json({ message: "Missing required client fields" });
    }

    const resolvedOwnerId =
      currentUser?.role === "ADMIN"
        ? ownerId ?? currentUser.id
        : currentUser.id;
    const resolvedTeamId =
      currentUser?.role === "ADMIN"
        ? teamId ?? currentUser.teamId
        : currentUser.teamId;

    if (!resolvedOwnerId || !resolvedTeamId) {
      return res.status(400).json({ message: "Missing required client fields" });
    }

    const client = await storage.createClient({
      projectName,
      company,
      startDate: startDate ?? null,
      ticketSize,
      paymentTerms,
      billingFrequency,
      hourlyRate,
      resourceCount,
      invoiceNumber: invoiceNumber ?? null,
      invoiceAmount,
      paymentStatus,
      deltaAmount,
      googleSheetLink: googleSheetLink ?? null,
      clientPOC,
      ownerId: resolvedOwnerId,
      teamId: resolvedTeamId,
    });
    res.status(201).json(client);
  });

  app.patch("/api/clients/:id", async (req, res) => {
    const { id } = req.params;
    const currentUser = req.user as any;
    const existing = await storage.getClient(id);
    if (!existing) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canEdit =
      currentUser?.role === "ADMIN" ||
      (currentUser?.role === "TEAM_LEAD" && existing.teamId === currentUser.teamId) ||
      existing.ownerId === currentUser?.id;

    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit this client." });
    }
    const updated = await storage.updateClient(id, req.body);
    res.json(updated);
  });

  app.delete("/api/clients/:id", async (req, res) => {
    const { id } = req.params;
    const currentUser = req.user as any;
    if (currentUser?.role !== "ADMIN") {
      return res.status(403).json({ message: "Only admins can delete client entries." });
    }
    await storage.deleteClient(id);
    res.status(204).end();
  });

  app.get("/api/clients/:id/invoices", async (req, res) => {
    const { id } = req.params;
    const currentUser = req.user as any;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canView =
      currentUser?.role === "ADMIN" ||
      (currentUser?.role === "TEAM_LEAD" && client.teamId === currentUser.teamId) ||
      client.ownerId === currentUser?.id;
    if (!canView) {
      return res.status(403).json({ message: "You do not have permission to view invoice history." });
    }

    const entries = await storage.getClientInvoiceEntries(id);
    res.json(entries);
  });

  app.get("/api/clients/:id/invoices/history", async (req, res) => {
    const { id } = req.params;
    const currentUser = req.user as any;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canView =
      currentUser?.role === "ADMIN" ||
      (currentUser?.role === "TEAM_LEAD" && client.teamId === currentUser.teamId) ||
      client.ownerId === currentUser?.id;
    if (!canView) {
      return res.status(403).json({ message: "You do not have permission to view invoice history logs." });
    }

    const history = await storage.getClientInvoiceEntryHistory(id);
    res.json(history);
  });

  app.post("/api/clients/:id/invoices", async (req, res) => {
    const { id } = req.params;
    const currentUser = req.user as any;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canEdit =
      currentUser?.role === "ADMIN" ||
      (currentUser?.role === "TEAM_LEAD" && client.teamId === currentUser.teamId) ||
      client.ownerId === currentUser?.id;
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to add invoice entries." });
    }

    const { invoiceDate, invoiceNumber, invoiceAmount = 0, receivedAmount = 0, notes } = req.body as {
      invoiceDate?: string;
      invoiceNumber?: string;
      invoiceAmount?: number;
      receivedAmount?: number;
      notes?: string;
    };

    if (!invoiceDate) {
      return res.status(400).json({ message: "invoiceDate is required" });
    }
    if (Number(invoiceAmount) < 0 || Number(receivedAmount) < 0) {
      return res.status(400).json({ message: "Invoice and received amounts cannot be negative." });
    }
    if (Number(receivedAmount) > Number(invoiceAmount)) {
      return res.status(400).json({ message: "Received amount cannot exceed invoice amount." });
    }

    const created = await storage.createClientInvoiceEntry({
      clientId: id,
      invoiceDate,
      invoiceNumber: invoiceNumber ?? null,
      invoiceAmount,
      receivedAmount,
      notes: notes ?? null,
    });
    await storage.createClientInvoiceEntryHistory({
      clientId: id,
      invoiceEntryId: created.id,
      action: "CREATED",
      changedByUserId: currentUser?.id ?? client.ownerId,
      snapshot: created,
    });
    await syncClientLedgerFromInvoices(id);
    res.status(201).json(created);
  });

  app.patch("/api/clients/:clientId/invoices/:invoiceId", async (req, res) => {
    const { clientId, invoiceId } = req.params;
    const currentUser = req.user as any;
    const client = await storage.getClient(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canEdit =
      currentUser?.role === "ADMIN" ||
      (currentUser?.role === "TEAM_LEAD" && client.teamId === currentUser.teamId) ||
      client.ownerId === currentUser?.id;
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit invoice entries." });
    }

    const beforeUpdate = await storage.getClientInvoiceEntry(invoiceId);
    if (!beforeUpdate || beforeUpdate.clientId !== clientId) {
      return res.status(404).json({ message: "Invoice entry not found for this client." });
    }

    const updates = req.body as {
      invoiceDate?: string;
      invoiceNumber?: string | null;
      notes?: string | null;
      receivedAmountDelta?: number;
    };

    const remainingDelta = Math.max(
      Number(beforeUpdate.invoiceAmount || 0) - Number(beforeUpdate.receivedAmount || 0),
      0,
    );
    const receivedAmountDelta = Number(updates.receivedAmountDelta || 0);

    if (receivedAmountDelta < 0) {
      return res.status(400).json({ message: "Received amount cannot be negative." });
    }
    if (receivedAmountDelta > remainingDelta) {
      return res.status(400).json({
        message: `Received amount exceeds remaining delta. Maximum allowed is ${remainingDelta}.`,
      });
    }

    const nextReceivedAmount = Number(beforeUpdate.receivedAmount || 0) + receivedAmountDelta;

    const updated = await storage.updateClientInvoiceEntry(invoiceId, {
      invoiceDate: updates.invoiceDate ?? beforeUpdate.invoiceDate,
      invoiceNumber: updates.invoiceNumber ?? beforeUpdate.invoiceNumber,
      notes: updates.notes ?? beforeUpdate.notes,
      receivedAmount: nextReceivedAmount,
      // Invoice amount is intentionally immutable after creation for clean ledger tracking.
      invoiceAmount: beforeUpdate.invoiceAmount,
    });
    await storage.createClientInvoiceEntryHistory({
      clientId,
      invoiceEntryId: updated.id,
      action: "UPDATED",
      changedByUserId: currentUser?.id ?? client.ownerId,
      snapshot: {
        before: beforeUpdate,
        after: updated,
      },
    });
    await syncClientLedgerFromInvoices(clientId);
    res.json(updated);
  });

  app.post("/api/activity-timeline", async (req, res) => {
    const { activityType, ...rest } = req.body as { activityType: string; leadId?: string; teamId?: string } & Record<
      string,
      any
    >;

    if (!activityType) {
      return res.status(400).json({ message: "activityType is required" });
    }

    let teamId = rest.teamId as string | undefined | null;

    // Ensure teamId is never null because activityTimeline.teamId is NOT NULL
    if (!teamId && rest.leadId) {
      const leadsForActivity = await storage.getLeads({ id: rest.leadId });
      teamId = leadsForActivity[0]?.teamId ?? "unassigned";
    }

    const [timelineEntry] = await db
      .insert(activityTimeline)
      .values({
        ...rest,
        leadId: typeof rest.leadId === "string" ? rest.leadId : "",
        teamId: teamId ?? "unassigned",
        activityType,
        body: typeof rest.body === "string" ? rest.body : "",
        createdByUserId: typeof rest.createdByUserId === "string" ? rest.createdByUserId : "",
      })
      .returning();

    // Include a derived `type` field for the frontend which expects `type`
    res.json({ ...timelineEntry, type: timelineEntry.activityType });
  });

  app.get("/api/activity-timeline/:leadId", async (req, res) => {
    const timeline = await db
      .select()
      .from(activityTimeline)
      .where(eq(activityTimeline.leadId, req.params.leadId));

    // Add `type` field to each entry for compatibility with the frontend
    const withType = timeline.map((entry) => ({
      ...entry,
      type: entry.activityType,
    }));

    res.json(withType);
  });

  return httpServer;
}
