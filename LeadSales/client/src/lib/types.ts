export enum Role {
  ADMIN = "ADMIN",
  TEAM_LEAD = "TEAM_LEAD",
  AE = "AE",
  SDR = "SDR"
}

export interface Client {
  id: string;
  projectName: string;
  company: string;
  startDate?: string | null;
  ticketSize: number;
  paymentTerms: string;
  billingFrequency: "MONTHLY" | "FIXED" | "BI_WEEKLY" | "WEEKLY" | "SUPPORT";
  hourlyRate: number;
  resourceCount: number;
  invoiceNumber?: string | null;
  invoiceAmount: number;
  paymentStatus: "PAID" | "UNPAID";
  deltaAmount: number;
  googleSheetLink?: string | null;
  clientPOC: string;
  ownerId: string;
  teamId: string;
  createdAt?: string;
}

export interface ClientInvoiceEntry {
  id: string;
  clientId: string;
  invoiceDate: string;
  invoiceNumber?: string | null;
  invoiceAmount: number;
  receivedAmount: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientInvoiceEntryHistory {
  id: string;
  clientId: string;
  invoiceEntryId: string;
  action: "CREATED" | "UPDATED";
  changedByUserId: string;
  snapshot: any;
  createdAt: string;
}

export enum Period {
  WEEK = "WEEK",
  MONTH = "MONTH",
  QUARTER = "QUARTER"
}

export enum Metric {
  LINKEDIN_CONNECTIONS = "LINKEDIN_CONNECTIONS",
  EMAILS_SENT = "EMAILS_SENT",
  PERSONALIZED_EMAILS = "PERSONALIZED_EMAILS",
  ACCEPTS = "ACCEPTS",
  INMAILS_SENT = "INMAILS_SENT",
  COLD_CALLS = "COLD_CALLS"
}

export enum ConnectionStatus {
  NONE = "NONE",
  SENT = "SENT",
  ACCEPTED = "ACCEPTED"
}

export enum LeadStage {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  QUALIFIED = "QUALIFIED",
  MEETING_SET = "MEETING_SET",
  WON = "WON",
  LOST = "LOST",
  MQL = "MQL", 
  SQL = "SQL"
}

export interface Task {
  id: string;
  leadId: string;
  type: "INITIAL" | "EMAIL" | "LINKEDIN";
  dueDate: string;
  completedAt?: string;
  note?: string;
}

export interface Reminder {
  id: string;
  leadId: string;
  userId: string;
  date: string;
  note: string;
  completed: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  timezone: string;
  isActive: boolean;
  avatar?: string;
  avatarUrl?: string;
  teamId?: string;
  teamIds?: string[];
}

export interface Team {
  id: string;
  name: string;
  leadId: string | null;
  memberCount?: number;
}

export interface Lead {
  id: string;
  teamId: string;
  ownerId: string;
  teamLeadId?: string | null;
  planId?: string | null;
  source?: string | null;
  value?: number | null;
  linkedinUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  contactOptions?: string[];
  firstName: string;
  lastName: string;
  company?: string | null;
  title?: string | null;
  connectionStatus: ConnectionStatus;
  connectionSentAt?: string | null;
  connectionAcceptedAt?: string | null;
  responseTimeMinutes?: number | null;
  stage: string;
  statusChangedAt?: string | null;
  ownerName?: string | null;
  notes?: string | null;
  createdById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityTimeline {
  id: string;
  leadId: string;
  teamId: string;
  createdByUserId: string;
  type: string;
  channel?: string;
  subject?: string;
  body: string;
  notes?: string;
  happenedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDaily {
  id: string;
  teamId: string;
  userId: string;
  activityDate: string;
  linkedinConnectionsSent: number;
  connectionAccepts: number;
  emailsSent: number;
  personalizedEmailsSent: number;
  inMailsSent: number;
  coldCalls: number;
}

export interface Goal {
  id: string;
  teamId: string;
  userId?: string | null;
  period: Period;
  startDate: string;
  endDate: string;
  metric: Metric;
  target: number;
}

export interface AEStats {
  userId: string;
  userName: string;
  teamId: string | null;
  stats: {
    dueToday: number;
    overdue: number;
    initialDue: number;
    emailDue: number;
    linkedinDue: number;
  };
}

export interface Plan {
  id: string;
  name: string;
  ownerId: string;
  initialContactsPerDay: number;
  taskScheduleStartDate: string;
  emailTaskCount: number;
  linkedinTaskCount: number;
  callTaskCount: number;
  emailDelayDays: number;
  messageDelayDays: number;
  callDelayDays: number;
  initialContactChannel: string;
  isActive: boolean;
  createdAt: string;
}

export interface PlanAssignment {
  userId: string;
}

export interface PlanTeamAssignment {
  teamIds: string[];
}

export interface UploadBatch {
  id: string;
  planId: string;
  createdById: string;
  importedAt: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  hash: string;
  meta?: any;
}
