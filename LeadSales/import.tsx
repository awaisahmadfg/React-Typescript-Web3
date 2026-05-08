import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileUp, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { users } from "@/lib/mock-data";
import { useAuth } from "@/hooks/use-auth";
import { userBelongsToTeam } from "@/lib/team-utils";
import { Badge } from "@/components/ui/badge";
import Papa from "papaparse";
import { Role, LeadStage, Lead, type Team, type User, type Plan } from "@/lib/types";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const steps = [
  { id: 1, name: "Upload CSV" },
  { id: 2, name: "Map Columns" },
  { id: 3, name: "Review" },
  { id: 4, name: "Complete" }
];

const targetFields = [
  { key: "linkedinUrl", label: "LinkedIn URL" },
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "title", label: "Title" },
  { key: "source", label: "Source" },
  { key: "value", label: "Value" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status/Stage" },
] as const;

type ImportLeadPayload = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  company: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  stage: string;
  ownerId?: string;
  teamLeadId: string | null;
  teamId?: string;
  planId: string | null;
  title?: string;
  source: string;
  value: number;
  ownerName?: string;
};

type DuplicateImportRow = ImportLeadPayload & {
  id: string;
  name: string;
  currentStatus?: string | null;
  existingFirstName?: string | null;
  existingLastName?: string | null;
  existingCompany?: string | null;
  existingEmail?: string | null;
  existingPhone?: string | null;
  existingLinkedinUrl?: string | null;
  existingTitle?: string | null;
  existingSource?: string | null;
  existingValue?: number | null;
  newStatus: string;
  duplicateBy: "Email" | "LinkedIn URL" | "CSV Row";
  duplicateValue: string;
  duplicateSourceRow?: number;
  ownerName?: string | null;
  teamId?: string | null;
  existingTeamName?: string;
  finalFirstName: string;
  finalLastName: string;
};

type SkippedImportRow = {
  rowNumber: number;
  name: string;
  company?: string;
  reason: string;
  details?: string;
};

type ImportAnalysis = {
  newLeads: ImportLeadPayload[];
  duplicates: DuplicateImportRow[];
  skippedRows: SkippedImportRow[];
  missingFields: string[];
};

type ImportSummary = {
  imported: number;
  updated: number;
  duplicates: number;
  skipped: number;
  unchanged?: number;
};

type ImportPreflightConflict = {
  rowNumber: number | null;
  reason: string;
  duplicateBy?: "Email" | "LinkedIn URL" | "Name, Company, and Title" | "Not a Fit";
  existingLead?: {
    id: string;
    stage?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    title?: string | null;
    source?: string | null;
    value?: number | null;
    ownerId?: string | null;
    ownerName?: string | null;
    teamId?: string | null;
  };
};

const emptyImportAnalysis: ImportAnalysis = {
  newLeads: [],
  duplicates: [],
  skippedRows: [],
  missingFields: [],
};

const allowedImportStages = new Set([
  LeadStage.NEW,
  LeadStage.CONTACTED,
  LeadStage.QUALIFIED,
  LeadStage.MEETING_SET,
  LeadStage.WON,
  LeadStage.LOST,
  LeadStage.MQL,
  LeadStage.SQL,
]);

const normalizeImportStage = (value: unknown): string => {
  const normalized = String(value || "NEW")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "CLOSED_WON") return LeadStage.WON;
  if (normalized === "CLOSED_LOST") return LeadStage.LOST;
  return normalized;
};

