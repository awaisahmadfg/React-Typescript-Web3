import {
  type User,
  type InsertUser,
  type Team,
  type Lead,
  type Activity,
  type Goal,
  type Plan,
  type Task,
  type Client,
  type ClientInvoiceEntry,
  type ClientInvoiceEntryHistory,
  users,
  teams,
  plans,
  leads,
  activities,
  goals,
  tasks,
  planAssignments,
  clients,
  clientInvoiceEntries,
  clientInvoiceEntryHistory,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;

  // Teams
  getTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: any): Promise<Team>;
  updateTeam(id: string, updates: Partial<Team>): Promise<Team>;
  deleteTeam(id: string): Promise<void>;
  assignUserToTeam(userId: string, teamId: string | null): Promise<User>;

  // Plans
  getPlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  createPlan(plan: any): Promise<Plan>;
  updatePlan(id: string, updates: Partial<Plan>): Promise<Plan>;
  deletePlan(id: string): Promise<void>;
  getPlanAssignments(planId: string): Promise<{ userId: string }[]>;
  setPlanAssignments(planId: string, userIds: string[]): Promise<void>;

  // Leads
  getLeads(filters: any): Promise<Lead[]>;
  createLead(lead: any): Promise<Lead>;
  updateLead(id: string, updates: Partial<Lead>): Promise<Lead>;

  // Activities
  getActivities(filters: any): Promise<Activity[]>;
  upsertActivity(activity: any): Promise<Activity>;

  // Goals
  getGoals(filters: any): Promise<Goal[]>;
  createGoal(goal: any): Promise<Goal>;
  getAEDashboardStats(user: User): Promise<any[]>;
  updateGoal(id: string, updates: Partial<Goal>): Promise<Goal>;

  // Tasks
  getTasks(filters: any): Promise<Task[]>;
  createTask(task: any): Promise<Task>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;

  // Clients (Client Ledger)
  getClients(filters: any): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: any): Promise<Client>;
  updateClient(id: string, updates: Partial<Client>): Promise<Client>;
  deleteClient(id: string): Promise<void>;
  getClientInvoiceEntries(clientId: string): Promise<ClientInvoiceEntry[]>;
  getClientInvoiceEntry(id: string): Promise<ClientInvoiceEntry | undefined>;
  createClientInvoiceEntry(entry: any): Promise<ClientInvoiceEntry>;
  updateClientInvoiceEntry(id: string, updates: Partial<ClientInvoiceEntry>): Promise<ClientInvoiceEntry>;
  getClientInvoiceEntryHistory(clientId: string): Promise<ClientInvoiceEntryHistory[]>;
  createClientInvoiceEntryHistory(entry: any): Promise<ClientInvoiceEntryHistory>;
}

