import { pgTable, text, varchar, integer, timestamp, boolean, date, jsonb, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Roles Enum
export const Role = {
  ADMIN: "ADMIN",
  TEAM_LEAD: "TEAM_LEAD",
  AE: "AE",
  SDR: "SDR",
} as const;

export const ConnectionStatus = {
  NONE: "NONE",
  SENT: "SENT",
  ACCEPTED: "ACCEPTED",
} as const;

export const LeadStage = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  MEETING_SET: "MEETING_SET",
  QUALIFIED: "QUALIFIED",
  CLOSED_WON: "CLOSED_WON",
  CLOSED_LOST: "CLOSED_LOST",
} as const;

export const Metric = {
  LINKEDIN_CONNECTIONS: "LINKEDIN_CONNECTIONS",
  EMAILS_SENT: "EMAILS_SENT",
  COLD_CALLS: "COLD_CALLS",
} as const;

export const Period = {
  DAY: "DAY",
  WEEK: "WEEK",
  MONTH: "MONTH",
} as const;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  teamId: text("team_id"),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  isActive: boolean("is_active").default(true),
  avatar: text("avatar"),
  avatarUrl: text("avatar_url"),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  leadId: text("lead_id"),
  memberCount: integer("member_count").default(0),
});

export const userTeams = pgTable("user_teams", {
  userId: text("user_id").notNull(),
  teamId: text("team_id").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.teamId] }),
}));

export type UserTeam = typeof userTeams.$inferSelect;
export type InsertUserTeam = typeof userTeams.$inferInsert;

export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  initialContactsPerDay: integer("initial_contacts_per_day").notNull().default(20),
  taskScheduleStartDate: date("task_schedule_start_date").notNull().default(sql`CURRENT_DATE`),
  emailTaskCount: integer("email_task_count").notNull().default(4),
  linkedinTaskCount: integer("linkedin_task_count").notNull().default(4),
  callTaskCount: integer("call_task_count").notNull().default(4),
  emailDelayDays: integer("email_delay_days").notNull().default(3),
  messageDelayDays: integer("message_delay_days").notNull().default(2),
  callDelayDays: integer("call_delay_days").notNull().default(0),
  initialContactChannel: text("initial_contact_channel").notNull().default("LinkedIn"), // Email, LinkedIn, Both
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const planAssignments = pgTable("plan_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: text("plan_id").notNull(),
  userId: text("user_id").notNull(),
});

export const planTeams = pgTable("plan_teams", {
  planId: text("plan_id").notNull(),
  teamId: text("team_id").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.planId, table.teamId] }),
}));

export type PlanTeam = typeof planTeams.$inferSelect;
export type InsertPlanTeam = typeof planTeams.$inferInsert;

export const uploadBatches = pgTable("upload_batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  planId: text("plan_id").notNull(),
  createdById: text("created_by_id").notNull(),
  importedAt: timestamp("imported_at").defaultNow(),
  rowCount: integer("row_count").notNull(),
  successCount: integer("success_count").notNull(),
  errorCount: integer("error_count").notNull(),
  hash: text("hash").notNull(),
  meta: jsonb("meta"),
});

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectName: text("project_name").notNull(),
  company: text("company").notNull(),
  startDate: date("start_date"),
  ticketSize: integer("ticket_size").notNull(),
  paymentTerms: text("payment_terms").notNull(),
  billingFrequency: text("billing_frequency").notNull(),
  hourlyRate: integer("hourly_rate").notNull(),
  resourceCount: integer("resource_count").notNull(),
  invoiceNumber: text("invoice_number"),
  invoiceAmount: integer("invoice_amount").notNull().default(0),
  paymentStatus: text("payment_status").notNull().default("UNPAID"),
  deltaAmount: integer("delta_amount").notNull().default(0),
  googleSheetLink: text("google_sheet_link"),
  clientPOC: text("client_poc").notNull(),
  ownerId: text("owner_id").notNull(),
  teamId: text("team_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clientInvoiceEntries = pgTable("client_invoice_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  invoiceNumber: text("invoice_number"),
  invoiceAmount: integer("invoice_amount").notNull().default(0),
  receivedAmount: integer("received_amount").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const clientInvoiceEntryHistory = pgTable("client_invoice_entry_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: text("client_id").notNull(),
  invoiceEntryId: text("invoice_entry_id").notNull(),
  action: text("action").notNull(), // CREATED | UPDATED
  changedByUserId: text("changed_by_user_id").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: text("team_id"),
  ownerId: text("owner_id").notNull(),
  teamLeadId: text("team_lead_id"),
  planId: text("plan_id"),
  uploadBatchId: text("upload_batch_id"),
  source: text("source"),
  value: integer("value"),
  linkedinUrl: text("linkedin_url"),
  email: text("email"),
  phone: text("phone"),
  contactOptions: text("contact_options").array().notNull().default(sql`'{}'::text[]`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  connectionStatus: text("connection_status").notNull().default(ConnectionStatus.NONE),
  connectionSentAt: timestamp("connection_sent_at"),
  connectionAcceptedAt: timestamp("connection_accepted_at"),
  responseTimeMinutes: integer("response_time_minutes"),
  stage: text("stage").notNull().default(LeadStage.NEW),
  statusChangedAt: timestamp("status_changed_at").defaultNow(),
  notes: text("notes"),
  ownerName: text("owner_name"),

  // Scheduling fields
  initialContactDueDate: date("initial_contact_due_date"),
  initialContactCompletedDate: timestamp("initial_contact_completed_date"),
  nextEmailFollowupDate: date("next_email_followup_date"),
  emailLastSentDate: timestamp("email_last_sent_date"),
  nextMessageFollowupDate: date("next_message_followup_date"),
  messageLastSentDate: timestamp("message_last_sent_date"),

  createdById: text("created_by_id"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  leadsEmailUnique: uniqueIndex("leads_email_unique").on(table.email),
  leadsLinkedinUrlUnique: uniqueIndex("leads_linkedin_url_unique").on(table.linkedinUrl),
}));

export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: text("team_id").notNull(),
  userId: text("user_id").notNull(),
  activityDate: date("activity_date").notNull(),
  linkedinConnectionsSent: integer("linkedin_connections_sent").default(0),
  connectionAccepts: integer("connection_accepts").default(0),
  emailsSent: integer("emails_sent").default(0),
  personalizedEmailsSent: integer("personalized_emails_sent").default(0),
  inMailsSent: integer("in_mails_sent").default(0),
  coldCalls: integer("cold_calls").default(0),
});

