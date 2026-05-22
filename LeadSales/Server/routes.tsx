import type { Express } from "express";
import type { Server } from "http";
import { activityHandlers } from "../services/activities.service";
import { authHandlers } from "../services/auth.service";
import { clientHandlers } from "../services/clients.service";
import { dashboardHandlers } from "../services/dashboard.service";
import { goalHandlers } from "../services/goals.service";
import { leadHandlers } from "../services/leads.service";
import { planHandlers } from "../services/plans.service";
import { taskHandlers } from "../services/tasks.service";
import { teamHandlers } from "../services/teams.service";
import { userHandlers } from "../services/users.service";
import { emailHandlers, linkedinHandlers } from "../services/profiles.service";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/auth/me", authHandlers.me);
  app.post("/api/auth/login", authHandlers.login);
  app.post("/api/auth/logout", authHandlers.logout);
  app.post("/api/auth/change-password", authHandlers.changePassword);

  app.get("/api/dashboard/ae-stats", dashboardHandlers.aeStats);

  app.get("/api/leads", leadHandlers.list);
  app.post("/api/leads/import-preflight", leadHandlers.importPreflight);
  app.get("/api/leads/:id", leadHandlers.getById);
  app.post("/api/leads", leadHandlers.create);
  app.patch("/api/leads/:id", leadHandlers.update);
  app.delete("/api/leads/:id", leadHandlers.remove);
  app.post("/api/activity-timeline", leadHandlers.createActivityTimeline);
  app.post("/api/activity-timeline/batch", leadHandlers.batchTimeline);
  app.get("/api/activity-timeline/:leadId", leadHandlers.listTimelineByLeadId);

  app.get("/api/teams", teamHandlers.list);
  app.post("/api/teams", teamHandlers.create);
  app.patch("/api/teams/:id", teamHandlers.update);
  app.post("/api/teams/reassign-member", teamHandlers.reassignMember);
  app.post("/api/teams/:id/members", teamHandlers.addMember);
  app.delete("/api/teams/:id/members/:userId", teamHandlers.removeMember);
  app.delete("/api/teams/:id", teamHandlers.remove);
  app.get("/api/teams/:id/plans", teamHandlers.listPlans);

  app.get("/api/plans", planHandlers.list);
  app.post("/api/plans", planHandlers.create);
  app.patch("/api/plans/:id", planHandlers.update);
  app.delete("/api/plans/:id", planHandlers.remove);
  app.get("/api/plans/:id/assignments", planHandlers.listAssignments);
  app.post("/api/plans/:id/assignments", planHandlers.setAssignments);
  app.get("/api/plans/:id/teams", planHandlers.listTeams);
  app.post("/api/plans/:id/teams", planHandlers.setTeams);

  app.get("/api/activities", activityHandlers.list);

  app.get("/api/users", userHandlers.listActive);
  app.get("/api/admin/users", userHandlers.listAdmin);
  app.post("/api/users", userHandlers.create);
  app.patch("/api/users/:id", userHandlers.update);
  app.delete("/api/users/:id", userHandlers.remove);

  app.get("/api/goals", goalHandlers.list);
  app.post("/api/goals", goalHandlers.create);

  app.get("/api/tasks", taskHandlers.list);
  app.post("/api/tasks", taskHandlers.create);
  app.patch("/api/tasks/:id", taskHandlers.update);
  app.delete("/api/tasks/:id", taskHandlers.remove);

  app.get("/api/clients", clientHandlers.list);
  app.get("/api/clients/:id", clientHandlers.getById);
  app.post("/api/clients", clientHandlers.create);
  app.patch("/api/clients/:id", clientHandlers.update);
  app.delete("/api/clients/:id", clientHandlers.remove);
  app.get("/api/clients/:id/invoices", clientHandlers.listInvoices);
  app.get("/api/clients/:id/invoices/history", clientHandlers.listInvoiceHistory);
  app.post("/api/clients/:id/invoices", clientHandlers.createInvoice);
  app.patch("/api/clients/:clientId/invoices/:invoiceId", clientHandlers.updateInvoice);

  app.get("/api/linkedin-profiles", linkedinHandlers.list);
  app.post("/api/linkedin-profiles", linkedinHandlers.create);
  app.patch("/api/linkedin-profiles/:id", linkedinHandlers.update);
  app.delete("/api/linkedin-profiles/:id", linkedinHandlers.delete);

  app.get("/api/email-accounts", emailHandlers.list);
  app.post("/api/email-accounts", emailHandlers.create);
  app.patch("/api/email-accounts/:id", emailHandlers.update);
  app.delete("/api/email-accounts/:id", emailHandlers.delete);

  return httpServer;
}
