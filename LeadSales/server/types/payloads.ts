import type { Client, Lead, Plan, Task, Team, User } from "@shared/schema";

export type IdParam = { id: string };
export type LeadIdParam = { leadId: string };
export type ClientInvoiceParams = { clientId: string; invoiceId: string };

export type LeadFiltersQuery = {
  id?: string;
  ownerId?: string;
  teamId?: string;
  planId?: string;
  includeStale?: string;
};

export type CreateLeadBody = {
  ownerId?: Lead["ownerId"];
  teamLeadId?: Lead["teamLeadId"];
  teamId?: Lead["teamId"];
  planId?: Lead["planId"];
  uploadBatchId?: Lead["uploadBatchId"];
  source?: Lead["source"];
  value?: Lead["value"];
  linkedinUrl?: Lead["linkedinUrl"];
  email?: Lead["email"];
  phone?: Lead["phone"];
  contactOptions?: Lead["contactOptions"];
  firstName?: Lead["firstName"];
  lastName?: Lead["lastName"];
  company?: Lead["company"];
  title?: Lead["title"];
  connectionStatus?: Lead["connectionStatus"];
  connectionSentAt?: Lead["connectionSentAt"];
  connectionAcceptedAt?: Lead["connectionAcceptedAt"];
  responseTimeMinutes?: Lead["responseTimeMinutes"];
  stage?: Lead["stage"];
  statusChangedAt?: Lead["statusChangedAt"];
  notes?: Lead["notes"];
  ownerName?: Lead["ownerName"];
  initialContactDueDate?: Lead["initialContactDueDate"];
  initialContactCompletedDate?: Lead["initialContactCompletedDate"];
  nextEmailFollowupDate?: Lead["nextEmailFollowupDate"];
  emailLastSentDate?: Lead["emailLastSentDate"];
  nextMessageFollowupDate?: Lead["nextMessageFollowupDate"];
  messageLastSentDate?: Lead["messageLastSentDate"];
};

export type UpdateLeadBody = Partial<CreateLeadBody>;

export type ActivityTimelineBody = {
  activityType: string;
  leadId?: string;
  teamId?: string;
  channel?: string;
  body?: string;
  createdByUserId?: string;
  happenedAt?: string;
  subject?: string;
  notes?: string;
};

export type TeamCreateBody = {
  name: string;
  leadId?: string;
  memberIds?: string[];
};

export type TeamUpdateBody = Partial<Pick<Team, "leadId" | "memberCount">>;
export type TeamReassignBody = { userId: string; newTeamId: string | null };

export type PlanAssignmentsBody = { userIds: string[] };
export type PlanTeamsBody = { teamIds: string[] };
export type PlanUpdateBody = Partial<
  Pick<
    Plan,
    | "name"
    | "ownerId"
    | "initialContactsPerDay"
    | "taskScheduleStartDate"
    | "emailTaskCount"
    | "linkedinTaskCount"
    | "callTaskCount"
    | "emailDelayDays"
    | "messageDelayDays"
    | "callDelayDays"
    | "initialContactChannel"
    | "isActive"
  >
>;

export type UserCreateBody = {
  name: string;
  email: string;
  role: string;
  teamId?: string;
  password?: string;
  sendEmail?: boolean;
};

export type UserUpdateBody = Partial<
  Pick<User, "username" | "name" | "email" | "role" | "teamId" | "timezone" | "isActive" | "avatar" | "avatarUrl">
>;

export type GoalCreateBody = {
  teamId: string;
  userId?: string;
  metric: string;
  period: "DAY" | "WEEK" | "MONTH";
  target: number;
};

export type GoalFiltersQuery = { teamId?: string; metric?: string; period?: string };

export type TaskFiltersQuery = {
  id?: string;
  userId?: string;
  leadId?: string;
  planId?: string;
  status?: string;
};

export type TaskCreateBody = {
  leadId: string;
  userId: string;
  type: string;
  status?: string;
  priority?: string;
  dueDate: string;
  notes?: string;
};

export type TaskUpdateBody = Partial<Pick<Task, "leadId" | "userId" | "type" | "status" | "priority" | "dueDate" | "notes">>;


export type ClientCreateBody = {
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

export type ClientUpdateBody = Partial<
  Pick<
    Client,
    | "projectName"
    | "company"
    | "startDate"
    | "ticketSize"
    | "paymentTerms"
    | "billingFrequency"
    | "hourlyRate"
    | "resourceCount"
    | "invoiceNumber"
    | "invoiceAmount"
    | "paymentStatus"
    | "deltaAmount"
    | "googleSheetLink"
    | "clientPOC"
    | "ownerId"
    | "teamId"
  >
>;

export type ClientInvoiceCreateBody = {
  invoiceDate?: string;
  invoiceNumber?: string;
  invoiceAmount?: number;
  receivedAmount?: number;
  notes?: string;
};

export type ClientInvoiceUpdateBody = {
  invoiceDate?: string;
  invoiceNumber?: string | null;
  notes?: string | null;
  receivedAmountDelta?: number;
};