export const goals = pgTable("goals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: text("team_id").notNull(),
  userId: text("user_id"),
  period: text("period").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  metric: text("metric").notNull(),
  target: integer("target").notNull(),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: text("lead_id"),
  planId: text("plan_id"),
  scheduleKey: text("schedule_key"),
  userId: text("user_id").notNull(),
  createdByUserId: text("created_by_user_id"),
  type: text("type").notNull(), // email_followup, linkedin_message, call, followup, etc.
  status: text("status").notNull().default("OPEN"), // OPEN, COMPLETED
  priority: text("priority").notNull().default("MEDIUM"), // LOW, MEDIUM, HIGH
  dueDate: date("due_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const linkedinProfiles = pgTable("linkedin_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),               // LinkedIn profile URL must be unique
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const emailAccounts = pgTable("email_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  provider: text("provider").notNull().default("Google"),
  status: text("status").notNull().default("Active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users);
export const insertTeamSchema = createInsertSchema(teams);
export const insertPlanSchema = createInsertSchema(plans);
export const insertUploadBatchSchema = createInsertSchema(uploadBatches);
export const insertClientSchema = createInsertSchema(clients);
export const insertClientInvoiceEntrySchema = createInsertSchema(clientInvoiceEntries);
export const insertClientInvoiceEntryHistorySchema = createInsertSchema(clientInvoiceEntryHistory);
export const insertLeadSchema = createInsertSchema(leads);
export const insertActivitySchema = createInsertSchema(activities);
export const insertGoalSchema = createInsertSchema(goals);
export const insertTaskSchema = createInsertSchema(tasks);
export const insertLinkedinProfileSchema = createInsertSchema(linkedinProfiles);
export const insertEmailAccountSchema = createInsertSchema(emailAccounts);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Team = typeof teams.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type UploadBatch = typeof uploadBatches.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type ClientInvoiceEntry = typeof clientInvoiceEntries.$inferSelect;
export type ClientInvoiceEntryHistory = typeof clientInvoiceEntryHistory.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type LinkedinProfile = typeof linkedinProfiles.$inferSelect;
export type InsertLinkedinProfile = z.infer<typeof insertLinkedinProfileSchema>;
export type EmailAccount = typeof emailAccounts.$inferSelect;
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;

export const activityTimeline = pgTable("activity_timeline", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: text("lead_id").notNull(),
  teamId: text("team_id").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  activityType: text("activity_type").notNull(), // initial_message, linkedin_message, email, call, meeting, note, status_change, task_completed, followup_scheduled
  channel: text("channel"),
  subject: text("subject"),
  body: text("body").notNull(),
  notes: text("notes"),
  happenedAt: timestamp("happened_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertActivityTimelineSchema = createInsertSchema(activityTimeline);
export type ActivityTimeline = typeof activityTimeline.$inferSelect;
