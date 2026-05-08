import type { Request, Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { activities, activityTimeline, type Activity, type Lead, type User } from "@shared/schema";
import { db } from "../database/db";
import { storage } from "../database/storage";
import type {
  ActivityTimelineBody,
  CreateLeadBody,
  IdParam,
  LeadFiltersQuery,
  LeadIdParam,
  UpdateLeadBody,
} from "../types/payloads";

export const leadHandlers = {
  list: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const filters: LeadFiltersQuery = { ...(req.query as LeadFiltersQuery) };
    if (currentUser.role === "ADMIN") {
      // Admin sees all leads
      const leads = await storage.getLeads(filters);
      return res.json(leads);
    }

    if (currentUser.role === "TEAM_LEAD") {
      // Team lead sees:
      // - own leads (always, regardless of team)
      // - leads assigned to teams they HEAD, owned by members of those teams
      // - NOT leads from teams they're just a member of (unless they own them)
      const allTeams = await storage.getTeams();
      const headedTeamIds = new Set<string>();
      allTeams.forEach((team) => {
        if (team.leadId === currentUser.id) {
          headedTeamIds.add(team.id);
        }
      });

      const leads = await storage.getLeads(filters);
      return res.json(
        leads.filter(
          (lead) =>
            lead.ownerId === currentUser.id ||
            lead.teamLeadId === currentUser.id ||
            (lead.teamId && headedTeamIds.has(lead.teamId)),
        ),
      );
    }

    {
      // AE/SDR: only own leads
      filters.ownerId = currentUser.id;
    }

    const leads = await storage.getLeads(filters);
    res.json(leads);
  },

  importPreflight: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const normalize = (v: unknown) => String(v ?? "").trim().toLowerCase();
    const isSameLeadIdentity = (candidate: Lead, incoming: CreateLeadBody) => {
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
    const currentUserTeamIds = await storage.getUserTeamIds(currentUser.id);
    const canUpdateLead = (lead: Lead) => {
      if (currentUser.role === "ADMIN") return true;
      if (lead.ownerId === currentUser.id || lead.teamLeadId === currentUser.id) return true;
      if (currentUser.role === "TEAM_LEAD" && lead.teamId) {
        return currentUserTeamIds.includes(lead.teamId) || lead.teamId === currentUser.teamId;
      }
      return false;
    };
    const conflictReason = (matched: Lead[], incoming: CreateLeadBody) => {
      const matchedNotFitLead = matched.find((lead) => isNotFitStage(lead.stage));
      if (matchedNotFitLead) {
        return {
          reason: "This lead was previously marked Not a Fit.",
          duplicateBy: "Not a Fit",
          lead: matchedNotFitLead,
        };
      }

      const recentMatch = matched.find((lead) => {
        const anchorRaw = lead.statusChangedAt ?? lead.createdAt;
        const anchor = anchorRaw ? new Date(anchorRaw) : null;
        if (!anchor || Number.isNaN(anchor.getTime())) return false;
        return isWithinTwoMonths(anchor);
      });
      if (!recentMatch) return null;

      const duplicateBy =
        incoming.email && recentMatch.email && normalize(incoming.email) === normalize(recentMatch.email)
          ? "Email"
          : incoming.linkedinUrl && recentMatch.linkedinUrl && normalize(incoming.linkedinUrl) === normalize(recentMatch.linkedinUrl)
            ? "LinkedIn URL"
            : "Name, Company, and Title";

      return {
        reason: `Similar lead already exists with a stage change in the last 2 months. Duplicate creation is blocked. Matched by ${duplicateBy}.`,
        duplicateBy,
        lead: recentMatch,
      };
    };

    const existingLeads = await storage.getLeads({ includeStale: "true" });
    const conflicts = rows
      .map((row: CreateLeadBody & { rowNumber?: number }) => {
        const matched = existingLeads.filter((lead) => isSameLeadIdentity(lead, row));
        const conflict = conflictReason(matched, row);
        if (!conflict) return null;
        return {
          rowNumber: Number(row.rowNumber) || null,
          reason: conflict.reason,
          duplicateBy: conflict.duplicateBy,
          ...(conflict.lead && canUpdateLead(conflict.lead)
            ? {
                existingLead: {
                  id: conflict.lead.id,
                  stage: conflict.lead.stage,
                  firstName: conflict.lead.firstName,
                  lastName: conflict.lead.lastName,
                  company: conflict.lead.company,
                  email: conflict.lead.email,
                  phone: conflict.lead.phone,
                  linkedinUrl: conflict.lead.linkedinUrl,
                  title: conflict.lead.title,
                  source: conflict.lead.source,
                  value: conflict.lead.value,
                  ownerId: conflict.lead.ownerId,
                  ownerName: conflict.lead.ownerName,
                  teamId: conflict.lead.teamId,
                },
              }
            : {}),
        };
      })
      .filter(Boolean);

    res.json({ conflicts });
  },

  getById: async (req: Request, res: Response) => {
    const params = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [lead] = await storage.getLeads({ id: params.id });
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    let canView = currentUser.role === "ADMIN" || lead.ownerId === currentUser.id || lead.teamLeadId === currentUser.id;
    if (!canView && currentUser.role === "TEAM_LEAD" && lead.teamId) {
      const team = await storage.getTeam(lead.teamId);
      canView = !!team && team.leadId === currentUser.id;
    }
    if (!canView) {
      return res.status(403).json({ message: "You do not have permission to view this lead." });
    }
    res.json(lead);
  },

  create: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const payload = req.body as CreateLeadBody;

    const normalize = (value: string | number | boolean | Date | null | undefined) =>
      String(value ?? "").trim().toLowerCase();
    const normalizeOptionalLower = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim().toLowerCase();
      return v.length > 0 ? v : null;
    };
    const normalizeRequiredText = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim();
      return v.length > 0 ? v : null;
    };
    const normalizeLeadValue = (value: string | number | boolean | Date | null | undefined) => {
      if (value == null || value === "") return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return null;
      return Math.round(numeric);
    };
    const normalizePhone = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim();
      return v.length > 0 ? v : null;
    };
    const normalizeContactOptions = (value: unknown): string[] => {
      const allowed = new Set(["email", "linkedin_connection", "cold_call"]);
      if (!Array.isArray(value)) return [];
      const normalized = value
        .map((entry) => String(entry ?? "").trim().toLowerCase())
        .filter((entry) => allowed.has(entry));
      return Array.from(new Set(normalized));
    };

    const isSameLeadIdentity = (candidate: Lead, incoming: CreateLeadBody) => {
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

    // Validate required fields before any DB access
    const normalizedFirstName = normalizeRequiredText(payload.firstName);
    if (!normalizedFirstName) {
      return res.status(400).json({ message: "First name is required." });
    }
    const normalizedLastName = normalizeRequiredText(payload.lastName);
    if (!normalizedLastName) {
      return res.status(400).json({ message: "Last name is required." });
    }
    const normalizedCompany = normalizeRequiredText(payload.company);
    if (!normalizedCompany) {
      return res.status(400).json({ message: "Company is required." });
    }
    const normalizedSource = normalizeRequiredText(payload.source);
    if (!normalizedSource) {
      return res.status(400).json({ message: "Lead source is required." });
    }
    const normalizedValue = normalizeLeadValue(payload.value);
    if (normalizedValue === null) {
      return res.status(400).json({ message: "Lead value is required and must be a valid non-negative number." });
    }
    const normalizedPhone = normalizePhone(payload.phone);
    const rawEmail = String(payload.email ?? "").trim();
    if (rawEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ message: "Invalid email format." });
    }

    // Duplication rule: check across the entire database (not team-specific).
    const existingLeads = await storage.getLeads({
      includeStale: "true",
    });
    const matched = existingLeads.filter((l) => isSameLeadIdentity(l, payload));
    const matchedNotFitLead = matched.find((l) => isNotFitStage(l.stage));

    if (matchedNotFitLead) {
      const markerUser = await storage.getUser(matchedNotFitLead.ownerId);
      const markerName = matchedNotFitLead.ownerName || markerUser?.name || "Unknown user";
      return res.status(409).json({
        message: `This lead was previously marked Not a Fit by ${markerName}.`,
      });
    }

    const hasRecentMatch = matched.some((l) => {
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
    const requestedOwnerId = String(payload.ownerId || "").trim();
    const requestedTeamId = String(payload.teamId || "").trim();

    const currentUserTeamIds = await storage.getUserTeamIds(currentUser.id);
    let ownerId = requestedOwnerId || currentUser.id;
    let teamId = requestedTeamId || (currentUserTeamIds.length === 1 ? currentUserTeamIds[0] : null) || currentUser.teamId;

    const requestedTeamLeadId = String(payload.teamLeadId || "").trim();

    if (currentUser.role === "ADMIN") {
      ownerId = requestedOwnerId || currentUser.id;
      teamId = requestedTeamId || (currentUserTeamIds.length === 1 ? currentUserTeamIds[0] : null) || currentUser.teamId;
    } else if (currentUser.role === "TEAM_LEAD") {
      const allTeams = await storage.getTeams();
      const managedTeamIds = allTeams
        .filter((team) => team.leadId === currentUser.id)
        .map((team) => team.id);
      currentUserTeamIds.forEach((tid) => {
        if (!managedTeamIds.includes(tid)) managedTeamIds.push(tid);
      });
      if (requestedTeamId && !managedTeamIds.includes(requestedTeamId)) {
        return res
          .status(403)
          .json({ message: "You can only assign leads to teams you manage or belong to." });
      }
      ownerId = requestedOwnerId || currentUser.id;
      if (!requestedTeamId && managedTeamIds.length > 1) {
        return res.status(400).json({ message: "You belong to multiple teams. Please select a team." });
      }
      teamId = requestedTeamId || managedTeamIds[0] || currentUser.teamId;
      if (!teamId) {
        return res
          .status(400)
          .json({ message: "No managed team is configured for your account. Contact admin." });
      }
    } else {
      // AE/SDR: owner is always themselves
      ownerId = currentUser.id;
      if (!requestedTeamId && currentUserTeamIds.length > 1) {
        return res.status(400).json({ message: "You belong to multiple teams. Please select a team." });
      }
      teamId = requestedTeamId || currentUserTeamIds[0] || currentUser.teamId;
    }

    // Validate owner: must be an active user in the team (any role)
    if (currentUser.role !== "AE" && currentUser.role !== "SDR" && ownerId && ownerId !== currentUser.id) {
      const selectedOwner = await storage.getUser(ownerId);
      if (!selectedOwner || selectedOwner.isActive === false) {
        return res.status(400).json({ message: "Selected owner does not exist or is inactive." });
      }
      const ownerTeamIds = await storage.getUserTeamIds(selectedOwner.id);
      if (teamId && !ownerTeamIds.includes(teamId) && selectedOwner.teamId !== teamId) {
        return res.status(400).json({ message: "Selected owner must belong to the selected team." });
      }
    }

    // Resolve teamLeadId: default to the team's configured lead
    const selectedTeamForLead = teamId ? await storage.getTeam(teamId) : undefined;
    let teamLeadId: string | null = requestedTeamLeadId || selectedTeamForLead?.leadId || null;

    // Validate teamLeadId: must be a TL in the team
    if (teamLeadId) {
      const selectedTL = await storage.getUser(teamLeadId);
      if (!selectedTL || selectedTL.role !== "TEAM_LEAD" || selectedTL.isActive === false) {
        return res.status(400).json({ message: "Selected team lead must be an active team lead." });
      }
      const tlTeamIds = await storage.getUserTeamIds(selectedTL.id);
      const isConfiguredLead = !!selectedTeamForLead && selectedTeamForLead.leadId === selectedTL.id;
      if (teamId && !tlTeamIds.includes(teamId) && !isConfiguredLead) {
        return res.status(400).json({ message: "Selected team lead must belong to the selected team." });
      }
    }

    // Validate planId belongs to the lead's team
    if (payload.planId && teamId) {
      const teamPlanIds = await storage.getTeamPlanIds(teamId);
      if (!teamPlanIds.includes(payload.planId)) {
        return res.status(400).json({ message: "Selected plan is not assigned to this team." });
      }
    }

    try {
      const { createdById: _ignored, ...safePayload } = payload as any;
      const lead = await storage.createLead({
        ...safePayload,
        ownerId,
        teamLeadId,
        teamId,
        createdById: currentUser.id,
        source: normalizedSource,
        value: normalizedValue,
        email: normalizeOptionalLower(payload.email),
        linkedinUrl: normalizeOptionalLower(payload.linkedinUrl),
        phone: normalizedPhone,
        contactOptions: normalizeContactOptions(payload.contactOptions),
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        company: normalizedCompany,
        title: String(payload.title ?? "").trim(),
      });
      res.json(lead);
    } catch (error) {
      const dbError = error as { code?: string; constraint?: string };
      if (dbError.code === "23505") {
        if (dbError.constraint === "leads_email_unique") {
          return res.status(409).json({ message: "A lead with this email already exists." });
        }
        if (dbError.constraint === "leads_linkedin_url_unique") {
          return res.status(409).json({ message: "A lead with this LinkedIn URL already exists." });
        }
        return res.status(409).json({ message: "A lead with the same unique identifiers already exists." });
      }
      throw error;
    }
  },

  update: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const body = req.body as UpdateLeadBody;
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [existing] = await storage.getLeads({ id });
    if (!existing) {
      return res.status(404).json({ message: "Lead not found" });
    }
    let canEdit = currentUser.role === "ADMIN" || existing.ownerId === currentUser.id || existing.teamLeadId === currentUser.id;
    if (!canEdit && currentUser.role === "TEAM_LEAD" && existing.teamId) {
      const team = await storage.getTeam(existing.teamId);
      canEdit = !!team && team.leadId === currentUser.id;
    }
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit this lead." });
    }

    const updates = body;
    const normalizeTimestamp = (value: string | number | boolean | Date | string[] | null | undefined) => {
      if (value == null || value === "") return value;
      if (Array.isArray(value)) return value;
      if (value instanceof Date) return value;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? value : parsed;
    };
    const normalizePhone = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim();
      return v.length > 0 ? v : null;
    };
    const normalizeOptionalLower = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim().toLowerCase();
      return v.length > 0 ? v : null;
    };
    const normalizeOptionalText = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim();
      return v.length > 0 ? v : null;
    };
    const normalizeContactOptions = (value: unknown): string[] => {
      const allowed = new Set(["email", "linkedin_connection", "cold_call"]);
      if (!Array.isArray(value)) return [];
      const normalized = value
        .map((entry) => String(entry ?? "").trim().toLowerCase())
        .filter((entry) => allowed.has(entry));
      return Array.from(new Set(normalized));
    };
    const normalizeLeadValue = (value: string | number | boolean | Date | null | undefined) => {
      if (value == null || value === "") return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return null;
      return Math.round(numeric);
    };
    const normalizedUpdates: Record<string, string | number | boolean | Date | string[] | null | undefined> = {
      ...updates,
    };
    if ("phone" in updates) {
      const normalizedPhone = normalizePhone(updates.phone);
      normalizedUpdates.phone = normalizedPhone;
    }
    if ("email" in updates) {
      const rawEmail = String(updates.email ?? "").trim();
      if (rawEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return res.status(400).json({ message: "Invalid email format." });
      }
      normalizedUpdates.email = normalizeOptionalLower(updates.email);
    }
    if ("linkedinUrl" in updates) {
      normalizedUpdates.linkedinUrl = normalizeOptionalLower(updates.linkedinUrl);
    }
    if ("firstName" in updates) {
      const v = String(updates.firstName ?? "").trim();
      if (!v) return res.status(400).json({ message: "First name cannot be empty." });
      normalizedUpdates.firstName = v;
    }
    if ("lastName" in updates) {
      const v = String(updates.lastName ?? "").trim();
      if (!v) return res.status(400).json({ message: "Last name cannot be empty." });
      normalizedUpdates.lastName = v;
    }
    if ("company" in updates) {
      const v = String(updates.company ?? "").trim();
      if (!v) return res.status(400).json({ message: "Company cannot be empty." });
      normalizedUpdates.company = v;
    }
    if ("contactOptions" in updates) {
      normalizedUpdates.contactOptions = normalizeContactOptions(updates.contactOptions);
    }
    if ("connectionStatus" in updates && updates.connectionStatus != null) {
      const VALID_CONNECTION_STATUSES = ["NONE", "SENT", "ACCEPTED"];
      const newStatus = String(updates.connectionStatus).toUpperCase();
      if (!VALID_CONNECTION_STATUSES.includes(newStatus)) {
        return res.status(400).json({ message: `Invalid connectionStatus. Must be one of: ${VALID_CONNECTION_STATUSES.join(", ")}` });
      }
      // Enforce transition rules: ACCEPTED requires current status to be SENT
      if (newStatus === "ACCEPTED" && existing.connectionStatus !== "SENT") {
        return res.status(400).json({ message: "Cannot mark connection as accepted: no pending connection request (status must be SENT first)." });
      }
    }
    if ("source" in updates) {
      const normalizedSource = normalizeOptionalText(updates.source);
      if (updates.source != null && !normalizedSource) {
        return res.status(400).json({ message: "Lead source cannot be empty." });
      }
      normalizedUpdates.source = normalizedSource;
    }
    if ("value" in updates) {
      const normalizedValue = normalizeLeadValue(updates.value);
      if (updates.value != null && normalizedValue === null) {
        return res
          .status(400)
          .json({ message: "Lead value must be a valid non-negative number." });
      }
      normalizedUpdates.value = normalizedValue;
    }
    const requestedOwnerId =
      typeof updates.ownerId === "string" && updates.ownerId.trim().length > 0
        ? updates.ownerId
        : undefined;
    const requestedTeamId =
      typeof updates.teamId === "string" && updates.teamId.trim().length > 0
        ? updates.teamId
        : updates.teamId === null
          ? null
          : undefined;

    if (requestedOwnerId) {
      const requestedOwner = await storage.getUser(requestedOwnerId);
      if (!requestedOwner || requestedOwner.isActive === false) {
        return res.status(400).json({ message: "Selected owner does not exist or is inactive." });
      }
      const effectiveTeamId = requestedTeamId === undefined ? existing.teamId : requestedTeamId;
      const reqOwnerTeamIds = await storage.getUserTeamIds(requestedOwner.id);
      if (currentUser.role === "ADMIN") {
        if (effectiveTeamId && !reqOwnerTeamIds.includes(effectiveTeamId) && requestedOwner.teamId !== effectiveTeamId) {
          return res.status(400).json({ message: "Selected owner must belong to the selected team." });
        }
      } else if (currentUser.role === "TEAM_LEAD") {
        const currentUserTeamIds = await storage.getUserTeamIds(currentUser.id);
        const sharesTeam = reqOwnerTeamIds.some((tid) => currentUserTeamIds.includes(tid));
        if (!sharesTeam) {
          return res.status(403).json({ message: "Team leads can only assign lead owners from their own team." });
        }
      } else if (requestedOwnerId !== existing.ownerId) {
        return res.status(403).json({ message: "You do not have permission to reassign lead owner." });
      }
    }

    // Validate teamLeadId update: must be an active TL in the team
    const requestedTeamLeadId =
      typeof updates.teamLeadId === "string" && updates.teamLeadId.trim().length > 0
        ? updates.teamLeadId
        : updates.teamLeadId === null
          ? null
          : undefined;

    if (requestedTeamLeadId !== undefined && requestedTeamLeadId !== null) {
      const newTL = await storage.getUser(requestedTeamLeadId);
      if (!newTL || newTL.role !== "TEAM_LEAD" || newTL.isActive === false) {
        return res.status(400).json({ message: "Selected team lead must be an active team lead." });
      }
      const effectiveTeamId = requestedTeamId === undefined ? existing.teamId : requestedTeamId;
      const newTLTeamIds = await storage.getUserTeamIds(newTL.id);
      const effectiveTeam = effectiveTeamId ? await storage.getTeam(effectiveTeamId) : undefined;
      const isConfiguredLead = !!effectiveTeam && effectiveTeam.leadId === newTL.id;
      if (effectiveTeamId && !newTLTeamIds.includes(effectiveTeamId) && !isConfiguredLead) {
        return res.status(400).json({ message: "Selected team lead must belong to the selected team." });
      }
      if (currentUser.role === "TEAM_LEAD") {
        const currentUserTeamIds = await storage.getUserTeamIds(currentUser.id);
        if (!newTLTeamIds.some((tid) => currentUserTeamIds.includes(tid))) {
          return res.status(403).json({ message: "Team leads can only assign team leads from their own team." });
        }
      }
    }

    if (requestedTeamId !== undefined) {
      if (currentUser.role === "ADMIN") {
        // Admin can freely reassign teams
      } else if (currentUser.role === "TEAM_LEAD") {
        const currentUserTeamIds = await storage.getUserTeamIds(currentUser.id);
        if (requestedTeamId && !currentUserTeamIds.includes(requestedTeamId)) {
          return res.status(403).json({ message: "Team leads can only assign leads to their own team." });
        }
      } else if (requestedTeamId !== existing.teamId) {
        return res.status(403).json({ message: "You do not have permission to reassign lead team." });
      }

      // When team changes, auto-cascade owner and teamLeadId to the new team
      // unless the caller explicitly provided new values in the same request.
      if (requestedTeamId && requestedTeamId !== existing.teamId) {
        const newTeam = await storage.getTeam(requestedTeamId);

        // Auto-set teamLeadId to new team's head (unless caller explicitly set it)
        if (requestedTeamLeadId === undefined) {
          normalizedUpdates.teamLeadId = newTeam?.leadId ?? null;
        }

        // Auto-reset ownerId if the existing owner doesn't belong to the new team
        if (requestedOwnerId === undefined && existing.ownerId) {
          const existingOwnerTeamIds = await storage.getUserTeamIds(existing.ownerId);
          const existingOwner = await storage.getUser(existing.ownerId);
          const ownerStillValid =
            existingOwnerTeamIds.includes(requestedTeamId) ||
            existingOwner?.teamId === requestedTeamId;
          if (!ownerStillValid) {
            // Fall back to new team's head, or null if no head configured
            normalizedUpdates.ownerId = newTeam?.leadId ?? null;
          }
        }
      }
    }

    // Sync ownerName whenever ownerId is being changed (explicit or auto-cascaded)
    const effectiveOwnerId = (normalizedUpdates.ownerId as string | null | undefined) ?? requestedOwnerId;
    if (effectiveOwnerId && effectiveOwnerId !== existing.ownerId) {
      const newOwner = await storage.getUser(effectiveOwnerId);
      normalizedUpdates.ownerName = newOwner?.name ?? null;
    }

    if ("planId" in updates) {
      if (
        currentUser.role !== "ADMIN" &&
        currentUser.role !== "TEAM_LEAD" &&
        updates.planId !== existing.planId
      ) {
        return res.status(403).json({ message: "Only admins and team leads can assign lead plans." });
      }
      // Validate plan belongs to the lead's team
      if (updates.planId) {
        const effectiveTeamId = requestedTeamId === undefined ? existing.teamId : requestedTeamId;
        if (effectiveTeamId) {
          const teamPlanIds = await storage.getTeamPlanIds(effectiveTeamId);
          if (!teamPlanIds.includes(updates.planId)) {
            return res.status(400).json({ message: "Selected plan is not assigned to this team." });
          }
        }
      }
    }
    const timestampFields = [
      "connectionSentAt",
      "connectionAcceptedAt",
      "initialContactCompletedDate",
      "emailLastSentDate",
      "messageLastSentDate",
      "statusChangedAt",
    ];
    for (const field of timestampFields) {
      if (field in normalizedUpdates) {
        normalizedUpdates[field] = normalizeTimestamp(normalizedUpdates[field]);
      }
    }
    if ("stage" in updates && updates.stage != null) {
      const VALID_STAGES = ["NEW", "CONTACTED", "MEETING_SET", "QUALIFIED", "MQL", "SQL", "WON", "LOST"];
      if (!VALID_STAGES.includes(String(updates.stage).toUpperCase())) {
        return res.status(400).json({ message: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` });
      }
      normalizedUpdates.stage = String(updates.stage).toUpperCase();
    }

    const stageChanging = typeof updates.stage === "string" && updates.stage !== existing.stage;

    let lead;
    try {
      lead = await storage.updateLead(id, normalizedUpdates);
    } catch (error) {
      const dbError = error as { code?: string; constraint?: string };
      if (dbError.code === "23505") {
        if (dbError.constraint === "leads_email_unique") {
          return res.status(409).json({ message: "A lead with this email already exists." });
        }
        if (dbError.constraint === "leads_linkedin_url_unique") {
          return res.status(409).json({ message: "A lead with this LinkedIn URL already exists." });
        }
        return res.status(409).json({ message: "A lead with the same unique identifiers already exists." });
      }
      throw error;
    }

    if (stageChanging) {
      const actorId = (req.user as User | undefined)?.id ?? existing.ownerId;
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
  },

  createActivityTimeline: async (req: Request, res: Response) => {
    const body = req.body as ActivityTimelineBody;
    const { activityType, ...rest } = body;
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    if (!activityType) {
      return res.status(400).json({ message: "activityType is required" });
    }
    if (!rest.body || typeof rest.body !== "string" || !rest.body.trim()) {
      return res.status(400).json({ message: "body is required for activity timeline entries" });
    }

    const VALID_ACTIVITY_TYPES = [
      "initial_message", "linkedin_message", "linkedin_connection_accepted", "email", "email_replied",
      "call", "meeting", "note", "status_change", "task_completed", "followup_scheduled",
    ];
    if (!VALID_ACTIVITY_TYPES.includes(activityType)) {
      return res.status(400).json({ message: `Invalid activityType. Must be one of: ${VALID_ACTIVITY_TYPES.join(", ")}` });
    }

    let resolvedTeamId = rest.teamId;
    if (rest.leadId) {
      // Prefer lead.teamId over client-provided teamId for consistency in team dashboards.
      const leadsForActivity = await storage.getLeads({ id: rest.leadId });
      const lead = leadsForActivity[0];
      if (!lead) {
        return res.status(404).json({ message: "Lead not found for activity logging." });
      }
      resolvedTeamId = lead.teamId ?? undefined;
    }
    if (!resolvedTeamId) {
      const fallbackTeamIds = currentUser ? await storage.getUserTeamIds(currentUser.id) : [];
      resolvedTeamId = fallbackTeamIds[0] ?? "unassigned";
    }
    const activityTeamId = resolvedTeamId ?? "unassigned";

    const createdByUserId =
      typeof rest.createdByUserId === "string" && rest.createdByUserId.trim().length > 0
        ? rest.createdByUserId
        : currentUser?.id ?? "";
    const happenedAtDate = new Date(
      typeof rest.happenedAt === "string" ? rest.happenedAt : Date.now(),
    );
    const activityDate = Number.isNaN(happenedAtDate.getTime())
      ? new Date().toISOString().slice(0, 10)
      : happenedAtDate.toISOString().slice(0, 10);

    const timelineHappenedAt =
      typeof rest.happenedAt === "string" ? new Date(rest.happenedAt) : sql`NOW() AT TIME ZONE 'UTC'`;

    const [timelineEntry] = await db
      .insert(activityTimeline)
      .values({
        leadId: typeof rest.leadId === "string" ? rest.leadId : "",
        teamId: activityTeamId,
        activityType,
        channel: typeof rest.channel === "string" ? rest.channel : null,
        subject: typeof rest.subject === "string" ? rest.subject : null,
        body: typeof rest.body === "string" ? rest.body : "",
        notes: typeof rest.notes === "string" ? rest.notes : null,
        happenedAt: timelineHappenedAt,
        createdByUserId,
      })
      .returning();

    // Keep lead contact options in sync with actual outreach activity so
    // corresponding status columns can appear in the leads table automatically.
    const resolveContactOptionFromActivity = (
      currentActivityType: string,
      currentChannel: string | null,
    ): "email" | "linkedin_connection" | "cold_call" | null => {
      if (currentActivityType === "email" || currentActivityType === "email_replied") return "email";
      if (currentActivityType === "call" || currentActivityType === "meeting") return "cold_call";
      if (currentActivityType === "linkedin_connection_accepted") return "linkedin_connection";
      if (currentActivityType === "linkedin_message") {
        const normalizedChannel = String(currentChannel || "").toLowerCase();
        if (normalizedChannel === "conn" || normalizedChannel === "dm" || normalizedChannel === "inmail") {
          return "linkedin_connection";
        }
      }
      return null;
    };
    const resolvedContactOption = resolveContactOptionFromActivity(
      activityType,
      typeof rest.channel === "string" ? rest.channel : null,
    );
    if (resolvedContactOption && typeof rest.leadId === "string" && rest.leadId.trim().length > 0) {
      const [leadForOptionSync] = await storage.getLeads({ id: rest.leadId });
      if (leadForOptionSync) {
        const nextOptions = Array.from(
          new Set([...(leadForOptionSync.contactOptions || []), resolvedContactOption]),
        );
        if (nextOptions.length !== (leadForOptionSync.contactOptions || []).length) {
          await storage.updateLead(leadForOptionSync.id, { contactOptions: nextOptions });
        }
      }
    }

    const channel = typeof rest.channel === "string" ? rest.channel.toLowerCase() : "";
    type MetricField =
      | "emailsSent"
      | "linkedinConnectionsSent"
      | "inMailsSent"
      | "coldCalls"
      | "personalizedEmailsSent"
      | "connectionAccepts";
    const metricByActivityType: Partial<Record<string, MetricField>> = {
      email: "emailsSent",
      call: "coldCalls",
      meeting: "coldCalls",
      linkedin_connection_accepted: "connectionAccepts",
    };
    const linkedinMetricByChannel: Record<string, MetricField> = {
      conn: "linkedinConnectionsSent",
      dm: "personalizedEmailsSent",
      inmail: "inMailsSent",
    };
    const resolveMetricField = (
      currentActivityType: string,
      currentChannel: string,
    ): MetricField | null => {
      if (currentActivityType === "linkedin_message") {
        // LinkedIn counters:
        // - conn => connection requests
        // - dm => direct messages
        // - inmail => InMails
        // Default unrecognized LinkedIn activity to connection request.
        return linkedinMetricByChannel[currentChannel] ?? "linkedinConnectionsSent";
      }
      return metricByActivityType[currentActivityType] ?? null;
    };
    const metricField = resolveMetricField(activityType, channel);

    if (metricField && createdByUserId) {
      const [existingDaily] = await db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.teamId, activityTeamId),
            eq(activities.userId, createdByUserId),
            eq(activities.activityDate, activityDate),
          ),
        );

      if (existingDaily) {
        const existingCount = Number((existingDaily as Activity)[metricField] || 0);
        await db
          .update(activities)
          .set({
            [metricField]: existingCount + 1,
          } as Record<string, number>)
          .where(eq(activities.id, existingDaily.id));
      } else {
        await db.insert(activities).values({
          teamId: activityTeamId,
          userId: createdByUserId,
          activityDate,
          emailsSent: metricField === "emailsSent" ? 1 : 0,
          linkedinConnectionsSent: metricField === "linkedinConnectionsSent" ? 1 : 0,
          inMailsSent: metricField === "inMailsSent" ? 1 : 0,
          coldCalls: metricField === "coldCalls" ? 1 : 0,
          personalizedEmailsSent: metricField === "personalizedEmailsSent" ? 1 : 0,
          connectionAccepts: metricField === "connectionAccepts" ? 1 : 0,
        });
      }
    }

    // Include a derived `type` field for the frontend which expects `type`
    res.json({ ...timelineEntry, type: timelineEntry.activityType });
  },

  remove: async (req: Request, res: Response) => {
    const { id } = req.params as IdParam;
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [existing] = await storage.getLeads({ id });
    if (!existing) {
      return res.status(404).json({ message: "Lead not found" });
    }
    let canDelete = currentUser.role === "ADMIN"
      || existing.ownerId === currentUser.id
      || existing.createdById === currentUser.id
      || existing.teamLeadId === currentUser.id;
    if (!canDelete && currentUser.role === "TEAM_LEAD" && existing.teamId) {
      const team = await storage.getTeam(existing.teamId);
      canDelete = !!team && team.leadId === currentUser.id;
    }
    if (!canDelete) {
      return res.status(403).json({ message: "You do not have permission to delete this lead." });
    }
    await storage.deleteLead(id);
    res.status(204).end();
  },

  // Batch endpoint: accepts { leadIds: string[] } in the request body and
  // returns all timeline events for those leads in a single DB query.
  // Used by the Analytics page to avoid N individual requests per lead.
  batchTimeline: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const { leadIds } = req.body as { leadIds?: unknown };
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.json([]);
    }
    const safeIds = leadIds.filter((id): id is string => typeof id === "string");
    if (safeIds.length === 0) return res.json([]);

    const timeline = await db
      .select()
      .from(activityTimeline)
      .where(inArray(activityTimeline.leadId, safeIds));

    const withType = timeline.map((entry) => ({
      ...entry,
      type: entry.activityType,
    }));

    res.json(withType);
  },

  listTimelineByLeadId: async (req: Request, res: Response) => {
    const currentUser = req.user as User | undefined;
    if (!currentUser?.id) return res.status(401).json({ message: "Unauthorized" });

    const params = req.params as LeadIdParam;
    const timeline = await db
      .select()
      .from(activityTimeline)
      .where(eq(activityTimeline.leadId, params.leadId));

    // Resolve creator names for *all* users (including deactivated/deleted),
    // so timeline rows always render an author. /api/users only returns active
    // users which is why historical entries lose their author label otherwise.
    const creatorIds = Array.from(
      new Set(timeline.map((entry) => entry.createdByUserId).filter((id): id is string => !!id)),
    );
    const creators = await Promise.all(creatorIds.map((id) => storage.getUser(id)));
    const creatorById = new Map<string, { name: string; isActive: boolean }>();
    creators.forEach((u) => {
      if (u) creatorById.set(u.id, { name: u.name, isActive: u.isActive ?? true });
    });

    const withType = timeline.map((entry) => {
      const creator = entry.createdByUserId ? creatorById.get(entry.createdByUserId) : undefined;
      return {
        ...entry,
        type: entry.activityType,
        creatorName: creator?.name ?? null,
        creatorIsActive: creator?.isActive ?? null,
      };
    });

    res.json(withType);
  },
};
