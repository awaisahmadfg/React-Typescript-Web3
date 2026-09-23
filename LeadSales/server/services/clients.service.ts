import type { Request, Response } from "express";
import type { User } from "@shared/schema";
import { storage } from "../database/storage";

/** Check if a TEAM_LEAD heads a specific team (not just a member). */
async function tlHeadsTeam(userId: string, teamId: string): Promise<boolean> {
  const team = await storage.getTeam(teamId);
  return !!team && team.leadId === userId;
}
import type {
  ClientCreateBody,
  ClientInvoiceCreateBody,
  ClientInvoiceParams,
  ClientInvoiceUpdateBody,
  ClientUpdateBody,
  IdParam,
} from "../types/payloads";

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

export const clientHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const filters = req.query as { ownerId?: string; teamId?: string };
    if (currentUser.role === "ADMIN") {
      // Admin sees all
    } else if (currentUser.role === "TEAM_LEAD") {
      // TEAM_LEAD: sees clients from teams they HEAD, plus their own
      const allTeams = await storage.getTeams();
      const headedTeamIds = allTeams
        .filter((t) => t.leadId === currentUser.id)
        .map((t) => t.id);
      const all = await storage.getClients(filters);
      return res.json(all.filter((c) => headedTeamIds.includes(c.teamId) || c.ownerId === currentUser.id));
    } else {
      filters.ownerId = currentUser.id;
    }

    const all = await storage.getClients(filters);
    res.json(all);
  },

  getById: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    let canView = currentUser?.role === "ADMIN" || client.ownerId === currentUser?.id;
    if (!canView && currentUser?.role === "TEAM_LEAD" && currentUser?.id) {
      canView = await tlHeadsTeam(currentUser.id, client.teamId);
    }
    if (!canView) {
      return res.status(403).json({ message: "You do not have permission to view this client." });
    }

    res.json(client);
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (currentUser.role !== "ADMIN" && currentUser.role !== "TEAM_LEAD") {
      return res.status(403).json({ message: "Only admins and team leads can create client records." });
    }
    const body = req.body as ClientCreateBody;
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
    } = body;

    const currentUserTeamIds = await storage.getUserTeamIds(currentUser.id);

    if (
      !projectName ||
      !company ||
      ticketSize == null ||
      !paymentTerms ||
      !billingFrequency ||
      hourlyRate == null ||
      resourceCount == null ||
      !clientPOC ||
      !(ownerId || currentUser?.id)
    ) {
      return res.status(400).json({ message: "Missing required client fields" });
    }

    const resolvedOwnerId = currentUser?.role === "ADMIN" ? ownerId ?? currentUser.id : currentUser.id;
    let resolvedTeamId: string | null | undefined;
    if (currentUser?.role === "ADMIN") {
      resolvedTeamId = teamId ?? currentUserTeamIds[0] ?? currentUser.teamId;
    } else {
      if (!teamId && currentUserTeamIds.length > 1) {
        return res.status(400).json({ message: "You belong to multiple teams. Please select a team." });
      }
      resolvedTeamId = teamId ?? currentUserTeamIds[0] ?? currentUser.teamId;
    }

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
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const body = req.body as ClientUpdateBody;
    const currentUser = req.user as User | undefined;
    const existing = await storage.getClient(id);
    if (!existing) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canEdit =
      currentUser?.role === "ADMIN" ||
      existing.ownerId === currentUser?.id ||
      (currentUser?.role === "TEAM_LEAD" && currentUser?.id && await tlHeadsTeam(currentUser.id, existing.teamId));

    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit this client." });
    }
    const updated = await storage.updateClient(id, body);
    res.json(updated);
  },

  remove: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    if (currentUser?.role !== "ADMIN") {
      return res.status(403).json({ message: "Only admins can delete client entries." });
    }
    await storage.deleteClient(id);
    res.status(204).end();
  },

  listInvoices: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canView =
      currentUser?.role === "ADMIN" ||
      client.ownerId === currentUser?.id ||
      (currentUser?.role === "TEAM_LEAD" && currentUser?.id && await tlHeadsTeam(currentUser.id, client.teamId));
    if (!canView) {
      return res.status(403).json({ message: "You do not have permission to view invoice history." });
    }

    const entries = await storage.getClientInvoiceEntries(id);
    res.json(entries);
  },

  listInvoiceHistory: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canView =
      currentUser?.role === "ADMIN" ||
      client.ownerId === currentUser?.id ||
      (currentUser?.role === "TEAM_LEAD" && currentUser?.id && await tlHeadsTeam(currentUser.id, client.teamId));
    if (!canView) {
      return res
        .status(403)
        .json({ message: "You do not have permission to view invoice history logs." });
    }

    const history = await storage.getClientInvoiceEntryHistory(id);
    res.json(history);
  },

  createInvoice: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    const client = await storage.getClient(id);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canEdit =
      currentUser?.role === "ADMIN" ||
      client.ownerId === currentUser?.id ||
      (currentUser?.role === "TEAM_LEAD" && currentUser?.id && await tlHeadsTeam(currentUser.id, client.teamId));
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to add invoice entries." });
    }

    const body = req.body as ClientInvoiceCreateBody;
    const { invoiceDate, invoiceNumber, invoiceAmount = 0, receivedAmount = 0, notes } = body;

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
  },

  updateInvoice: async (req: Request, res: Response) => {
    const { clientId, invoiceId } = req.params as ClientInvoiceParams;
    const updates = req.body as ClientInvoiceUpdateBody;
    const currentUser = req.user as User | undefined;
    const client = await storage.getClient(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    const canEdit =
      currentUser?.role === "ADMIN" ||
      client.ownerId === currentUser?.id ||
      (currentUser?.role === "TEAM_LEAD" && currentUser?.id && await tlHeadsTeam(currentUser.id, client.teamId));
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit invoice entries." });
    }

    const beforeUpdate = await storage.getClientInvoiceEntry(invoiceId);
    if (!beforeUpdate || beforeUpdate.clientId !== clientId) {
      return res.status(404).json({ message: "Invoice entry not found for this client." });
    }

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
  },
};