export default function ImportPage() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  const [duplicates, setDuplicates] = useState<DuplicateImportRow[]>([]);
  const [isDupModalOpen, setIsDupModalOpen] = useState(false);
  const [selectedDups, setSelectedDups] = useState<string[]>([]);

  const [parsedData, setParsedData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    linkedinUrl: "",
    firstName: "",
    lastName: "",
    phone: "",
    company: "",
    title: "",
    source: "",
    value: "",
    email: "",
    status: "",
  });
  const [pendingNewLeads, setPendingNewLeads] = useState<ImportLeadPayload[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary>({
    imported: 0,
    updated: 0,
    duplicates: 0,
    skipped: 0,
    unchanged: 0,
  });

  // Batch defaults — applied to every imported row
  const canManageAssignments = user?.role === Role.ADMIN || user?.role === Role.TEAM_LEAD;
  const [importTeamId, setImportTeamId] = useState<string>(user?.teamIds?.[0] || user?.teamId || "");
  const [importOwnerId, setImportOwnerId] = useState<string>(user?.id || "");
  const [importTeamLeadId, setImportTeamLeadId] = useState<string>("");
  const [importPlanId, setImportPlanId] = useState<string>("");

  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    queryFn: () => fetch("/api/teams", { credentials: "include" }).then((r) => r.json()),
  });
  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!user?.id,
  });
  const { data: plansList = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });
  const { data: existingLeadsForReview = [], isFetching: isCheckingDuplicates } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    enabled: currentStep === 3,
  });
  const { data: teamPlansForImport = [] } = useQuery<Plan[]>({
    queryKey: [`/api/teams/${importTeamId}/plans`],
    enabled: !!importTeamId,
  });
  const visibleImportPlans = importTeamId ? teamPlansForImport : plansList;
  const currentUserDefaultTeamId = user?.teamIds?.[0] || user?.teamId || "";

  // Derive candidates based on selected team
  const ownerCandidates = usersList.filter((u) => {
    if (!u.isActive || u.role === Role.ADMIN) return false;
    if (!importTeamId) return true;
    return u.teamIds?.includes(importTeamId) || u.teamId === importTeamId;
  });
  const tlCandidates = usersList.filter((u) => {
    if (!u.isActive || u.role !== Role.TEAM_LEAD) return false;
    if (!importTeamId) return true;
    const team = teamsList.find((t) => t.id === importTeamId);
    return u.teamIds?.includes(importTeamId) || u.teamId === importTeamId || team?.leadId === u.id;
  });

  // Auto-set TL when team changes
  useEffect(() => {
    if (!importTeamId) return;
    const team = teamsList.find((t) => t.id === importTeamId);
    if (team?.leadId) setImportTeamLeadId(team.leadId);
    setImportOwnerId((prev) => {
      const stillValid = ownerCandidates.some((u) => u.id === prev);
      return stillValid ? prev : (user?.id || ownerCandidates[0]?.id || "");
    });
  }, [importTeamId, teamsList]);

  useEffect(() => {
    if (!user?.id) return;
    setImportOwnerId(user.id);
    setImportTeamId(currentUserDefaultTeamId);
    setImportTeamLeadId("");
    setImportPlanId("");
    setPendingNewLeads([]);
    setDuplicates([]);
    setSelectedDups([]);
    setImportErrors([]);
  }, [user?.id, user?.role, currentUserDefaultTeamId]);

  const getMappedFieldForHeader = (header: string) => {
    const found = Object.entries(columnMapping).find(([, mappedHeader]) => mappedHeader === header);
    return found?.[0] || "__ignore__";
  };

  const getAvailableTargetFieldsForHeader = (header: string) => {
    const currentSelectedField = getMappedFieldForHeader(header);
    const selectedByOtherHeaders = new Set(
      Object.entries(columnMapping)
        .filter(([, mappedHeader]) => mappedHeader && mappedHeader !== header)
        .map(([fieldKey]) => fieldKey),
    );

    return targetFields.filter(
      (field) =>
        field.key === currentSelectedField ||
        !selectedByOtherHeaders.has(field.key),
    );
  };

  const getUserName = (userId?: string | null) =>
    userId === user?.id
      ? user?.name || "Current user"
      :
    usersList.find((u) => u.id === userId)?.name ||
    users.find((u) => u.id === userId)?.name ||
    "Unknown";
  const getTeamName = (teamId?: string | null) =>
    teamsList.find((team) => team.id === teamId)?.name ||
    (teamId ? teamId : "Unassigned");

  const showImportSummaryToast = (summary: ImportSummary) => {
    const parts = [
      `${summary.imported} imported`,
      `${summary.updated} updated`,
      ...(summary.unchanged ? [`${summary.unchanged} already up to date`] : []),
      `${summary.skipped} skipped`,
    ];
    toast({
      title: summary.imported > 0 || summary.updated > 0 ? "Import processed" : "No rows imported",
      description: parts.join(", "),
    });
  };
  const normalizeComparable = (value: string | number | null | undefined) =>
    String(value ?? "").trim().toLowerCase();
  const duplicateKey = (dup: Pick<DuplicateImportRow, "id" | "rowNumber">) => `${dup.id}:${dup.rowNumber}`;
  const duplicateHasChanges = (dup: DuplicateImportRow) => {
    const comparisons = [
      [dup.existingFirstName, dup.finalFirstName || dup.firstName],
      [dup.existingLastName, dup.finalLastName || dup.lastName],
      [dup.existingCompany, dup.company],
      [dup.existingEmail, dup.email],
      [dup.existingPhone, dup.phone],
      [dup.existingLinkedinUrl, dup.linkedinUrl],
      [dup.existingTitle, dup.title],
      [dup.existingSource, dup.source],
      [dup.existingValue, dup.value],
      [dup.currentStatus, dup.newStatus],
    ] as Array<[string | number | null | undefined, string | number | null | undefined]>;

    return comparisons.some(([existing, incoming]) => normalizeComparable(existing) !== normalizeComparable(incoming));
  };

  const buildLeadPayloadFromRow = (row: any, index: number): ImportLeadPayload & { name: string; missing: string[] } => {
    const mapped = (key: keyof typeof columnMapping) =>
      columnMapping[key] ? row[columnMapping[key]] : undefined;
    const firstName = String(mapped("firstName") || row.first_name || "").trim();
    const lastName = String(mapped("lastName") || row.last_name || "").trim();
    const fullName = String(row.fullName || `${firstName} ${lastName}`.trim()).trim();
    const [parsedFirstName = firstName, ...lastNameParts] = fullName.split(" ");
    const finalFirstName = String(parsedFirstName || firstName).trim();
    const finalLastName = String(lastName || lastNameParts.join(" ")).trim();
    const email = String(mapped("email") || row.Email || row.email || "").trim();
    const phone = String(mapped("phone") || row.phone || row.Phone || row.phone_number || "").trim();
    const company = String(mapped("company") || row.CompanyName || row.company_name || row.company || "Unknown").trim();
    const linkedinUrl = String(mapped("linkedinUrl") || row.linkedinUrl || row.linkedin_url || "").trim();
    const source = String(mapped("source") || row.source || row.Source || row.lead_source || "CSV Import").trim();
    const rawValue = mapped("value") || row.value || row.Value || row.deal_value || 0;
    const value = Number(rawValue);
    const rawStatus =
      mapped("status") ||
        row.Status ||
        row.status ||
        row.Stage ||
        row.stage ||
        row.STAGE ||
        "NEW";
    const status = normalizeImportStage(rawStatus);
    const title = String(mapped("title") || row.job_title || row.title || "").trim();
    const missing: string[] = [];

    if (!fullName) missing.push("Name");
    if (!email) missing.push("Email");
    if (!linkedinUrl) missing.push("LinkedIn URL");

    return {
      rowNumber: index + 2,
      name: fullName,
      firstName: finalFirstName,
      lastName: finalLastName,
      company,
      email: email || undefined,
      phone: phone || undefined,
      linkedinUrl: linkedinUrl || undefined,
      stage: status || LeadStage.NEW,
      ownerId: importOwnerId || user?.id,
      teamLeadId: importTeamLeadId || null,
      teamId: importTeamId || user?.teamIds?.[0] || user?.teamId,
      planId: importPlanId || null,
      title: title || undefined,
      source,
      value: Number.isFinite(value) && value >= 0 ? Math.round(value) : 0,
      ownerName: usersList.find((u) => u.id === importOwnerId)?.name || user?.name,
      missing,
    };
  };

  const analyzeImportRows = (rows: any[], existingLeads: Lead[]): ImportAnalysis => {
    if (!rows.length) return emptyImportAnalysis;

    const newLeads: ImportLeadPayload[] = [];
    const duplicatesFound: DuplicateImportRow[] = [];
    const skippedRows: SkippedImportRow[] = [];
    const missingFields = new Set<string>();
    const seenEmailRows = new Map<string, number>();
    const seenLinkedinRows = new Map<string, number>();

    rows.forEach((row, index) => {
      const payload = buildLeadPayloadFromRow(row, index);
      const displayName = payload.name || `${payload.firstName} ${payload.lastName}`.trim() || "Unnamed row";

      if (payload.missing.length > 0) {
        payload.missing.forEach((field) => missingFields.add(field));
        skippedRows.push({
          rowNumber: payload.rowNumber,
          name: displayName,
          company: payload.company,
          reason: "Missing required fields",
          details: payload.missing.join(", "),
        });
        return;
      }

      if (!allowedImportStages.has(payload.stage as LeadStage)) {
        skippedRows.push({
          rowNumber: payload.rowNumber,
          name: displayName,
          company: payload.company,
          reason: "Invalid stage",
          details: `Use one of: ${Array.from(allowedImportStages).join(", ")}`,
        });
        return;
      }

      const normalizedEmail = payload.email?.toLowerCase();
      const normalizedLinkedin = payload.linkedinUrl?.toLowerCase();
      const csvEmailSourceRow = normalizedEmail ? seenEmailRows.get(normalizedEmail) : undefined;
      const csvLinkedinSourceRow = normalizedLinkedin ? seenLinkedinRows.get(normalizedLinkedin) : undefined;
      const duplicate = existingLeads.find((lead) => {
        const leadEmail = lead.email?.toLowerCase();
        const leadLinkedinUrl = lead.linkedinUrl?.toLowerCase();
        return (
          (normalizedEmail && leadEmail === normalizedEmail) ||
          (normalizedLinkedin && leadLinkedinUrl === normalizedLinkedin)
        );
      });

      if (normalizedEmail && csvEmailSourceRow === undefined) seenEmailRows.set(normalizedEmail, payload.rowNumber);
      if (normalizedLinkedin && csvLinkedinSourceRow === undefined) seenLinkedinRows.set(normalizedLinkedin, payload.rowNumber);

      if (csvEmailSourceRow || csvLinkedinSourceRow) {
        skippedRows.push({
          rowNumber: payload.rowNumber,
          name: displayName,
          company: payload.company,
          reason: "Duplicate inside CSV",
          details: csvEmailSourceRow
            ? `Email matches row ${csvEmailSourceRow}: ${payload.email}`
            : `LinkedIn URL matches row ${csvLinkedinSourceRow}: ${payload.linkedinUrl}`,
        });
        return;
      }

      if (duplicate) {
        const duplicateBy =
          normalizedEmail && duplicate.email?.toLowerCase() === normalizedEmail
            ? "Email"
            : "LinkedIn URL";
        const canUpdateDuplicate =
          user?.role === Role.ADMIN ||
          (user?.role === Role.TEAM_LEAD && userBelongsToTeam(user, duplicate.teamId)) ||
          duplicate.ownerId === user?.id;

        if (!canUpdateDuplicate) {
          skippedRows.push({
            rowNumber: payload.rowNumber,
            name: displayName,
            company: payload.company,
            reason: "Duplicate exists",
            details: `${duplicateBy} already belongs to an existing lead outside your update access.`,
          });
          return;
        }

        duplicatesFound.push({
          ...payload,
          id: duplicate.id,
          name: displayName,
          currentStatus: duplicate.stage,
          existingFirstName: duplicate.firstName,
          existingLastName: duplicate.lastName,
          existingCompany: duplicate.company,
          existingEmail: duplicate.email,
          existingPhone: duplicate.phone,
          existingLinkedinUrl: duplicate.linkedinUrl,
          existingTitle: duplicate.title,
          existingSource: duplicate.source,
          existingValue: duplicate.value,
          newStatus: payload.stage,
          duplicateBy,
          duplicateValue: duplicateBy === "Email" ? payload.email || "" : payload.linkedinUrl || "",
          ownerId: duplicate.ownerId,
          ownerName: duplicate.ownerName || getUserName(duplicate.ownerId),
          teamId: duplicate.teamId,
          existingTeamName: getTeamName(duplicate.teamId),
          finalFirstName: payload.firstName,
          finalLastName: payload.lastName,
        });
        return;
      }

      newLeads.push(payload);
    });

    return {
      newLeads,
      duplicates: duplicatesFound,
      skippedRows,
      missingFields: Array.from(missingFields),
    };
  };

  const localImportAnalysis = useMemo(
    () => (currentStep === 3 ? analyzeImportRows(parsedData, existingLeadsForReview) : emptyImportAnalysis),
    [
      currentStep,
      parsedData,
      existingLeadsForReview,
      columnMapping,
      importOwnerId,
      importTeamLeadId,
      importTeamId,
      importPlanId,
      usersList,
      teamsList,
      user,
    ],
  );
  const preflightRows = localImportAnalysis.newLeads;
  const fetchImportPreflightConflicts = async (rows: ImportLeadPayload[]): Promise<ImportPreflightConflict[]> => {
    if (rows.length === 0) return [];
    try {
      const res = await fetch("/api/leads/import-preflight", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json?.conflicts) ? json.conflicts : [];
    } catch {
      return [];
    }
  };

  const mergePreflightConflicts = (
    analysis: ImportAnalysis,
    conflicts: ImportPreflightConflict[],
  ): ImportAnalysis => {
    if (conflicts.length === 0) return analysis;

    const conflictsByRow = new Map(
      conflicts
        .filter((conflict) => typeof conflict.rowNumber === "number" && !conflict.existingLead)
        .map((conflict) => [Number(conflict.rowNumber), conflict.reason]),
    );
    const accessibleDuplicatesByRow = new Map(
      conflicts
        .filter((conflict) => typeof conflict.rowNumber === "number" && conflict.existingLead)
        .map((conflict) => [Number(conflict.rowNumber), conflict]),
    );
    const alreadySkippedRows = new Set(analysis.skippedRows.map((row) => row.rowNumber));
    const alreadyDuplicateRows = new Set(analysis.duplicates.map((row) => row.rowNumber));
    const preflightDuplicates: DuplicateImportRow[] = analysis.newLeads
      .filter((lead) => accessibleDuplicatesByRow.has(lead.rowNumber) && !alreadyDuplicateRows.has(lead.rowNumber))
      .map((lead) => {
        const conflict = accessibleDuplicatesByRow.get(lead.rowNumber)!;
        const existingLead = conflict.existingLead!;
        const duplicateBy =
          conflict.duplicateBy === "LinkedIn URL" || conflict.duplicateBy === "Email"
            ? conflict.duplicateBy
            : "Email";

        return {
          ...lead,
          id: existingLead.id,
          name: `${lead.firstName} ${lead.lastName}`.trim() || "Unnamed row",
          currentStatus: existingLead.stage,
          existingFirstName: existingLead.firstName,
          existingLastName: existingLead.lastName,
          existingCompany: existingLead.company,
          existingEmail: existingLead.email,
          existingPhone: existingLead.phone,
          existingLinkedinUrl: existingLead.linkedinUrl,
          existingTitle: existingLead.title,
          existingSource: existingLead.source,
          existingValue: existingLead.value,
          newStatus: lead.stage,
          duplicateBy,
          duplicateValue: duplicateBy === "Email" ? lead.email || "" : lead.linkedinUrl || "",
          ownerId: existingLead.ownerId || undefined,
          ownerName: existingLead.ownerName || getUserName(existingLead.ownerId),
          teamId: existingLead.teamId || undefined,
          existingTeamName: getTeamName(existingLead.teamId),
          finalFirstName: lead.firstName,
          finalLastName: lead.lastName,
        };
      });
    const serverSkippedRows = analysis.newLeads
      .filter((lead) => conflictsByRow.has(lead.rowNumber) && !alreadySkippedRows.has(lead.rowNumber))
      .map((lead) => ({
        rowNumber: lead.rowNumber,
        name: `${lead.firstName} ${lead.lastName}`.trim() || "Unnamed row",
        company: lead.company,
        reason: "Duplicate creation blocked",
        details: conflictsByRow.get(lead.rowNumber),
      }));

    return {
      ...analysis,
      newLeads: analysis.newLeads.filter(
        (lead) => !conflictsByRow.has(lead.rowNumber) && !accessibleDuplicatesByRow.has(lead.rowNumber),
      ),
      duplicates: [...analysis.duplicates, ...preflightDuplicates],
      skippedRows: [...analysis.skippedRows, ...serverSkippedRows],
    };
  };

  const { data: preflightConflicts = [], isFetching: isCheckingServerRules } = useQuery<ImportPreflightConflict[]>({
    queryKey: [
      "/api/leads/import-preflight",
      preflightRows.map((lead) => ({
        rowNumber: lead.rowNumber,
        email: lead.email || "",
        linkedinUrl: lead.linkedinUrl || "",
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        title: lead.title || "",
      })),
    ],
    enabled: currentStep === 3 && preflightRows.length > 0,
    queryFn: () => fetchImportPreflightConflicts(preflightRows),
  });
  const importAnalysis = useMemo(() => {
    return mergePreflightConflicts(localImportAnalysis, preflightConflicts);
  }, [localImportAnalysis, preflightConflicts]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);

      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
          setParsedData(results.data);
          const headers = Array.isArray(results.meta?.fields) ? results.meta.fields : [];
          setCsvHeaders(headers);
          const pickFirst = (candidates: string[]) =>
            candidates.find((c) => headers.includes(c)) || "";
          setColumnMapping({
            linkedinUrl: pickFirst(["linkedinUrl", "linkedin_url", "LinkedIn URL", "Linkedin URL", "LinkedinUrl"]),
            firstName: pickFirst(["firstName", "first_name", "First Name", "firstname"]),
            lastName: pickFirst(["lastName", "last_name", "Last Name", "lastname"]),
            phone: pickFirst(["phone", "Phone", "phone_number", "Phone Number"]),
            company: pickFirst(["company_name", "CompanyName", "company", "Company"]),
            title: pickFirst(["job_title", "title", "Title"]),
            source: pickFirst(["source", "Source", "lead_source", "Lead Source"]),
            value: pickFirst(["value", "Value", "deal_value", "Deal Value"]),
            email: pickFirst(["email", "Email", "email_address"]),
            status: pickFirst(["Status", "status", "Stage", "stage", "STAGE"]),
          });
          toast({
            title: "File parsed",
            description: `Found ${results.data.length} rows in the CSV.`,
          });
        },
        error: (error: any) => {
          toast({
            title: "Parsing error",
            description: error.message,
            variant: "destructive",
          });
        }
      });
    }
  };

  const handleNext = async () => {
    if (currentStep === 1 && !file) return;
    
    if (currentStep === 3) {
      setIsLoading(true);
      
      try {
        const analysis = mergePreflightConflicts(
          importAnalysis,
          await fetchImportPreflightConflicts(importAnalysis.newLeads),
        );

        if (analysis.duplicates.length > 0) {
          setDuplicates(analysis.duplicates);
          setSelectedDups(analysis.duplicates.map(duplicateKey));
          setPendingNewLeads(analysis.newLeads);
          setIsDupModalOpen(true);
        } else {
          const result = await performImport(analysis.newLeads);
          const summary = {
            imported: result.successCount,
            updated: 0,
            duplicates: analysis.duplicates.length,
            unchanged: 0,
            skipped: analysis.skippedRows.length + result.skippedCount,
          };
          setImportSummary(summary);
          if (result.successCount > 0 || analysis.newLeads.length === 0 || result.skippedCount > 0) {
            setCurrentStep(4);
            showImportSummaryToast(summary);
          }
        }
      } catch (error) {
        const summary = {
          imported: 0,
          updated: 0,
          duplicates: importAnalysis.duplicates.length,
          unchanged: 0,
          skipped: parsedData.length,
        };
        setImportSummary(summary);
        setImportErrors(["Import could not be completed. Please review the CSV and try again."]);
        setCurrentStep(4);
        showImportSummaryToast(summary);
      } finally {
        setIsLoading(false);
      }
    } else if (currentStep < 4) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const performImport = async (newLeads: ImportLeadPayload[]) => {
    let successCount = 0;
    const notFitAlerts: string[] = [];
    const failedRows: string[] = [];
    if (newLeads.length === 0) {
      setImportErrors([]);
      return { successCount: 0, skippedCount: 0, failedRows };
    }
    for (const lead of newLeads) {
      try {
        const { rowNumber, ...leadPayload } = lead;
        const res = await fetch("/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(leadPayload)
        });
        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json().catch(() => ({}));
          const message = String(data?.message || "");
          const leadLabel = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.linkedinUrl || "Unknown lead";
          failedRows.push(`Row ${lead.rowNumber} - ${leadLabel}: ${message || "Creation rejected by server"}`);
          if (message.toLowerCase().includes("not a fit")) {
            notFitAlerts.push(message);
          }
        }
      } catch (e) {
        console.error("Failed to import lead", lead, e);
        const leadLabel = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.linkedinUrl || "Unknown lead";
        failedRows.push(`Row ${lead.rowNumber} - ${leadLabel}: Network/server error`);
      }
    }
    const skippedCount = newLeads.length - successCount;
    setImportErrors(failedRows);
    if (successCount > 0) {
      await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    }

    if (notFitAlerts.length > 0) {
      toast({
        title: "Not a Fit Alerts",
        description: `${notFitAlerts[0]}${notFitAlerts.length > 1 ? ` (+${notFitAlerts.length - 1} more)` : ""}`,
      });
    }
    return { successCount, skippedCount, failedRows };
  };

  const handleApplyDupUpdates = async () => {
    setIsLoading(true);
    try {
      let updateCount = 0;
      let unchangedCount = 0;
      for (const dupId of selectedDups) {
        const dup = duplicates.find(d => duplicateKey(d) === dupId);
        if (dup) {
          if (!duplicateHasChanges(dup)) {
            unchangedCount++;
            continue;
          }
          const res = await fetch(`/api/leads/${dupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              stage: dup.newStatus,
              firstName: dup.finalFirstName || dup.firstName,
              lastName: dup.finalLastName || dup.lastName,
              company: dup.company,
              email: dup.email,
              phone: dup.phone,
              linkedinUrl: dup.linkedinUrl,
              title: dup.title,
              source: dup.source,
              value: dup.value,
              ownerName: user?.name // Track uploader name on update
            })
          });
          if (res.ok) updateCount++;
        }
      }
      if (updateCount > 0) {
        await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      }
      
      const result = await performImport(pendingNewLeads);
      setIsDupModalOpen(false);
      setPendingNewLeads([]);
      const summary = {
        imported: result.successCount,
        updated: updateCount,
        duplicates: duplicates.length,
        unchanged: unchangedCount,
        skipped: importAnalysis.skippedRows.length + (duplicates.length - selectedDups.length) + result.skippedCount,
      };
      setImportSummary(summary);
      if (result.successCount > 0) {
        setCurrentStep(4);
        showImportSummaryToast(summary);
      } else {
        setCurrentStep(4);
        showImportSummaryToast(summary);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply updates.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import Data</h1>
        <p className="text-muted-foreground mt-1">Bulk upload leads and activity via CSV</p>
      </div>

      {/* Steps */}
      <div className="relative flex justify-between">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-secondary -z-10" />
        {steps.map((step) => (
          <div key={step.id} className="flex flex-col items-center gap-2 bg-background px-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
              currentStep >= step.id 
                ? "bg-primary border-primary text-primary-foreground" 
                : "bg-background border-muted-foreground/30 text-muted-foreground"
            }`}>
              {currentStep > step.id ? <CheckCircle2 className="w-5 h-5" /> : step.id}
            </div>
            <span className={`text-xs font-medium ${currentStep >= step.id ? "text-foreground" : "text-muted-foreground"}`}>
              {step.name}
            </span>
          </div>
        ))}
      </div>

      <Card className="min-h-[400px] flex flex-col justify-center">
        {currentStep === 1 && (
          <CardContent className="pt-6 space-y-6">
            {/* File upload */}
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Upload className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Upload your CSV file</h3>
                <p className="text-sm text-muted-foreground">Supported format: .csv</p>
              </div>
              <div className="w-full max-w-sm">
                <Label htmlFor="file-upload" className="sr-only">Upload File</Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="cursor-pointer"
                />
              </div>
              {file && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                  <FileUp className="w-4 h-4" />
                  {file.name}
                </div>
              )}
              <div className="text-xs text-muted-foreground border p-3 rounded bg-muted/30 text-left w-full max-w-md">
                <p className="font-semibold mb-1">Required Columns:</p>
                <code className="bg-background px-1 py-0.5 rounded border">linkedinUrl</code>
                <span className="mx-1">,</span>
                <code className="bg-background px-1 py-0.5 rounded border">email</code>
                <span className="mx-1">and</span>
                <code className="bg-background px-1 py-0.5 rounded border">fullName</code>
              </div>
            </div>

            {/* Batch defaults — admin / TL only */}
            {canManageAssignments && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
                <div>
                  <p className="text-sm font-semibold">Batch Defaults</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Applied to every lead in this import</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Team */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Team</Label>
                    <Select
                      value={importTeamId || "__none__"}
                      onValueChange={(v) => setImportTeamId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No team</SelectItem>
                        {(user?.role === Role.ADMIN
                          ? teamsList
                          : teamsList.filter((t) => user?.teamIds?.includes(t.id) || t.id === user?.teamId || t.leadId === user?.id)
                        ).map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Owner */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Owner</Label>
                    <Select
                      value={importOwnerId || "__none__"}
                      onValueChange={(v) => setImportOwnerId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Default (uploader)</SelectItem>
                        {ownerCandidates.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} — {u.role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Team Lead */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Team Lead</Label>
                    <Select
                      value={importTeamLeadId || "__none__"}
                      onValueChange={(v) => setImportTeamLeadId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select team lead" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Default (team head)</SelectItem>
                        {tlCandidates.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Plan */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Plan</Label>
                    <Select
                      value={importPlanId || "__none__"}
                      onValueChange={(v) => setImportPlanId(v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="No plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No plan</SelectItem>
                        {visibleImportPlans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Plan-only for AE/SDR */}
            {!canManageAssignments && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <div>
                  <p className="text-sm font-semibold">Batch Defaults</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Applied to every lead in this import</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Plan (Optional)</Label>
                  <Select
                    value={importPlanId || "__none__"}
                    onValueChange={(v) => setImportPlanId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="No plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No plan</SelectItem>
                      {visibleImportPlans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardContent>
        )}

        {currentStep === 2 && (
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Map Columns</h3>
              <p className="text-sm text-muted-foreground">Each CSV header is shown as-is. Map it to a database field.</p>
            </div>
            
            <div className="grid gap-4">
              {csvHeaders.map((header) => (
                <div key={header} className="grid grid-cols-2 gap-4 items-center border-b pb-4 last:border-0">
                  <span className="text-sm font-medium">{header}</span>
                  <Select
                    value={getMappedFieldForHeader(header)}
                    onValueChange={(selectedField) => {
                      setColumnMapping((prev) => {
                        const next = { ...prev };
                        // Remove any previous mapping that points to this header
                        Object.keys(next).forEach((fieldKey) => {
                          if (next[fieldKey] === header) next[fieldKey] = "";
                        });
                        // Map selected target field -> current header
                        if (selectedField !== "__ignore__") {
                          next[selectedField] = header;
                        }
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ignore this column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ignore__">Ignore this column</SelectItem>
                      {getAvailableTargetFieldsForHeader(header).map((field) => (
                        <SelectItem key={field.key} value={field.key}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        )}

        {currentStep === 3 && (
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Review Import</h3>
              <p className="text-sm text-muted-foreground">Review new, duplicate, and skipped rows before finalizing.</p>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg space-y-3">
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">File Name:</span>
                  <span className="font-medium">{file?.name}</span>
               </div>
               <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Rows:</span>
                  <span className="font-medium">{parsedData.length}</span>
               </div>
               {importTeamId && (
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Team:</span>
                   <span className="font-medium">{getTeamName(importTeamId)}</span>
                 </div>
               )}
               {importOwnerId && (
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Owner:</span>
                   <span className="font-medium">{getUserName(importOwnerId)}</span>
                 </div>
               )}
               {importTeamLeadId && (
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Team Lead:</span>
                   <span className="font-medium">{getUserName(importTeamLeadId)}</span>
                 </div>
               )}
               {importPlanId && (
                 <div className="flex justify-between text-sm">
                   <span className="text-muted-foreground">Plan:</span>
                   <span className="font-medium">{plansList.find((p) => p.id === importPlanId)?.name || "None"}</span>
                 </div>
               )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-background p-3">
                <p className="text-xs text-muted-foreground">Total Rows</p>
                <p className="text-2xl font-bold">{parsedData.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                <p className="text-xs">New Leads</p>
                <p className="text-2xl font-bold">{importAnalysis.newLeads.length}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="text-xs">Duplicates</p>
                <p className="text-2xl font-bold">{importAnalysis.duplicates.length}</p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
                <p className="text-xs">Skipped Rows</p>
                <p className="text-2xl font-bold">{importAnalysis.skippedRows.length}</p>
              </div>
            </div>

            {isCheckingDuplicates && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Checking existing leads for Email and LinkedIn URL matches...
              </div>
            )}
            {isCheckingServerRules && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                Checking global duplicate rules before import...
              </div>
            )}

            {importAnalysis.duplicates.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/40">
                <div className="flex items-start gap-3 p-4 text-amber-900">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Duplicate rows found</p>
                    <p className="text-sm">These rows match existing leads and will need a skip/update decision.</p>
                  </div>
                </div>
                <div className="max-h-72 overflow-auto border-t border-amber-200 bg-background">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">CSV Row</th>
                        <th className="p-2 text-left">Lead</th>
                        <th className="p-2 text-left">Duplicate By</th>
                        <th className="p-2 text-left">Value</th>
                        <th className="p-2 text-left">Existing Owner</th>
                        <th className="p-2 text-left">Existing Team</th>
                        <th className="p-2 text-left">Current</th>
                        <th className="p-2 text-left">CSV Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importAnalysis.duplicates.map((dup) => (
                        <tr key={`${dup.id}-${dup.rowNumber}`} className="border-t">
                          <td className="p-2 font-medium">#{dup.rowNumber}</td>
                          <td className="p-2">
                            <div className="font-medium">{dup.name}</div>
                            <div className="text-xs text-muted-foreground">{dup.company}</div>
                          </td>
                          <td className="p-2">
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">{dup.duplicateBy}</Badge>
                          </td>
                          <td className="p-2 text-xs max-w-[220px] truncate" title={dup.duplicateValue}>{dup.duplicateValue}</td>
                          <td className="p-2 text-xs">{dup.ownerName || "Unknown"}</td>
                          <td className="p-2 text-xs">{dup.existingTeamName || "Unassigned"}</td>
                          <td className="p-2"><Badge variant="outline">{dup.currentStatus || "NEW"}</Badge></td>
                          <td className="p-2"><Badge className="bg-primary/20 text-primary border-primary/20">{dup.newStatus}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importAnalysis.skippedRows.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/40">
                <div className="flex items-start gap-3 p-4 text-rose-900">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Rows that will be skipped</p>
                    <p className="text-sm">Fix these lines in the CSV if they should be imported.</p>
                  </div>
                </div>
                <div className="max-h-56 overflow-auto border-t border-rose-200 bg-background">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-left">CSV Row</th>
                        <th className="p-2 text-left">Lead</th>
                        <th className="p-2 text-left">Reason</th>
                        <th className="p-2 text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importAnalysis.skippedRows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.reason}`} className="border-t">
                          <td className="p-2 font-medium">#{row.rowNumber}</td>
                          <td className="p-2">
                            <div className="font-medium">{row.name}</div>
                            <div className="text-xs text-muted-foreground">{row.company || "Unknown"}</div>
                          </td>
                          <td className="p-2"><Badge variant="outline">{row.reason}</Badge></td>
                          <td className="p-2 text-xs">{row.details}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importAnalysis.missingFields.length > 0 && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold">Some rows will be skipped:</p>
                  <p>Rows missing required fields ({importAnalysis.missingFields.join(", ")}) will be skipped.</p>
                </div>
              </div>
            )}
          </CardContent>
        )}

        {currentStep === 4 && (
          <CardContent className="pt-6 flex flex-col items-center justify-center text-center space-y-6 h-full">
            <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4 animate-in zoom-in duration-300">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold">Import Complete!</h3>
            <p className="text-muted-foreground max-w-md">
              Your CSV has been processed. Review the summary below, then open the leads table when ready.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full max-w-3xl text-left">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                <p className="text-xs">Imported</p>
                <p className="text-2xl font-bold">{importSummary.imported}</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
                <p className="text-xs">Updated</p>
                <p className="text-2xl font-bold">{importSummary.updated}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-900">
                <p className="text-xs">Up to Date</p>
                <p className="text-2xl font-bold">{importSummary.unchanged || 0}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="text-xs">Duplicates</p>
                <p className="text-2xl font-bold">{importSummary.duplicates}</p>
              </div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
                <p className="text-xs">Skipped</p>
                <p className="text-2xl font-bold">{importSummary.skipped}</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setCurrentStep(1)}>Import Another File</Button>
          </CardContent>
        )}

        {importErrors.length > 0 && currentStep >= 3 && (
          <CardContent className="pt-0">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm font-semibold mb-2">Skipped Rows</p>
              <ul className="max-h-40 overflow-y-auto text-xs space-y-1 list-disc ml-4">
                {importErrors.slice(0, 20).map((err, idx) => (
                  <li key={`${err}-${idx}`}>{err}</li>
                ))}
              </ul>
              {importErrors.length > 20 && (
                <p className="text-xs text-muted-foreground mt-2">+{importErrors.length - 20} more skipped rows</p>
              )}
            </div>
          </CardContent>
        )}

          <CardFooter className="flex justify-between border-t pt-6">
            <Button
              variant="ghost"
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
              disabled={currentStep === 1 || currentStep === 4}
            >
              Back
            </Button>
            {currentStep === 4 ? (
              <Button onClick={() => setLocation("/leads")}>View Leads</Button>
            ) : (
              <Button onClick={handleNext} disabled={isLoading || isCheckingDuplicates || isCheckingServerRules || (currentStep === 1 && !file)}>
                {isLoading ? "Processing..." : currentStep === 3 ? "Run Import" : "Next"}
              </Button>
            )}
          </CardFooter>
      </Card>

      <Dialog open={isDupModalOpen} onOpenChange={setIsDupModalOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Duplicates Found
            </DialogTitle>
            <DialogDescription>
              {duplicates.length} lead{duplicates.length !== 1 ? "s" : ""} already exist in the database.
              {duplicates.some((d) => d.currentStatus !== d.newStatus)
                ? " Some rows have a different stage in your CSV — apply updates to sync, or skip to leave existing records unchanged."
                : " Apply updates only if you want to overwrite fields from the CSV, or skip to import only new rows."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto border rounded-lg">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-2 text-left w-10">
                    <Checkbox 
                      checked={selectedDups.length === duplicates.length}
                      onCheckedChange={(checked) => setSelectedDups(checked ? duplicates.map(duplicateKey) : [])}
                    />
                  </th>
                  <th className="p-2 text-left">CSV Row</th>
                  <th className="p-2 text-left">Lead</th>
                  <th className="p-2 text-left">Duplicate By</th>
                  <th className="p-2 text-left">Value</th>
                  <th className="p-2 text-left">Current</th>
                  <th className="p-2 text-left">New</th>
                  <th className="p-2 text-left">Owner</th>
                  <th className="p-2 text-left">Team</th>
                </tr>
              </thead>
              <tbody>
                {duplicates.map(dup => (
                  <tr key={`${dup.id}-${dup.rowNumber}`} className="border-t">
                    <td className="p-2 text-left">
                      <Checkbox 
                        checked={selectedDups.includes(duplicateKey(dup))}
                        onCheckedChange={(checked) => {
                          const key = duplicateKey(dup);
                          setSelectedDups(prev => checked ? Array.from(new Set([...prev, key])) : prev.filter(id => id !== key));
                        }}
                      />
                    </td>
                    <td className="p-2 font-medium">#{dup.rowNumber}</td>
                    <td className="p-2">
                      <div className="font-medium">{dup.name}</div>
                      <div className="text-xs text-muted-foreground">{dup.company}</div>
                    </td>
                    <td className="p-2">
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">{dup.duplicateBy}</Badge>
                    </td>
                    <td className="p-2 text-xs max-w-[220px] truncate" title={dup.duplicateValue}>{dup.duplicateValue}</td>
                    <td className="p-2">
                      <Badge variant="outline">{dup.currentStatus}</Badge>
                    </td>
                    <td className="p-2">
                      <Badge className="bg-primary/20 text-primary border-primary/20">{dup.newStatus}</Badge>
                    </td>
                    <td className="p-2 text-xs">
                      {dup.ownerName || getUserName(dup.ownerId)}
                    </td>
                    <td className="p-2 text-xs">
                      {dup.existingTeamName || "Unassigned"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              disabled={isLoading}
              onClick={async () => {
                setIsDupModalOpen(false);
                setIsLoading(true);
                try {
                  const toImport = pendingNewLeads;
                  setPendingNewLeads([]);
                  const result = await performImport(toImport);
	                  setImportSummary({
	                    imported: result.successCount,
	                    updated: 0,
	                    duplicates: duplicates.length,
	                    unchanged: 0,
	                    skipped: importAnalysis.skippedRows.length + duplicates.length + result.skippedCount,
	                  });
	                  setCurrentStep(4);
	                  showImportSummaryToast({
	                    imported: result.successCount,
	                    updated: 0,
	                    duplicates: duplicates.length,
	                    unchanged: 0,
	                    skipped: importAnalysis.skippedRows.length + duplicates.length + result.skippedCount,
	                  });
                } finally {
                  setIsLoading(false);
                }
              }}
            >
              Skip Updates
            </Button>
            <Button onClick={handleApplyDupUpdates} disabled={isLoading}>
              Apply Selected Updates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
