import { Role, ConnectionStatus, LeadStage, User, Team, Lead, ActivityDaily, Reminder, Goal, Metric, Period } from "./types";
import { addDays, subDays, format, addHours, startOfMonth, endOfMonth } from "date-fns";

// MOCK DATA

// TEAMS
export const teams: Team[] = [
  { id: "team-1", name: "Green Lions", leadId: "user-2", memberCount: 6 },
  { id: "team-2", name: "Blue Lions", leadId: "user-3", memberCount: 5 },
  { id: "team-3", name: "Red Dragons", leadId: "user-8", memberCount: 4 }, // New Team
];

// USERS
export const users: User[] = [
  { id: "user-1", name: "Sarah Connor", email: "sarah@salespulse.com", role: Role.ADMIN, teamIds: [], timezone: "America/New_York", isActive: true, avatar: "https://i.pravatar.cc/150?u=sarah" },
  { id: "user-2", name: "John Smith", email: "john@salespulse.com", role: Role.TEAM_LEAD, teamId: "team-1", teamIds: ["team-1"], timezone: "Europe/London", isActive: true, avatar: "https://i.pravatar.cc/150?u=john" },
  { id: "user-3", name: "Emily Chen", email: "emily@salespulse.com", role: Role.TEAM_LEAD, teamId: "team-2", teamIds: ["team-2"], timezone: "Asia/Singapore", isActive: true, avatar: "https://i.pravatar.cc/150?u=emily" },
  { id: "user-4", name: "Mike Ross", email: "mike@salespulse.com", role: Role.AE, teamId: "team-1", teamIds: ["team-1"], timezone: "America/Chicago", isActive: true, avatar: "https://i.pravatar.cc/150?u=mike" },
  { id: "user-5", name: "Rachel Zane", email: "rachel@salespulse.com", role: Role.SDR, teamId: "team-1", teamIds: ["team-1"], timezone: "America/New_York", isActive: true, avatar: "https://i.pravatar.cc/150?u=rachel" },
  { id: "user-6", name: "Harvey Specter", email: "harvey@salespulse.com", role: Role.AE, teamId: "team-2", teamIds: ["team-2"], timezone: "America/New_York", isActive: true, avatar: "https://i.pravatar.cc/150?u=harvey" },
  { id: "user-7", name: "Donna Paulsen", email: "donna@salespulse.com", role: Role.SDR, teamId: "team-2", teamIds: ["team-2"], timezone: "America/Los_Angeles", isActive: true, avatar: "https://i.pravatar.cc/150?u=donna" },
];

// LEADS (Generating some synthetic leads)
const companies = ["Acme Corp", "Globex", "Soylent Corp", "Initech", "Umbrella Corp", "Stark Ind", "Wayne Ent", "Massive Dynamic", "Cyberdyne", "Hooli"];
const titles = ["CEO", "CTO", "VP Sales", "Director of Marketing", "Product Manager", "Head of Engineering", "Founder", "Co-Founder"];