export class DatabaseStorage implements IStorage {
  /** "Active" if last stage change (or lead creation) is within the last 2 months. */
  private isLeadWithinActiveWindow(lead: Lead): boolean {
    const anchorRaw = lead.statusChangedAt ?? lead.createdAt;
    if (!anchorRaw) return false;
    const anchor = new Date(anchorRaw as string | Date);
    if (Number.isNaN(anchor.getTime())) return false;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 2);
    return anchor >= cutoff;
  }
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async getTeams(): Promise<Team[]> {
    return await db.select().from(teams);
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team;
  }

  async createTeam(team: any): Promise<Team> {
    const [newTeam] = await db.insert(teams).values(team).returning();
    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
    const [updatedTeam] = await db
      .update(teams)
      .set(updates)
      .where(eq(teams.id, id))
      .returning();
    return updatedTeam;
  }

  async deleteTeam(id: string): Promise<void> {
    // Clear team assignment for users in this team, then delete the team
    await db.update(users).set({ teamId: null }).where(eq(users.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  async getPlans(): Promise<Plan[]> {
    try {
      return await db.select().from(plans);
    } catch {
      // Backward-compatible fallback for environments with older plans schema
      const fallback = await db.execute(sql`
        SELECT id, name, owner_id, created_at
        FROM plans
      `);
      return (fallback as any).rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        initialContactsPerDay: 0,
        emailDelayDays: 3,
        messageDelayDays: 2,
        initialContactChannel: "LinkedIn",
        isActive: true,
        createdAt: row.created_at,
      })) as Plan[];
    }
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async createPlan(plan: any): Promise<Plan> {
    try {
      const [newPlan] = await db.insert(plans).values(plan).returning();
      return newPlan;
    } catch {
      // Backward-compatible fallback for environments with older plans schema
      const inserted = await db.execute(sql`
        INSERT INTO plans (name, owner_id)
        VALUES (${plan.name}, ${plan.ownerId})
        RETURNING id, name, owner_id, created_at
      `);
      const row = (inserted as any).rows[0];
      return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        initialContactsPerDay: 0,
        emailDelayDays: 3,
        messageDelayDays: 2,
        initialContactChannel: "LinkedIn",
        isActive: true,
        createdAt: row.created_at,
      } as Plan;
    }
  }

  async updatePlan(id: string, updates: Partial<Plan>): Promise<Plan> {
    try {
      const [updatedPlan] = await db
        .update(plans)
        .set(updates)
        .where(eq(plans.id, id))
        .returning();
      return updatedPlan;
    } catch {
      // Backward-compatible fallback for environments with older plans schema
      const nextName = typeof updates.name === "string" ? updates.name : null;

      const updated = nextName
        ? await db.execute(sql`
            UPDATE plans
            SET name = ${nextName}
            WHERE id = ${id}
            RETURNING id, name, owner_id, created_at
          `)
        : await db.execute(sql`
            SELECT id, name, owner_id, created_at
            FROM plans
            WHERE id = ${id}
          `);

      const row = (updated as any).rows?.[0];
      if (!row) {
        throw new Error("Plan not found");
      }

      return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        initialContactsPerDay: 0,
        emailDelayDays: 3,
        messageDelayDays: 2,
        initialContactChannel: "LinkedIn",
        isActive: true,
        createdAt: row.created_at,
      } as Plan;
    }
  }

  async deletePlan(id: string): Promise<void> {
    await db.delete(planAssignments).where(eq(planAssignments.planId, id));
    await db.delete(plans).where(eq(plans.id, id));
  }

  async getLeads(filters: any): Promise<Lead[]> {
    let query = db.select().from(leads);
    const conditions = [];
    if (filters.id) conditions.push(eq(leads.id, filters.id));
    if (filters.ownerId) conditions.push(eq(leads.ownerId, filters.ownerId));
    if (filters.teamId) conditions.push(eq(leads.teamId, filters.teamId));
    if (filters.planId) conditions.push(eq(leads.planId, filters.planId));

    const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query;

    if (filters.id || filters.includeStale === "true" || filters.includeStale === true) {
      return rows;
    }

    return rows.filter((lead) => this.isLeadWithinActiveWindow(lead));
  }

  async createLead(lead: any): Promise<Lead> {
    const [newLead] = await db.insert(leads).values(lead).returning();
    return newLead;
  }

  async updateLead(id: string, updates: Partial<Lead>): Promise<Lead> {
    const [existingLead] = await db
      .select({ stage: leads.stage })
      .from(leads)
      .where(eq(leads.id, id));

    const isStageChanged = typeof updates.stage === "string" && updates.stage !== existingLead?.stage;

    const [updatedLead] = await db
      .update(leads)
      .set({
        ...updates,
        updatedAt: sql`NOW()`,
        ...(isStageChanged ? { statusChangedAt: sql`NOW()` } : {}),
      })
      .where(eq(leads.id, id))
      .returning();
    return updatedLead;
  }

  async getActivities(_filters: any): Promise<Activity[]> {
    return await db.select().from(activities);
  }

  async upsertActivity(activity: any): Promise<Activity> {
    const [newActivity] = await db.insert(activities).values(activity).returning();
    return newActivity;
  }

  async getAEDashboardStats(user: User): Promise<any[]> {
    const allUsers = await db
      .select()
      .from(users)
      .where(user.role === "ADMIN" ? undefined : eq(users.teamId, user.teamId || ""));
    const filteredUsers = allUsers.filter((u) => u.role === "AE" || u.role === "SDR");

    const stats = await Promise.all(
      filteredUsers.map(async (aeUser: User) => {
        const userLeads = await db.select().from(leads).where(eq(leads.ownerId, aeUser.id));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dueInitial = userLeads.filter(
          (l: any) =>
            l.initialContactDueDate &&
            !l.initialContactCompletedDate &&
            new Date(l.initialContactDueDate) <= today,
        );
        const dueEmail = userLeads.filter(
          (l: any) =>
            l.nextEmailFollowupDate &&
            (!l.emailLastSentDate || new Date(l.emailLastSentDate) < new Date(l.nextEmailFollowupDate)) &&
            new Date(l.nextEmailFollowupDate) <= today,
        );
        const dueLinkedIn = userLeads.filter(
          (l: any) =>
            l.nextMessageFollowupDate &&
            (!l.messageLastSentDate ||
              new Date(l.messageLastSentDate) < new Date(l.nextMessageFollowupDate)) &&
            new Date(l.nextMessageFollowupDate) <= today,
        );

        return {
          userId: aeUser.id,
          userName: aeUser.name,
          teamId: aeUser.teamId,
          stats: {
            dueToday: dueInitial.length + dueEmail.length + dueLinkedIn.length,
            overdue: 0,
            initialDue: dueInitial.length,
            emailDue: dueEmail.length,
            linkedinDue: dueLinkedIn.length,
          },
        };
      }),
    );

    return stats;
  }

  async getGoals(filters: any): Promise<Goal[]> {
    let query = db.select().from(goals);
    const conditions = [];
    if (filters.teamId) conditions.push(eq(goals.teamId, filters.teamId));
    if (filters.metric) conditions.push(eq(goals.metric, filters.metric));
    if (filters.period) conditions.push(eq(goals.period, filters.period));

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  async createGoal(goal: any): Promise<Goal> {
    const [newGoal] = await db.insert(goals).values(goal).returning();
    return newGoal;
  }

  async updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
    const [updatedGoal] = await db
      .update(goals)
      .set(updates)
      .where(eq(goals.id, id))
      .returning();
    return updatedGoal;
  }

  async assignUserToTeam(userId: string, teamId: string | null): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ teamId })
      .where(eq(users.id, userId))
      .returning();
    return updatedUser;
  }

  async getTasks(filters: any): Promise<Task[]> {
    let query = db.select().from(tasks);
    const conditions = [];
    if (filters.id) conditions.push(eq(tasks.id, filters.id));
    if (filters.userId) conditions.push(eq(tasks.userId, filters.userId));
    if (filters.leadId) conditions.push(eq(tasks.leadId, filters.leadId));
    if (filters.status) conditions.push(eq(tasks.status, filters.status));

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  async createTask(task: any): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const [updatedTask] = await db
      .update(tasks)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(tasks.id, id))
      .returning();
    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async getPlanAssignments(planId: string): Promise<{ userId: string }[]> {
    try {
      const rows = await db.select().from(planAssignments).where(eq(planAssignments.planId, planId));
      return rows.map((r) => ({ userId: r.userId }));
    } catch {
      // Backward-compatible fallback when plan_assignments table is not present yet
      return [];
    }
  }

  async setPlanAssignments(planId: string, userIds: string[]): Promise<void> {
    try {
      // Clear existing assignments then insert new ones
      await db.delete(planAssignments).where(eq(planAssignments.planId, planId));
      if (userIds.length === 0) return;
      await db.insert(planAssignments).values(
        userIds.map((userId) => ({
          planId,
          userId,
        })),
      );
    } catch {
      // Backward-compatible no-op when plan_assignments table is not present yet
    }
  }

  async getClients(filters: any): Promise<Client[]> {
    let query = db.select().from(clients);
    const conditions = [];
    if (filters.ownerId) conditions.push(eq(clients.ownerId, filters.ownerId));
    if (filters.teamId) conditions.push(eq(clients.teamId, filters.teamId));

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }
    return await query;
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: any): Promise<Client> {
    const [newClient] = await db.insert(clients).values(client).returning();
    return newClient;
  }

  async updateClient(id: string, updates: Partial<Client>): Promise<Client> {
    const [updatedClient] = await db
      .update(clients)
      .set(updates)
      .where(eq(clients.id, id))
      .returning();
    return updatedClient;
  }

  async deleteClient(id: string): Promise<void> {
    await db.delete(clients).where(eq(clients.id, id));
  }

  async getClientInvoiceEntries(clientId: string): Promise<ClientInvoiceEntry[]> {
    return await db
      .select()
      .from(clientInvoiceEntries)
      .where(eq(clientInvoiceEntries.clientId, clientId));
  }

  async getClientInvoiceEntry(id: string): Promise<ClientInvoiceEntry | undefined> {
    const [entry] = await db.select().from(clientInvoiceEntries).where(eq(clientInvoiceEntries.id, id));
    return entry;
  }

  async createClientInvoiceEntry(entry: any): Promise<ClientInvoiceEntry> {
    const [created] = await db.insert(clientInvoiceEntries).values(entry).returning();
    return created;
  }

  async updateClientInvoiceEntry(
    id: string,
    updates: Partial<ClientInvoiceEntry>,
  ): Promise<ClientInvoiceEntry> {
    const [updated] = await db
      .update(clientInvoiceEntries)
      .set({ ...updates, updatedAt: sql`NOW()` })
      .where(eq(clientInvoiceEntries.id, id))
      .returning();
    return updated;
  }

  async getClientInvoiceEntryHistory(clientId: string): Promise<ClientInvoiceEntryHistory[]> {
    return await db
      .select()
      .from(clientInvoiceEntryHistory)
      .where(eq(clientInvoiceEntryHistory.clientId, clientId));
  }

  async createClientInvoiceEntryHistory(entry: any): Promise<ClientInvoiceEntryHistory> {
    const [created] = await db.insert(clientInvoiceEntryHistory).values(entry).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
