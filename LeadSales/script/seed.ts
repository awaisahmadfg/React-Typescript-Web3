import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  users, teams, plans, planAssignments, leads, activities, goals, clients, clientInvoiceEntries, activityTimeline, userTeams,
  Role, LeadStage, ConnectionStatus,
} from "../shared/schema.js";

if (process.env.NODE_ENV === "production") {
  console.error("❌ Seed cannot run in production. Aborting.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function seed() {
  console.log("🌱 Seeding database...");

  // ── Teams ──────────────────────────────────────────────────────────────────
  const [teamA, teamB] = await db.insert(teams).values([
    { name: "Alpha Squad" },
    { name: "Beta Crew" },
  ]).returning();
  console.log("✓ Teams");

  // ── Users ──────────────────────────────────────────────────────────────────
  const [admin, leadA, ae1, ae2, sdr1, leadB, ae3] = await db.insert(users).values([
    { username: "admin",   password: "admin123",   name: "Admin User",     email: "admin@salespulse.io",   role: Role.ADMIN,     teamId: teamA.id },
    { username: "sara",    password: "pass123",    name: "Sara Khan",      email: "sara@salespulse.io",    role: Role.TEAM_LEAD, teamId: teamA.id },
    { username: "ali",     password: "pass123",    name: "Ali Raza",       email: "ali@salespulse.io",     role: Role.AE,        teamId: teamA.id },
    { username: "zara",    password: "pass123",    name: "Zara Ahmed",     email: "zara@salespulse.io",    role: Role.AE,        teamId: teamA.id },
    { username: "hamza",   password: "pass123",    name: "Hamza Sheikh",   email: "hamza@salespulse.io",   role: Role.SDR,       teamId: teamA.id },
    { username: "omar",    password: "pass123",    name: "Omar Farooq",    email: "omar@salespulse.io",    role: Role.TEAM_LEAD, teamId: teamB.id },
    { username: "nadia",   password: "pass123",    name: "Nadia Malik",    email: "nadia@salespulse.io",   role: Role.AE,        teamId: teamB.id },
  ]).returning();
  console.log("✓ Users");

  // Populate user_teams junction table
  await db.insert(userTeams).values([
    { userId: admin.id, teamId: teamA.id },
    { userId: leadA.id, teamId: teamA.id },
    { userId: ae1.id,   teamId: teamA.id },
    { userId: ae2.id,   teamId: teamA.id },
    { userId: sdr1.id,  teamId: teamA.id },
    { userId: leadB.id, teamId: teamB.id },
    { userId: ae3.id,   teamId: teamB.id },
  ]).onConflictDoNothing();
  console.log("✓ User-Team memberships");

  // Update team lead IDs
  await db.update(teams).set({ leadId: leadA.id, memberCount: 4 }).where(eq(teams.id, teamA.id));
  await db.update(teams).set({ leadId: leadB.id, memberCount: 2 }).where(eq(teams.id, teamB.id));

  // ── Plans ──────────────────────────────────────────────────────────────────
  const [plan1, plan2] = await db.insert(plans).values([
    { name: "LinkedIn Outreach Q2", ownerId: leadA.id, initialContactsPerDay: 25, emailDelayDays: 3, messageDelayDays: 2, callDelayDays: 0, initialContactChannel: "LinkedIn" },
    { name: "Email Blitz", ownerId: leadB.id, initialContactsPerDay: 40, emailDelayDays: 2, messageDelayDays: 3, callDelayDays: 0, initialContactChannel: "Email" },
  ]).returning();
  console.log("✓ Plans");

  // ── Plan Assignments ───────────────────────────────────────────────────────
  await db.insert(planAssignments).values([
    { planId: plan1.id, userId: ae1.id },
    { planId: plan1.id, userId: ae2.id },
    { planId: plan1.id, userId: sdr1.id },
    { planId: plan2.id, userId: ae3.id },
  ]);
  console.log("✓ Plan Assignments");

  // ── Leads ──────────────────────────────────────────────────────────────────
  const leadsData = [
    { firstName: "James",   lastName: "Carter",   company: "Acme Corp",      title: "VP Sales",         stage: LeadStage.CLOSED_WON,   connectionStatus: ConnectionStatus.ACCEPTED, ownerId: ae1.id, teamId: teamA.id, planId: plan1.id, email: "james@acme.com",    linkedinUrl: "https://linkedin.com/in/jamescarter"   },
    { firstName: "Emily",   lastName: "Stone",    company: "TechWave",       title: "CTO",              stage: LeadStage.MEETING_SET,  connectionStatus: ConnectionStatus.ACCEPTED, ownerId: ae1.id, teamId: teamA.id, planId: plan1.id, email: "emily@techwave.io", linkedinUrl: "https://linkedin.com/in/emilystone"    },
    { firstName: "Robert",  lastName: "Lee",      company: "CloudBase",      title: "CEO",              stage: LeadStage.QUALIFIED,    connectionStatus: ConnectionStatus.ACCEPTED, ownerId: ae2.id, teamId: teamA.id, planId: plan1.id, email: "robert@cloudbase.com", linkedinUrl: "https://linkedin.com/in/robertlee"  },
    { firstName: "Sophie",  lastName: "Grant",    company: "Finlytics",      title: "Head of Growth",   stage: LeadStage.CONTACTED,    connectionStatus: ConnectionStatus.SENT,     ownerId: ae2.id, teamId: teamA.id, planId: plan1.id, email: "sophie@finlytics.com" },
    { firstName: "David",   lastName: "Kim",      company: "RetailPro",      title: "Director Sales",   stage: LeadStage.NEW,          connectionStatus: ConnectionStatus.NONE,     ownerId: sdr1.id, teamId: teamA.id, planId: plan1.id },
    { firstName: "Laura",   lastName: "Nash",     company: "HealthSync",     title: "Founder",          stage: LeadStage.CLOSED_LOST,  connectionStatus: ConnectionStatus.ACCEPTED, ownerId: ae1.id, teamId: teamA.id, planId: plan1.id, email: "laura@healthsync.com" },
    { firstName: "Michael", lastName: "Torres",   company: "GrowthEngine",   title: "CMO",              stage: LeadStage.NEW,          connectionStatus: ConnectionStatus.NONE,     ownerId: ae3.id, teamId: teamB.id, planId: plan2.id },
    { firstName: "Aisha",   lastName: "Patel",    company: "DeployFast",     title: "COO",              stage: LeadStage.CONTACTED,    connectionStatus: ConnectionStatus.SENT,     ownerId: ae3.id, teamId: teamB.id, planId: plan2.id, email: "aisha@deployfast.io" },
    { firstName: "Chris",   lastName: "Evans",    company: "ScaleUp Labs",   title: "VP Engineering",   stage: LeadStage.MEETING_SET,  connectionStatus: ConnectionStatus.ACCEPTED, ownerId: ae3.id, teamId: teamB.id, planId: plan2.id },
    { firstName: "Nina",    lastName: "Ruiz",     company: "SaaSify",        title: "Product Director", stage: LeadStage.QUALIFIED,    connectionStatus: ConnectionStatus.ACCEPTED, ownerId: ae3.id, teamId: teamB.id, planId: plan2.id },
  ];

  const insertedLeads = await db.insert(leads).values(leadsData).returning();
  console.log("✓ Leads");

  // ── Activities (last 7 days) ───────────────────────────────────────────────
  const today = new Date();
  const activityRows = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];

    for (const u of [ae1, ae2, sdr1, ae3]) {
      activityRows.push({
        teamId: u.teamId!,
        userId: u.id,
        activityDate: dateStr,
        linkedinConnectionsSent: Math.floor(Math.random() * 20) + 10,
        connectionAccepts: Math.floor(Math.random() * 8) + 2,
        emailsSent: Math.floor(Math.random() * 15) + 5,
        personalizedEmailsSent: Math.floor(Math.random() * 5) + 1,
        inMailsSent: Math.floor(Math.random() * 5),
        coldCalls: Math.floor(Math.random() * 10) + 2,
      });
    }
  }
  await db.insert(activities).values(activityRows);
  console.log("✓ Activities");

  // ── Goals ──────────────────────────────────────────────────────────────────
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  await db.insert(goals).values([
    { teamId: teamA.id, period: "MONTH", startDate: monthStart, endDate: monthEnd, metric: "LINKEDIN_CONNECTIONS", target: 300 },
    { teamId: teamA.id, period: "MONTH", startDate: monthStart, endDate: monthEnd, metric: "EMAILS_SENT",          target: 500 },
    { teamId: teamA.id, userId: ae1.id, period: "MONTH", startDate: monthStart, endDate: monthEnd, metric: "LINKEDIN_CONNECTIONS", target: 100 },
    { teamId: teamB.id, period: "MONTH", startDate: monthStart, endDate: monthEnd, metric: "COLD_CALLS",           target: 200 },
  ]);
  console.log("✓ Goals");

  // ── Clients ────────────────────────────────────────────────────────────────
  const [client1, client2] = await db.insert(clients).values([
    { projectName: "CRM Integration", company: "Acme Corp",    startDate: "2025-01-01", ticketSize: 12000, paymentTerms: "NET30", billingFrequency: "Monthly",   hourlyRate: 120, resourceCount: 2, invoiceAmount: 12000, paymentStatus: "PAID",   clientPOC: "James Carter", ownerId: leadA.id, teamId: teamA.id },
    { projectName: "Data Pipeline",   company: "TechWave",     startDate: "2025-02-01", ticketSize: 18000, paymentTerms: "NET15", billingFrequency: "Bi-Weekly", hourlyRate: 150, resourceCount: 3, invoiceAmount: 18000, paymentStatus: "UNPAID", clientPOC: "Emily Stone",  ownerId: leadA.id, teamId: teamA.id },
  ]).returning();
  console.log("✓ Clients");

  // ── Invoice Entries ────────────────────────────────────────────────────────
  await db.insert(clientInvoiceEntries).values([
    { clientId: client1.id, invoiceDate: "2025-03-01", invoiceNumber: "INV-001", invoiceAmount: 12000, receivedAmount: 12000, notes: "Paid on time" },
    { clientId: client2.id, invoiceDate: "2025-03-15", invoiceNumber: "INV-002", invoiceAmount: 18000, receivedAmount: 0,     notes: "Pending payment" },
  ]);
  console.log("✓ Invoice Entries");

  // ── Activity Timeline ──────────────────────────────────────────────────────
  const lead1 = insertedLeads[0];
  const lead2 = insertedLeads[1];
  await db.insert(activityTimeline).values([
    { leadId: lead1.id, teamId: teamA.id, createdByUserId: ae1.id, activityType: "initial_message", channel: "LinkedIn", subject: "Connection Request", body: "Hi James, I'd love to connect and share how we can help Acme scale." },
    { leadId: lead1.id, teamId: teamA.id, createdByUserId: ae1.id, activityType: "status_change",   channel: "LinkedIn", body: "Stage changed to CLOSED_WON" },
    { leadId: lead2.id, teamId: teamA.id, createdByUserId: ae1.id, activityType: "email",           channel: "Email",    subject: "Follow-up", body: "Hi Emily, following up on our last conversation about TechWave's infrastructure." },
    { leadId: lead2.id, teamId: teamA.id, createdByUserId: ae1.id, activityType: "meeting",         channel: "Zoom",     body: "Meeting scheduled for product demo" },
  ]);
  console.log("✓ Activity Timeline");

  console.log("\n✅ Seed complete!");
  console.log("\n🔑 Login credentials:");
  console.log("   admin   / admin123  (ADMIN)");
  console.log("   sara    / pass123   (TEAM_LEAD - Alpha Squad)");
  console.log("   ali     / pass123   (AE - Alpha Squad)");
  console.log("   zara    / pass123   (AE - Alpha Squad)");
  console.log("   hamza   / pass123   (SDR - Alpha Squad)");
  console.log("   omar    / pass123   (TEAM_LEAD - Beta Crew)");
  console.log("   nadia   / pass123   (AE - Beta Crew)");
}

import { eq } from "drizzle-orm";

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
