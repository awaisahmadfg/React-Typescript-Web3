import type { Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { activities, activityTimeline, type Activity, type Lead, type User } from "@shared/schema";
import { parsePhoneNumberFromString } from "libphonenumber-js";
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
    } else if (currentUser.role === "TEAM_LEAD") {
      filters.teamId = currentUser.teamId ?? undefined;
    } else {
      // AE/SDR: only own leads
      filters.ownerId = currentUser.id;
    }

    const leads = await storage.getLeads(filters);
    res.json(leads);
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
    const canView =
      currentUser.role === "ADMIN" ||
      (currentUser.role === "TEAM_LEAD" && lead.teamId === currentUser.teamId) ||
      lead.ownerId === currentUser.id;
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
    const normalizeOptional = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim();
      return v.length > 0 ? v : null;
    };
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
      if (!v) return null;
      const parsed = parsePhoneNumberFromString(v, "PK");
      if (!parsed || !parsed.isValid()) return null;
      return parsed.number;
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
    const normalizedPhone = normalizePhone(payload.phone);
    if (String(payload.phone ?? "").trim().length > 0 && !normalizedPhone) {
      return res
        .status(400)
        .json({ message: "Invalid phone number. Use a valid number with country code." });
    }
    const normalizedSource = normalizeRequiredText(payload.source);
    if (!normalizedSource) {
      return res.status(400).json({ message: "Lead source is required." });
    }
    const normalizedValue = normalizeLeadValue(payload.value);
    if (normalizedValue === null) {
      return res
        .status(400)
        .json({ message: "Lead value is required and must be a valid non-negative number." });
    }

    const requestedOwnerId = String(payload.ownerId || "").trim();
    const requestedTeamId = String(payload.teamId || "").trim();

    let ownerId = requestedOwnerId || currentUser.id;
    let teamId = requestedTeamId || currentUser.teamId;

    if (currentUser.role === "ADMIN") {
      // Admin can create for requested owner/team
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

    if ((currentUser.role === "ADMIN" || currentUser.role === "TEAM_LEAD") && ownerId) {
      const selectedOwner = await storage.getUser(ownerId);
      if (!selectedOwner || selectedOwner.role !== "TEAM_LEAD") {
        return res
          .status(400)
          .json({ message: "Lead owner must be a team lead for the selected team." });
      }
      const selectedTeam = teamId ? await storage.getTeam(teamId) : undefined;
      const isConfiguredTeamLead = !!selectedTeam && selectedTeam.leadId === selectedOwner.id;
      if (teamId && selectedOwner.teamId !== teamId && !isConfiguredTeamLead) {
        return res
          .status(400)
          .json({ message: "Selected owner must belong to the selected team." });
      }
    }

    try {
      const lead = await storage.createLead({
        ...payload,
        ownerId,
        teamId,
        source: normalizedSource,
        value: normalizedValue,
        email: normalizeOptionalLower(payload.email),
        linkedinUrl: normalizeOptionalLower(payload.linkedinUrl),
        phone: normalizedPhone,
        firstName: String(payload.firstName ?? "").trim(),
        lastName: String(payload.lastName ?? "").trim(),
        company: String(payload.company ?? "").trim(),
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
    const canEdit =
      currentUser.role === "ADMIN" ||
      (currentUser.role === "TEAM_LEAD" && existing.teamId === currentUser.teamId) ||
      existing.ownerId === currentUser.id;
    if (!canEdit) {
      return res.status(403).json({ message: "You do not have permission to edit this lead." });
    }

    const updates = body;
    const normalizeTimestamp = (value: string | number | boolean | Date | null | undefined) => {
      if (value == null || value === "") return value;
      if (value instanceof Date) return value;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? value : parsed;
    };
    const normalizePhone = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim();
      if (!v) return null;
      const parsed = parsePhoneNumberFromString(v, "PK");
      if (!parsed || !parsed.isValid()) return null;
      return parsed.number;
    };
    const normalizeOptionalLower = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim().toLowerCase();
      return v.length > 0 ? v : null;
    };
    const normalizeOptionalText = (value: string | number | boolean | Date | null | undefined) => {
      const v = String(value ?? "").trim();
      return v.length > 0 ? v : null;
    };
    const normalizeLeadValue = (value: string | number | boolean | Date | null | undefined) => {
      if (value == null || value === "") return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return null;
      return Math.round(numeric);
    };
    const normalizedUpdates: Record<string, string | number | boolean | Date | null | undefined> = {
      ...updates,
    };
    if ("phone" in updates) {
      const normalizedPhone = normalizePhone(updates.phone);
      if (String(updates.phone ?? "").trim().length > 0 && !normalizedPhone) {
        return res
          .status(400)
          .json({ message: "Invalid phone number. Use a valid number with country code." });
      }
      normalizedUpdates.phone = normalizedPhone;
    }
    if ("email" in updates) {
      normalizedUpdates.email = normalizeOptionalLower(updates.email);
    }
    if ("linkedinUrl" in updates) {
      normalizedUpdates.linkedinUrl = normalizeOptionalLower(updates.linkedinUrl);
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
      if (!requestedOwner) {
        return res.status(400).json({ message: "Selected owner does not exist." });
      }

      if (currentUser.role === "ADMIN") {
        const effectiveTeamId = requestedTeamId === undefined ? existing.teamId : requestedTeamId;
        const effectiveTeam = effectiveTeamId ? await storage.getTeam(effectiveTeamId) : undefined;
        const isConfiguredTeamLead = !!effectiveTeam && effectiveTeam.leadId === requestedOwner.id;
        if (requestedOwner.role !== "TEAM_LEAD") {
          return res
            .status(400)
            .json({ message: "Lead owner must be a team lead for the selected team." });
        }
        if (effectiveTeamId && requestedOwner.teamId !== effectiveTeamId && !isConfiguredTeamLead) {
          return res
            .status(400)
            .json({ message: "Selected owner must belong to the selected team." });
        }
      } else if (currentUser.role === "TEAM_LEAD") {
        const effectiveTeamId = requestedTeamId === undefined ? existing.teamId : requestedTeamId;
        const effectiveTeam = effectiveTeamId ? await storage.getTeam(effectiveTeamId) : undefined;
        const isConfiguredTeamLead = !!effectiveTeam && effectiveTeam.leadId === requestedOwner.id;
        if (requestedOwner.role !== "TEAM_LEAD") {
          return res
            .status(400)
            .json({ message: "Lead owner must be a team lead for the selected team." });
        }
        if (effectiveTeamId && requestedOwner.teamId !== effectiveTeamId && !isConfiguredTeamLead) {
          return res
            .status(400)
            .json({ message: "Selected owner must belong to the selected team." });
        }
        if (requestedOwner.teamId !== currentUser.teamId) {
          return res
            .status(403)
            .json({ message: "Team leads can only assign lead owners from their own team." });
        }
      } else if (requestedOwnerId !== existing.ownerId) {
        return res.status(403).json({ message: "You do not have permission to reassign lead owner." });
      }
    }

    if (requestedTeamId !== undefined) {
      if (currentUser.role === "ADMIN") {
        const ownerForTeamId = requestedOwnerId || existing.ownerId;
        const ownerForTeam = ownerForTeamId ? await storage.getUser(ownerForTeamId) : undefined;
        const requestedTeam = requestedTeamId ? await storage.getTeam(requestedTeamId) : undefined;
        const ownerIsConfiguredLead =
          !!requestedTeam && !!ownerForTeam && requestedTeam.leadId === ownerForTeam.id;
        if (
          requestedTeamId &&
          (!ownerForTeam ||
            ownerForTeam.role !== "TEAM_LEAD" ||
            (ownerForTeam.teamId !== requestedTeamId && !ownerIsConfiguredLead))
        ) {
          return res
            .status(400)
            .json({ message: "Selected owner must be a team lead in the selected team." });
        }
      } else if (currentUser.role === "TEAM_LEAD") {
        if (requestedTeamId !== currentUser.teamId) {
          return res
            .status(403)
            .json({ message: "Team leads can only assign leads to their own team." });
        }
        const ownerForTeamId = requestedOwnerId || existing.ownerId;
        const ownerForTeam = ownerForTeamId ? await storage.getUser(ownerForTeamId) : undefined;
        const requestedTeam = requestedTeamId ? await storage.getTeam(requestedTeamId) : undefined;
        const ownerIsConfiguredLead =
          !!requestedTeam && !!ownerForTeam && requestedTeam.leadId === ownerForTeam.id;
        if (
          requestedTeamId &&
          (!ownerForTeam ||
            ownerForTeam.role !== "TEAM_LEAD" ||
            (ownerForTeam.teamId !== requestedTeamId && !ownerIsConfiguredLead))
        ) {
          return res
            .status(400)
            .json({ message: "Selected owner must be a team lead in the selected team." });
        }
      } else if (requestedTeamId !== existing.teamId) {
        return res.status(403).json({ message: "You do not have permission to reassign lead team." });
      }
    }

    if ("planId" in updates) {
      if (
        currentUser.role !== "ADMIN" &&
        currentUser.role !== "TEAM_LEAD" &&
        updates.planId !== existing.planId
      ) {
        return res.status(403).json({ message: "Only admins and team leads can assign lead plans." });
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

    if (!activityType) {
      return res.status(400).json({ message: "activityType is required" });
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
      resolvedTeamId = currentUser?.teamId ?? "unassigned";
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
        // Default unrecognized LinkedIn activity to connection request
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

  listTimelineByLeadId: async (req: Request, res: Response) => {
    const params = req.params as LeadIdParam;
    const timeline = await db
      .select()
      .from(activityTimeline)
      .where(eq(activityTimeline.leadId, params.leadId));

    // Add `type` field to each entry for compatibility with the frontend
    const withType = timeline.map((entry) => ({
      ...entry,
      type: entry.activityType,
    }));

    res.json(withType);
  },
};