export const generateLeads = (count: number): Lead[] => {
  return Array.from({ length: count }).map((_, i) => {
    const status = Math.random() > 0.6 ? ConnectionStatus.ACCEPTED : (Math.random() > 0.3 ? ConnectionStatus.SENT : ConnectionStatus.NONE);
    const stage = status === ConnectionStatus.ACCEPTED 
      ? (Math.random() > 0.7 ? LeadStage.MEETING_SET : LeadStage.CONTACTED) 
      : LeadStage.NEW;

    return {
      id: `lead-${i}`,
      teamId: i % 3 === 0 ? "team-1" : (i % 3 === 1 ? "team-2" : "team-3"),
      ownerId: users[3 + (i % 4)].id, // Assign to AEs/SDRs
      linkedinUrl: `https://linkedin.com/in/lead-${i}`,
      firstName: `LeadFirst${i}`,
      lastName: `LeadLast${i}`,
      company: companies[i % companies.length],
      title: titles[i % titles.length],
      connectionStatus: status,
      connectionSentAt: status !== ConnectionStatus.NONE ? subDays(new Date(), Math.floor(Math.random() * 10)).toISOString() : null,
      connectionAcceptedAt: status === ConnectionStatus.ACCEPTED ? subDays(new Date(), Math.floor(Math.random() * 5)).toISOString() : null,
      responseTimeMinutes: status === ConnectionStatus.ACCEPTED ? Math.floor(Math.random() * 2000) : null,
      stage: stage,
      notes: Math.random() > 0.8 ? "Looks promising, need to follow up." : null,
      createdAt: subDays(new Date(), Math.floor(Math.random() * 30)).toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });
};

export const leads = generateLeads(80);

export const activitiesTimeline = [
  {
    id: "at1",
    leadId: "lead-0",
    teamId: "team-1",
    createdByUserId: "user-4",
    type: "linkedin_message",
    body: "Sent personalized connection request with note about their recent product launch.",
    notes: "Lead accepted within 4 hours.",
    happenedAt: subDays(new Date(), 5).toISOString(),
  },
  {
    id: "at2",
    leadId: "lead-0",
    teamId: "team-1",
    createdByUserId: "user-4",
    type: "status_change",
    body: "Changed stage from NEW to CONTACTED",
    happenedAt: subDays(new Date(), 4).toISOString(),
  },
  {
    id: "at3",
    leadId: "lead-0",
    teamId: "team-1",
    createdByUserId: "user-4",
    type: "email",
    body: "Followed up with personalized email regarding our ROI calculator.",
    notes: "Used 'Direct Response' template.",
    happenedAt: subDays(new Date(), 2).toISOString(),
  },
];

// ACTIVITY DAILY
export const generateActivity = (days: number): ActivityDaily[] => {
  const activities: ActivityDaily[] = [];
  const activeUsers = users.filter(u => u.role === Role.AE || u.role === Role.SDR);

  activeUsers.forEach(user => {
    for (let i = 0; i < days; i++) {
      const date = subDays(new Date(), i);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      
      if (!isWeekend) {
        activities.push({
          id: `act-${user.id}-${i}`,
          teamId: user.teamIds?.[0] || user.teamId || "team-1",
          userId: user.id,
          activityDate: format(date, "yyyy-MM-dd"),
          linkedinConnectionsSent: Math.floor(Math.random() * 20),
          connectionAccepts: Math.floor(Math.random() * 5),
          emailsSent: Math.floor(Math.random() * 30),
          personalizedEmailsSent: Math.floor(Math.random() * 10),
          inMailsSent: Math.floor(Math.random() * 5),
          coldCalls: Math.floor(Math.random() * 15),
        });
      }
    }
  });
  return activities;
};

export const activities = generateActivity(30);

// REMINDERS
export const reminders: Reminder[] = [
  {
    id: "rem-1",
    leadId: leads[0].id,
    userId: users[3].id, // Mike
    date: addHours(new Date(), 2).toISOString(),
    note: "Send 2nd touchpoint email",
    completed: false
  },
  {
    id: "rem-2",
    leadId: leads[1].id,
    userId: users[3].id, // Mike
    date: addDays(new Date(), 1).toISOString(),
    note: "Check LinkedIn acceptance",
    completed: false
  }
];

// GOALS
export const goals: Goal[] = [
  // Green Lions Goals (Monthly)
  { id: "g-1", teamId: "team-1", period: Period.MONTH, startDate: startOfMonth(new Date()).toISOString(), endDate: endOfMonth(new Date()).toISOString(), metric: Metric.LINKEDIN_CONNECTIONS, target: 500 },
  { id: "g-2", teamId: "team-1", period: Period.MONTH, startDate: startOfMonth(new Date()).toISOString(), endDate: endOfMonth(new Date()).toISOString(), metric: Metric.EMAILS_SENT, target: 2000 },
  { id: "g-3", teamId: "team-1", period: Period.MONTH, startDate: startOfMonth(new Date()).toISOString(), endDate: endOfMonth(new Date()).toISOString(), metric: Metric.COLD_CALLS, target: 400 },
  
  // Blue Lions Goals (Monthly)
  { id: "g-4", teamId: "team-2", period: Period.MONTH, startDate: startOfMonth(new Date()).toISOString(), endDate: endOfMonth(new Date()).toISOString(), metric: Metric.LINKEDIN_CONNECTIONS, target: 600 },
  { id: "g-5", teamId: "team-2", period: Period.MONTH, startDate: startOfMonth(new Date()).toISOString(), endDate: endOfMonth(new Date()).toISOString(), metric: Metric.EMAILS_SENT, target: 1800 },
];

// AUTH STORE (Simple mock)
export const getCurrentUser = () => users[0]; // Default to Admin for now

// CONFIGURABLE STAGES STORE
export const availableStages = Object.values(LeadStage);

// CLIENT LEDGER DATA
export const clients: any[] = [
  {
    id: "c1",
    projectName: "E-commerce Migration",
    company: "Acme Corp",
    ticketSize: 25000,
    paymentTerms: "Net 30",
    billingFrequency: "MONTHLY",
    hourlyRate: 120,
    resourceCount: 3,
    deltaAmount: 0,
    clientPOC: "John Doe (jdoe@acme.com)",
    ownerId: "user-4", // Mike Ross
    teamId: "team-1"
  },
  {
    id: "c2",
    projectName: "AI Implementation",
    company: "Globex",
    ticketSize: 45000,
    paymentTerms: "Net 15",
    billingFrequency: "FIXED",
    hourlyRate: 150,
    resourceCount: 5,
    deltaAmount: 5000,
    clientPOC: "Jane Smith (jsmith@globex.com)",
    ownerId: "user-6", // Harvey Specter
    teamId: "team-2"
  },
  {
    id: "c3",
    projectName: "Security Audit",
    company: "Umbrella Corp",
    ticketSize: 15000,
    paymentTerms: "Due on Receipt",
    billingFrequency: "WEEKLY",
    hourlyRate: 200,
    resourceCount: 2,
    deltaAmount: 0,
    clientPOC: "Albert Wesker (awesker@umbrella.com)",
    ownerId: "user-4", // Mike Ross
    teamId: "team-1"
  }
];
