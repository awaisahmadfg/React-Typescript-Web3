import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Role, LeadStage, ConnectionStatus, Lead, Plan, Team, User, ActivityTimeline } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Filter, MoreHorizontal, Linkedin, Upload, CheckSquare, Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link } from "wouter";
import { ReminderDialog } from "@/components/leads/ReminderDialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger, 
  DropdownMenuLabel, 
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal
} from "@/components/ui/dropdown-menu";
import { Mail, MessageSquare, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { availableStages } from "@/lib/mock-data";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isPhoneValid, normalizePhoneForSave } from "@/lib/phone";
import { userBelongsToTeam } from "@/lib/team-utils";

export default function LeadsPage() {
  type ChannelSnapshot = {
    nextLinkedInStep: "Not Contacted" | "Connection Sent" | "Connected";
    nextEmailStep: "No Email Sent" | "Email Reply sent" | "Replied";
    nextColdCallStep: "No Call Yet" | "Call Completed" | "Meeting Completed";
  };
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [isLoadingLeads, setIsLoadingLeads] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<"ALL" | "MINE" | string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const { toast, dismiss } = useToast();
  const [selectedLead, setSelectedLead] = useState<{id: string, name: string} | null>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [newLeadErrors, setNewLeadErrors] = useState<Record<string, string>>({});
  const [newLead, setNewLead] = useState({
    firstName: "",
    lastName: "",
    company: "",
    source: "",
    value: "",
    title: "",
    email: "",
    linkedinUrl: "",
    phone: "",
    contactOptions: [] as string[],
    ownerId: "",
    teamLeadId: "",
    teamId: user?.teamIds?.[0] || user?.teamId || "",
    planId: "",
    stage: "NEW"
  });

  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [sortCol, setSortCol] = useState<"name" | "company" | "lastActivity" | null>("lastActivity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleSort = (col: "name" | "company" | "lastActivity") => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [statusUpdateKey, setStatusUpdateKey] = useState<string | null>(null);
  const [channelSnapshotsByLeadId, setChannelSnapshotsByLeadId] = useState<Record<string, ChannelSnapshot>>({});
  const deriveChannelSnapshot = (lead: Lead, timeline: ActivityTimeline[]): ChannelSnapshot => {
    const sortedTimeline = [...timeline].sort(
      (a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime(),
    );
    const linkedinSentCount = sortedTimeline.filter(
      (entry) => entry.type === "linkedin_message" && entry.channel === "conn",
    ).length;
    const linkedinAcceptedCount = sortedTimeline.filter(
      (entry) => entry.type === "linkedin_connection_accepted",
    ).length;
    const emailSentCount = sortedTimeline.filter((entry) => entry.type === "email").length;
    const emailRepliedCount = sortedTimeline.filter(
      (entry) => entry.type === "email_replied",
    ).length;
    const latestEmailSentEvent = sortedTimeline.find((entry) => entry.type === "email");
    const latestEmailRepliedEvent = sortedTimeline.find(
      (entry) => entry.type === "email_replied",
    );
    const latestEmailResetEvent = sortedTimeline.find(
      (entry) =>
        entry.type === "note" &&
        String(entry.body || "").toLowerCase().includes("email status reset to no email sent"),
    );
    const latestColdCallEvent = sortedTimeline.find(
      (entry) => entry.type === "call" || entry.type === "meeting",
    );
    const latestColdCallResetEvent = sortedTimeline.find(
      (entry) =>
        entry.type === "note" &&
        String(entry.body || "").toLowerCase().includes("cold call status reset to no call yet"),
    );

    const nextLinkedInStep =
      lead.connectionStatus === ConnectionStatus.NONE
        ? "Not Contacted"
        : lead.connectionStatus === ConnectionStatus.ACCEPTED
          ? "Connected"
          : lead.connectionStatus === ConnectionStatus.SENT
            ? "Connection Sent"
            : linkedinAcceptedCount > 0 && linkedinAcceptedCount >= linkedinSentCount
              ? "Connected"
              : linkedinSentCount > linkedinAcceptedCount
                ? "Connection Sent"
                : "Not Contacted";
    const nextEmailStep =
      latestEmailResetEvent &&
      (!latestEmailSentEvent ||
        new Date(latestEmailResetEvent.happenedAt).getTime() >=
          new Date(latestEmailSentEvent.happenedAt).getTime()) &&
      (!latestEmailRepliedEvent ||
        new Date(latestEmailResetEvent.happenedAt).getTime() >=
          new Date(latestEmailRepliedEvent.happenedAt).getTime())
        ? "No Email Sent"
        : emailSentCount === 0
          ? "No Email Sent"
          : emailSentCount > emailRepliedCount
            ? "Email Reply sent"
            : "Replied";
    const nextColdCallStep =
      latestColdCallResetEvent &&
      (!latestColdCallEvent ||
        new Date(latestColdCallResetEvent.happenedAt).getTime() >=
          new Date(latestColdCallEvent.happenedAt).getTime())
        ? "No Call Yet"
        : !latestColdCallEvent
          ? "No Call Yet"
          : latestColdCallEvent.type === "call"
            ? "Call Completed"
            : "Meeting Completed";
    return {
      nextLinkedInStep,
      nextEmailStep,
      nextColdCallStep,
    };
  };
  const syncLeadDerivedViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
    ]);
  };
  const syncSpecificLeadViews = async (leadIds: string[]) => {
    await Promise.all(
      leadIds.flatMap((id) => [
        queryClient.invalidateQueries({ queryKey: [`/api/leads/${id}`] }),
        queryClient.invalidateQueries({ queryKey: [`/api/activity-timeline/${id}`] }),
      ]),
    );
  };
  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });
  const { data: plansList = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });
  const { data: teamPlansForNew = [] } = useQuery<Plan[]>({
    queryKey: [`/api/teams/${newLead.teamId}/plans`],
    enabled: !!newLead.teamId,
  });

  useEffect(() => {
    setNewLead((prev) => ({
      ...prev,
      ownerId: prev.ownerId || (user?.role === Role.TEAM_LEAD ? user?.id || "" : ""),
      teamId: prev.teamId || user?.teamIds?.[0] || user?.teamId || "",
    }));
  }, [user?.id, user?.role, user?.teamIds]);

  useEffect(() => {
    fetchLeads();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stageFromQuery = params.get("stage");
    if (stageFromQuery && availableStages.includes(stageFromQuery as LeadStage)) {
      setStageFilter(stageFromQuery);
    }
  }, []);
  const fetchLeads = async () => {
    setIsLoadingLeads(true);
    try {
      const res = await fetch("/api/leads", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      setLeadsList(data);
      const snapshots = await Promise.all(
        (data as Lead[]).map(async (lead) => {
          try {
            const timelineRes = await fetch(`/api/activity-timeline/${lead.id}`, {
              credentials: "include",
              cache: "no-store",
            });
            if (!timelineRes.ok) {
              throw new Error("Failed to fetch lead timeline");
            }
            const timeline = (await timelineRes.json()) as ActivityTimeline[];
            return [
              lead.id,
              deriveChannelSnapshot(lead, timeline),
            ] as const;
          } catch {
            return [
              lead.id,
              {
                nextLinkedInStep:
                  lead.connectionStatus === ConnectionStatus.ACCEPTED
                    ? "Connected"
                    : lead.connectionStatus === ConnectionStatus.SENT
                      ? "Connection Sent"
                      : "Not Contacted",
                nextEmailStep: "No Email Sent",
                nextColdCallStep: "No Call Yet",
              },
            ] as const;
          }
        }),
      );
      setChannelSnapshotsByLeadId(Object.fromEntries(snapshots) as Record<string, ChannelSnapshot>);
    } catch (error) {
      console.error("Failed to fetch leads", error);
    } finally {
      setIsLoadingLeads(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedLeadIds.length === filteredLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map(l => l.id));
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    const deletableLeads = filteredLeads.filter(l => selectedLeadIds.includes(l.id) && canDelete(l));
    const skipped = selectedLeadIds.length - deletableLeads.length;
    try {
      await Promise.all(deletableLeads.map(lead =>
        apiRequest("DELETE", `/api/leads/${lead.id}`)
      ));
      toast({
        title: "Bulk Delete Complete",
        description: `Deleted ${deletableLeads.length} lead(s).${skipped > 0 ? ` ${skipped} skipped (no permission).` : ""}`,
      });
      await syncLeadDerivedViews();
      fetchLeads();
    } catch {
      toast({ title: "Error", description: "Bulk delete failed.", variant: "destructive" });
    }
    setSelectedLeadIds([]);
    setIsBulkDeleteOpen(false);
  };

  const handleBulkStatusChange = async (newStage: string) => {
    const authorizedLeads = filteredLeads.filter(l => selectedLeadIds.includes(l.id) && canEdit(l));
    const unauthorizedCount = selectedLeadIds.length - authorizedLeads.length;

    try {
      await Promise.all(authorizedLeads.map(lead => 
        fetch(`/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage: newStage })
        })
      ));

      toast({
        title: "Bulk Update Complete",
        description: `Updated status for ${authorizedLeads.length} leads.${unauthorizedCount > 0 ? ` ${unauthorizedCount} leads were skipped due to permissions.` : ""}`,
      });
      await syncLeadDerivedViews();
      fetchLeads();
    } catch (error) {
      toast({ title: "Error", description: "Bulk update failed", variant: "destructive" });
    }
    setSelectedLeadIds([]);
  };
  const markLinkedInForLead = async (lead: Lead, nextStatus: "SENT" | "ACCEPTED") => {
    const isAccepted = nextStatus === "ACCEPTED";
    if (!isAccepted && lead.connectionStatus === ConnectionStatus.ACCEPTED) {
      throw new Error("This lead is already connected. A new LinkedIn request cycle is not allowed.");
    }
    const activityType = isAccepted ? "linkedin_connection_accepted" : "linkedin_message";
    const body = isAccepted
      ? "LinkedIn connection request accepted"
      : "LinkedIn connection request sent";

    const activityRes = await fetch("/api/activity-timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        teamId: lead.teamId || "unassigned",
        activityType,
        channel: isAccepted ? undefined : "conn",
        body,
      }),
    });
    if (!activityRes.ok) {
      const data = await activityRes.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to update LinkedIn status");
    }
  };
  const stageBadgeClassMap: Partial<Record<string, string>> = {
    NEW: "bg-slate-50 text-slate-700 border-slate-200",
    CONTACTED: "bg-blue-50 text-blue-700 border-blue-200",
    MEETING_SET: "bg-cyan-50 text-cyan-700 border-cyan-200",
    QUALIFIED: "bg-indigo-50 text-indigo-700 border-indigo-200",
    MQL: "bg-purple-50 text-purple-700 border-purple-200",
    SQL: "bg-orange-50 text-orange-700 border-orange-200",
    WON: "bg-emerald-50 text-emerald-700 border-emerald-200",
    LOST: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const getLinkedInBadgeClass = (status: "Not Contacted" | "Connection Sent" | "Connected") =>
    status === "Connected"
      ? "text-emerald-700 border-emerald-200 bg-emerald-50"
      : status === "Connection Sent"
        ? "text-amber-700 border-amber-200 bg-amber-50"
        : "text-blue-700 border-blue-200 bg-blue-50";
  const getEmailBadgeClass = (status: "No Email Sent" | "Email Reply sent" | "Replied") =>
    status === "Replied"
      ? "text-emerald-700 border-emerald-200 bg-emerald-50"
      : status === "Email Reply sent"
        ? "text-amber-700 border-amber-200 bg-amber-50"
        : "text-sky-700 border-sky-200 bg-sky-50";
  const getColdCallBadgeClass = (status: "No Call Yet" | "Call Completed" | "Meeting Completed") =>
    status === "Meeting Completed"
      ? "text-emerald-700 border-emerald-200 bg-emerald-50"
      : status === "Call Completed"
        ? "text-amber-700 border-amber-200 bg-amber-50"
        : "text-orange-700 border-orange-200 bg-orange-50";

  const createTimelineActivity = async (
    lead: Lead,
    payload: {
      activityType: "linkedin_message" | "linkedin_connection_accepted" | "email" | "email_replied" | "call" | "meeting" | "note";
      body: string;
      channel?: "conn" | "dm" | "inmail";
    },
  ) => {
    const activityRes = await fetch("/api/activity-timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        teamId: lead.teamId || "unassigned",
        activityType: payload.activityType,
        channel: payload.channel,
        body: payload.body,
      }),
    });
    if (!activityRes.ok) {
      const data = await activityRes.json().catch(() => ({}));
      throw new Error(data?.message || "Failed to create activity entry");
    }
  };

  const refreshLeadViewsAfterStatusUpdate = async (leadId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] }),
      queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] }),
      queryClient.invalidateQueries({ queryKey: [`/api/activity-timeline/${leadId}`] }),
    ]);

    const [leadRes, timelineRes] = await Promise.all([
      fetch(`/api/leads/${leadId}`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(`/api/activity-timeline/${leadId}`, {
        credentials: "include",
        cache: "no-store",
      }),
    ]);

    if (!leadRes.ok || !timelineRes.ok) {
      await fetchLeads();
      return;
    }

    const [freshLead, freshTimeline] = (await Promise.all([
      leadRes.json(),
      timelineRes.json(),
    ])) as [Lead, ActivityTimeline[]];

    setLeadsList((prev) => prev.map((item) => (item.id === freshLead.id ? freshLead : item)));
    setChannelSnapshotsByLeadId((prev) => ({
      ...prev,
      [leadId]: deriveChannelSnapshot(freshLead, freshTimeline),
    }));
  };

  const handleLinkedInTableStatusSelect = async (
    lead: Lead,
    nextStep: "Not Contacted" | "Connection Sent" | "Connected",
  ) => {
    const key = `${lead.id}:linkedin`;
    if (statusUpdateKey === key) return;
    setStatusUpdateKey(key);
    try {
      if (nextStep === "Not Contacted") {
        if (lead.connectionStatus === ConnectionStatus.ACCEPTED) {
          throw new Error("This lead is already connected. Connected leads cannot be reverted to Not Contacted.");
        }
        const patchRes = await fetch(`/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionStatus: ConnectionStatus.NONE,
            connectionSentAt: null,
            connectionAcceptedAt: null,
          }),
        });
        if (!patchRes.ok) {
          const data = await patchRes.json().catch(() => ({}));
          throw new Error(data?.message || "Failed to reset LinkedIn status");
        }
        await createTimelineActivity(lead, {
          activityType: "note",
          body: "LinkedIn status set to Not Contacted from leads table.",
        });
      } else if (nextStep === "Connection Sent") {
        if (lead.connectionStatus === ConnectionStatus.ACCEPTED) {
          throw new Error("This lead is already connected. A new LinkedIn request cycle is not allowed.");
        }
        if (lead.connectionStatus !== ConnectionStatus.SENT) {
          await markLinkedInForLead(lead, "SENT");
        }
      } else {
        if (lead.connectionStatus === ConnectionStatus.NONE) {
          await markLinkedInForLead(lead, "SENT");
          await markLinkedInForLead({ ...lead, connectionStatus: ConnectionStatus.SENT }, "ACCEPTED");
        } else if (lead.connectionStatus === ConnectionStatus.SENT) {
          await markLinkedInForLead(lead, "ACCEPTED");
        } else {
          await createTimelineActivity(lead, {
            activityType: "note",
            body: "LinkedIn status reconfirmed as Connected from leads table.",
          });
        }
      }
      await refreshLeadViewsAfterStatusUpdate(lead.id);
      toast({
        title: "LinkedIn Status Updated",
        description: `Status changed to ${nextStep}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update LinkedIn status.",
        variant: "destructive",
      });
    } finally {
      setStatusUpdateKey((prev) => (prev === key ? null : prev));
    }
  };

  const handleEmailTableStatusSelect = async (
    lead: Lead,
    currentStep: "No Email Sent" | "Email Reply sent" | "Replied",
    nextStep: "No Email Sent" | "Email Reply sent" | "Replied",
  ) => {
    const key = `${lead.id}:email`;
    if (statusUpdateKey === key || currentStep === nextStep) return;
    setStatusUpdateKey(key);
    try {
      if (nextStep === "No Email Sent") {
        await createTimelineActivity(lead, {
          activityType: "note",
          body: "Email status reset to No Email Sent from leads table.",
        });
      } else if (nextStep === "Email Reply sent") {
        await createTimelineActivity(lead, {
          activityType: "email",
          body: "Email sent from leads table.",
        });
      } else if (nextStep === "Replied") {
        await createTimelineActivity(lead, {
          activityType: "email_replied",
          body: "Email reply received (updated from leads table).",
        });
      }
      await refreshLeadViewsAfterStatusUpdate(lead.id);
      toast({
        title: "Email Status Updated",
        description: `Status changed to ${nextStep}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update Email status.",
        variant: "destructive",
      });
    } finally {
      setStatusUpdateKey((prev) => (prev === key ? null : prev));
    }
  };

  const handleColdCallTableStatusSelect = async (
    lead: Lead,
    currentStep: "No Call Yet" | "Call Completed" | "Meeting Completed",
    nextStep: "No Call Yet" | "Call Completed" | "Meeting Completed",
  ) => {
    const key = `${lead.id}:cold_call`;
    if (statusUpdateKey === key || currentStep === nextStep) return;
    setStatusUpdateKey(key);
    try {
      if (nextStep === "No Call Yet") {
        await createTimelineActivity(lead, {
          activityType: "note",
          body: "Cold call status reset to No Call Yet from leads table.",
        });
      } else if (nextStep === "Call Completed") {
        await createTimelineActivity(lead, {
          activityType: "call",
          body: "Cold call completed from leads table.",
        });
      } else if (nextStep === "Meeting Completed") {
        await createTimelineActivity(lead, {
          activityType: "meeting",
          body: "Meeting completed from leads table.",
        });
      }
      await refreshLeadViewsAfterStatusUpdate(lead.id);
      toast({
        title: "Cold Call Status Updated",
        description: `Status changed to ${nextStep}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to update Cold Call status.",
        variant: "destructive",
      });
    } finally {
      setStatusUpdateKey((prev) => (prev === key ? null : prev));
    }
  };
  const handleBulkLinkedInStatusChange = async (nextStatus: "SENT" | "ACCEPTED") => {
    const authorizedLeads = filteredLeads.filter((lead) => selectedLeadIds.includes(lead.id) && canEdit(lead));
    const unauthorizedCount = selectedLeadIds.length - authorizedLeads.length;
    let successCount = 0;
    let failedCount = 0;
    const alreadyAcceptedLeadNames: string[] = [];
    const alreadySentLeadNames: string[] = [];
    const failedLeadNames: string[] = [];
    const displayLeadName = (lead: Lead) => `${lead.firstName} ${lead.lastName}`.trim();
    const formatLeadNames = (names: string[]) => {
      if (names.length === 0) return "";
      const unique = Array.from(new Set(names));
      const visible = unique.slice(0, 3);
      const suffix = unique.length > visible.length ? ` +${unique.length - visible.length} more` : "";
      return `${visible.join(", ")}${suffix}`;
    };

    for (const lead of authorizedLeads) {
      try {
        if (nextStatus === "ACCEPTED" && lead.connectionStatus === ConnectionStatus.ACCEPTED) {
          alreadyAcceptedLeadNames.push(displayLeadName(lead));
          continue;
        }
        if (nextStatus === "SENT" && lead.connectionStatus === ConnectionStatus.ACCEPTED) {
          alreadyAcceptedLeadNames.push(displayLeadName(lead));
          continue;
        }
        if (nextStatus === "SENT" && lead.connectionStatus === ConnectionStatus.SENT) {
          alreadySentLeadNames.push(displayLeadName(lead));
          continue;
        }
        if (nextStatus === "ACCEPTED" && lead.connectionStatus === ConnectionStatus.NONE) {
          await markLinkedInForLead(lead, "SENT");
        }
        await markLinkedInForLead(lead, nextStatus);
        successCount += 1;
      } catch (error: any) {
        const message = String(error?.message || "").toLowerCase();
        if (message.includes("status must be sent first")) {
          alreadySentLeadNames.push(displayLeadName(lead));
          continue;
        }
        failedCount += 1;
        failedLeadNames.push(displayLeadName(lead));
      }
    }

    await syncLeadDerivedViews();
    await syncSpecificLeadViews(authorizedLeads.map((lead) => lead.id));
    fetchLeads();
    setSelectedLeadIds([]);
    const details: string[] = [`Updated ${successCount} lead(s).`];
    if (alreadyAcceptedLeadNames.length > 0) {
      details.push(`Already accepted: ${formatLeadNames(alreadyAcceptedLeadNames)}.`);
    }
    if (alreadySentLeadNames.length > 0) {
      details.push(`Already sent: ${formatLeadNames(alreadySentLeadNames)}.`);
    }
    if (unauthorizedCount > 0) {
      details.push(`No permission: ${unauthorizedCount}.`);
    }
    if (failedCount > 0) {
      details.push(`Error: ${formatLeadNames(failedLeadNames) || failedCount}.`);
    }
    dismiss();
    toast({
      title: "Bulk LinkedIn Update Complete",
      description: details.join(" | "),
      variant: failedCount > 0 || (successCount === 0 && (alreadyAcceptedLeadNames.length > 0 || alreadySentLeadNames.length > 0))
        ? "destructive"
        : "default",
    });
  };
  const handleLinkedInStatusChange = async (lead: Lead, nextStatus: "SENT" | "ACCEPTED") => {
    const leadName = `${lead.firstName} ${lead.lastName}`.trim();
    try {
      if (nextStatus === "ACCEPTED" && lead.connectionStatus === ConnectionStatus.ACCEPTED) {
        dismiss();
        toast({
          title: "LinkedIn Status",
          description: `LinkedIn connection for ${leadName} is already accepted.`,
          variant: "destructive",
        });
        return;
      }
      if (nextStatus === "SENT" && lead.connectionStatus === ConnectionStatus.SENT) {
        dismiss();
        toast({
          title: "LinkedIn Status",
          description: `LinkedIn connection for ${leadName} is already sent.`,
          variant: "destructive",
        });
        return;
      }
      if (nextStatus === "SENT" && lead.connectionStatus === ConnectionStatus.ACCEPTED) {
        dismiss();
        toast({
          title: "LinkedIn Status",
          description: `LinkedIn connection for ${leadName} is already accepted. A new request cycle is not allowed.`,
          variant: "destructive",
        });
        return;
      }
      await markLinkedInForLead(lead, nextStatus);
      await refreshLeadViewsAfterStatusUpdate(lead.id);
      dismiss();
      toast({
        title: "LinkedIn Updated",
        description:
          nextStatus === "SENT"
            ? "Marked as connection sent."
            : "Marked as connection accepted.",
      });
    } catch (error: any) {
      dismiss();
      toast({
        title: "Error",
        description: error?.message || "Failed to update LinkedIn status.",
        variant: "destructive",
      });
    }
  };

  const filteredLeads = leadsList.filter(lead => {
    // 1. RBAC Team Scoping
    if (user?.role === "ADMIN") {
      // Admin sees everything
    } else {
      // Everyone else is scoped to their team
      if (!userBelongsToTeam(user, lead.teamId)) return false;
      
    }

    // 2. Owner filter
    if (ownerFilter === "MINE") {
      if (lead.ownerId !== user?.id) return false;
    } else if (ownerFilter !== "ALL") {
      if (lead.ownerId !== ownerFilter) return false;
    }

    // 3. Search & Stage Filters
    const matchesSearch = 
      lead.firstName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      lead.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStage =
      stageFilter === "ALL" ||
      (stageFilter === "LINKEDIN_SENT" ? lead.connectionStatus === ConnectionStatus.SENT :
       stageFilter === "LINKEDIN_ACCEPTED" ? lead.connectionStatus === ConnectionStatus.ACCEPTED :
       lead.stage === stageFilter);

    let matchesDate = true;
    if (dateFrom || dateTo) {
      const activity = lead.updatedAt ? new Date(lead.updatedAt) : null;
      if (!activity) return false;
      // Normalise activity to local-midnight so timezone offset doesn't shift the date
      const day = new Date(activity.getFullYear(), activity.getMonth(), activity.getDate());
      if (dateFrom) {
        // Parse "YYYY-MM-DD" as local midnight, not UTC midnight
        const [fy, fm, fd] = dateFrom.split("-").map(Number);
        const from = new Date(fy, fm - 1, fd);
        if (day < from) matchesDate = false;
      }
      if (dateTo) {
        const [ty, tm, td] = dateTo.split("-").map(Number);
        const to = new Date(ty, tm - 1, td);
        if (day > to) matchesDate = false;
      }
    }

    return matchesSearch && matchesStage && matchesDate;
  }).sort((a, b) => {
    if (!sortCol) return 0;
    let aVal = "";
    let bVal = "";
    if (sortCol === "name") {
      aVal = `${a.firstName} ${a.lastName}`.toLowerCase();
      bVal = `${b.firstName} ${b.lastName}`.toLowerCase();
    } else if (sortCol === "company") {
      aVal = (a.company || "").toLowerCase();
      bVal = (b.company || "").toLowerCase();
    } else if (sortCol === "lastActivity") {
      aVal = a.updatedAt || "";
      bVal = b.updatedAt || "";
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  const visibleStatusColumns = useMemo(() => {
    const selected = new Set<string>();
    for (const lead of filteredLeads) {
      for (const option of lead.contactOptions || []) {
        selected.add(option);
      }
    }
    return {
      linkedin: selected.has("linkedin_connection"),
      email: selected.has("email"),
      coldCall: selected.has("cold_call"),
    };
  }, [filteredLeads]);
  const handleStatusChange = async (leadId: string, newStage: string) => {
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage })
      });

      const lead = leadsList.find(l => l.id === leadId);
      if (lead) {
        setSelectedLead({ id: lead.id, name: `${lead.firstName} ${lead.lastName}` });
        setIsReminderOpen(true);
        toast({
          title: "Stage Updated",
          description: `Lead moved to ${newStage}`,
        });
        await syncLeadDerivedViews();
        fetchLeads();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const canEdit = (lead: any) => {
    if (user?.role === "ADMIN" || user?.role === "TEAM_LEAD") return true;
    return lead.ownerId === user?.id;
  };

  const canDelete = (lead: Lead) => {
    if (user?.role === "ADMIN") return true;
    if (lead.ownerId === user?.id) return true;
    if (lead.createdById === user?.id) return true;
    if (lead.teamLeadId === user?.id) return true;
    if (user?.role === "TEAM_LEAD" && lead.teamId) {
      const team = teamsList.find((t) => t.id === lead.teamId);
      if (team?.leadId === user?.id) return true;
    }
    return false;
  };

  const handleDeleteLead = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest("DELETE", `/api/leads/${deleteTarget.id}`);
      toast({ title: "Lead Deleted", description: `${deleteTarget.firstName} ${deleteTarget.lastName} has been deleted.` });
      await syncLeadDerivedViews();
      fetchLeads();
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to delete lead", variant: "destructive" });
    }
    setDeleteTarget(null);
  };

  const canManageAssignments = user?.role === "ADMIN" || user?.role === "TEAM_LEAD";
  const isMultiTeamUser = (user?.teamIds?.length ?? 0) > 1;
  const visibleTeams =
    user?.role === "ADMIN"
      ? teamsList
      : teamsList.filter((team) => {
          // Include teams user belongs to via junction table
          if (user?.teamIds?.includes(team.id)) return true;
          if (team.id === user?.teamId) return true;
          // TEAM_LEAD also sees teams where they are configured as the lead
          if (user?.role === Role.TEAM_LEAD && team.leadId === user?.id) return true;
          return false;
        });
  // Any active team member for the Owner field
  const assignableUsers = (() => {
    const selectedTeamId = newLead.teamId;
    return usersList.filter((u) => {
      if (!u.isActive) return false;
      if (u.role === Role.ADMIN) return false;
      if (!selectedTeamId) return true;
      return u.teamIds?.includes(selectedTeamId) || u.teamId === selectedTeamId;
    });
  })();

  // Active TLs in the selected team for the Team Lead field
  const assignableTLs = (() => {
    const selectedTeamId = newLead.teamId;
    const selectedTeam = teamsList.find((t) => t.id === selectedTeamId);
    const candidates = usersList.filter((u) => {
      if (!u.isActive || u.role !== Role.TEAM_LEAD) return false;
      if (!selectedTeamId) return true;
      return u.teamIds?.includes(selectedTeamId) || u.teamId === selectedTeamId;
    });
    // Fallback: ensure team's configured lead is always in the list
    if (selectedTeam?.leadId) {
      const configuredLead = usersList.find((u) => u.id === selectedTeam.leadId && u.isActive);
      if (configuredLead && configuredLead.role === Role.TEAM_LEAD && !candidates.some((u) => u.id === configuredLead.id)) {
        return [...candidates, configuredLead];
      }
    }
    return candidates;
  })();

  useEffect(() => {
    if (!canManageAssignments) return;
    const preferredTeamId =
      visibleTeams.find((team) => team.id === newLead.teamId)?.id || visibleTeams[0]?.id || "";
    const selectedTeam = teamsList.find((team) => team.id === preferredTeamId);

    // Owner: keep existing if still valid, else default to current user (if in team) or first member
    const preferredOwnerId =
      assignableUsers.find((u) => u.id === newLead.ownerId)?.id ||
      (user && assignableUsers.some((u) => u.id === user.id) ? user.id : assignableUsers[0]?.id || "");

    // Team Lead: keep existing if still valid, else default to team's configured lead
    const preferredTeamLeadId =
      assignableTLs.find((u) => u.id === newLead.teamLeadId)?.id ||
      (selectedTeam?.leadId && assignableTLs.some((u) => u.id === selectedTeam.leadId)
        ? selectedTeam.leadId
        : assignableTLs[0]?.id || "");

    if (preferredTeamId === newLead.teamId && preferredOwnerId === newLead.ownerId && preferredTeamLeadId === newLead.teamLeadId) return;
    setNewLead((prev) => ({
      ...prev,
      teamId: preferredTeamId,
      ownerId: preferredOwnerId,
      teamLeadId: preferredTeamLeadId,
    }));
  }, [canManageAssignments, visibleTeams, assignableUsers, assignableTLs, teamsList, newLead.teamId, newLead.ownerId, newLead.teamLeadId]);
  const visiblePlans = newLead.teamId ? teamPlansForNew : plansList;
  const isNewLeadPhoneValid = isPhoneValid(newLead.phone);

  const formatStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      NEW: "New",
      CONTACTED: "Contacted",
      MEETING_SET: "Meeting Set",
      QUALIFIED: "Qualified",
      CLOSED_WON: "Closed Won",
      CLOSED_LOST: "Closed Lost",
    };
    return labels[stage] ?? stage;
  };

  const getOwnerName = (lead: Lead) => {
    if (lead.ownerId === user?.id) return "You";
    return (
      usersList.find((u) => u.id === lead.ownerId)?.name ||
      (lead as any).ownerName ||
      "Unknown"
    );
  };
  const handleCreateLead = async () => {
    const errors: Record<string, string> = {};
    if (!newLead.firstName.trim()) errors.firstName = "First name is required.";
    if (!newLead.lastName.trim()) errors.lastName = "Last name is required.";
    if (!newLead.company.trim()) errors.company = "Company is required.";
    if (!newLead.source.trim()) errors.source = "Lead source is required.";
    const normalizedValue = Number(newLead.value);
    if (!newLead.value || !Number.isFinite(normalizedValue) || normalizedValue < 0) {
      errors.value = "Lead value is required and must be a non-negative number.";
    }
    if (newLead.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newLead.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (newLead.linkedinUrl.trim()) {
      try { new URL(newLead.linkedinUrl.trim()); } catch { errors.linkedinUrl = "Enter a valid URL (e.g. https://linkedin.com/in/name)."; }
    }
    if (canManageAssignments && !newLead.teamId) errors.teamId = "Please select a team.";
    if (canManageAssignments && !newLead.teamLeadId) errors.teamLeadId = "Please select a team lead.";
    if (canManageAssignments && !newLead.ownerId) errors.ownerId = "Please select an owner.";

    if (Object.keys(errors).length > 0) {
      setNewLeadErrors(errors);
      return;
    }
    setNewLeadErrors({});

    const normalizedPhone = normalizePhoneForSave(newLead.phone);
    if (newLead.phone.trim().length > 0 && !normalizedPhone) {
      toast({
        title: "Invalid phone number",
        description: "Please enter a valid phone number with country code.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newLead,
          source: newLead.source.trim(),
          value: Math.round(normalizedValue),
          phone: normalizedPhone,
          contactOptions: newLead.contactOptions,
          ownerId: newLead.ownerId || user?.id,
          teamLeadId: newLead.teamLeadId || null,
          teamId: newLead.teamId || user?.teamIds?.[0] || user?.teamId,
          planId: newLead.planId || null,
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to create lead");
      }
      await res.json();

      toast({ title: "Lead Added", description: "Successfully created new lead." });
      setIsAddLeadOpen(false);
      setNewLead({
        firstName: "",
        lastName: "",
        company: "",
        source: "",
        value: "",
        title: "",
        email: "",
        linkedinUrl: "",
        phone: "",
        contactOptions: [],
        ownerId: "",
        teamLeadId: "",
        teamId: user?.teamIds?.[0] || user?.teamId || "",
        planId: "",
        stage: "NEW"
      });
      await syncLeadDerivedViews();
      fetchLeads();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to create lead",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {selectedLead && (
        <ReminderDialog
          open={isReminderOpen}
          onOpenChange={setIsReminderOpen}
          leadId={selectedLead.id}
          leadName={selectedLead.name}
          onSuccess={() => {
            toast({
              title: "Reminder Set",
              description: `Next follow-up scheduled for ${selectedLead.name}`,
            });
            setSelectedLead(null);
          }}
        />
      )}
      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLeadIds.length} Lead{selectedLeadIds.length !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedLeadIds.length} selected lead{selectedLeadIds.length !== 1 ? "s" : ""} along with all associated tasks and activity history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {selectedLeadIds.length} Lead{selectedLeadIds.length !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deleteTarget?.firstName} {deleteTarget?.lastName}? This will also remove all associated tasks and activity history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteLead();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-1">Manage and track your prospects</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant={selectedLeadIds.length > 0 ? "default" : "outline"}
                disabled={selectedLeadIds.length === 0}
                className={selectedLeadIds.length > 0 ? "shadow-sm" : ""}
              >
                {selectedLeadIds.length > 0 ? `Bulk Action (${selectedLeadIds.length})` : "Bulk Action"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {selectedLeadIds.length > 0
                  ? `${selectedLeadIds.length} selected`
                  : "Select leads first"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {selectedLeadIds.length > 0 ? (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">LinkedIn</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleBulkLinkedInStatusChange("SENT")}>
                    <Linkedin className="mr-2 h-4 w-4 text-blue-600" />
                    Mark Connection Sent
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkLinkedInStatusChange("ACCEPTED")}>
                    <Linkedin className="mr-2 h-4 w-4 text-emerald-600" />
                    Mark Connection Accepted
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Pipeline Stage</DropdownMenuLabel>
                  {availableStages.map((stage) => (
                    <DropdownMenuItem key={stage} onClick={() => handleBulkStatusChange(stage)}>
                      Move to {formatStageLabel(stage)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setIsBulkDeleteOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected ({selectedLeadIds.length})
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem disabled>No lead selected</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/import">
             <Button variant="outline">
               <Upload className="w-4 h-4 mr-2" />
               Import CSV
             </Button>
          </Link>
          <Dialog open={isAddLeadOpen} onOpenChange={(open) => { setIsAddLeadOpen(open); if (!open) setNewLeadErrors({}); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Lead
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Lead</DialogTitle>
                <DialogDescription>Enter the details for the new prospect.</DialogDescription>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto space-y-4 py-2 pr-1">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="John"
                      value={newLead.firstName}
                      onChange={(e) => { setNewLead(prev => ({ ...prev, firstName: e.target.value })); if (newLeadErrors.firstName) setNewLeadErrors(p => ({...p, firstName: ""})); }}
                      className={newLeadErrors.firstName ? "border-destructive" : ""}
                    />
                    {newLeadErrors.firstName && <p className="text-xs text-destructive">{newLeadErrors.firstName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="Doe"
                      value={newLead.lastName}
                      onChange={(e) => { setNewLead(prev => ({ ...prev, lastName: e.target.value })); if (newLeadErrors.lastName) setNewLeadErrors(p => ({...p, lastName: ""})); }}
                      className={newLeadErrors.lastName ? "border-destructive" : ""}
                    />
                    {newLeadErrors.lastName && <p className="text-xs text-destructive">{newLeadErrors.lastName}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input
                    placeholder="john.doe@company.com"
                    type="email"
                    value={newLead.email}
                    onChange={(e) => { setNewLead(prev => ({ ...prev, email: e.target.value })); if (newLeadErrors.email) setNewLeadErrors(p => ({...p, email: ""})); }}
                    className={newLeadErrors.email ? "border-destructive" : ""}
                  />
                  {newLeadErrors.email && <p className="text-xs text-destructive">{newLeadErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input
                    placeholder="https://linkedin.com/in/..."
                    value={newLead.linkedinUrl}
                    onChange={(e) => { setNewLead(prev => ({ ...prev, linkedinUrl: e.target.value })); if (newLeadErrors.linkedinUrl) setNewLeadErrors(p => ({...p, linkedinUrl: ""})); }}
                    className={newLeadErrors.linkedinUrl ? "border-destructive" : ""}
                  />
                  {newLeadErrors.linkedinUrl && <p className="text-xs text-destructive">{newLeadErrors.linkedinUrl}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <PhoneInput
                    placeholder="+1 (555) 000-0000" 
                    value={newLead.phone} 
                    onChange={(value) => setNewLead(prev => ({ ...prev, phone: value }))} 
                  />
                  {!isNewLeadPhoneValid && (
                    <p className="text-xs text-destructive">
                      Enter a valid phone number with country code (e.g. +92...).
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Company <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="Acme Corp"
                    value={newLead.company}
                    onChange={(e) => { setNewLead(prev => ({ ...prev, company: e.target.value })); if (newLeadErrors.company) setNewLeadErrors(p => ({...p, company: ""})); }}
                    className={newLeadErrors.company ? "border-destructive" : ""}
                  />
                  {newLeadErrors.company && <p className="text-xs text-destructive">{newLeadErrors.company}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Source <span className="text-destructive">*</span></Label>
                    <Input
                      placeholder="LinkedIn / Referral / Website"
                      value={newLead.source}
                      onChange={(e) => { setNewLead((prev) => ({ ...prev, source: e.target.value })); if (newLeadErrors.source) setNewLeadErrors(p => ({...p, source: ""})); }}
                      className={newLeadErrors.source ? "border-destructive" : ""}
                    />
                    {newLeadErrors.source && <p className="text-xs text-destructive">{newLeadErrors.source}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Value <span className="text-destructive">*</span></Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="5000"
                      value={newLead.value}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (newLeadErrors.value) setNewLeadErrors(p => ({...p, value: ""}));
                        if (raw === "") { setNewLead((prev) => ({ ...prev, value: "" })); return; }
                        if (!/^\d+$/.test(raw)) return;
                        setNewLead((prev) => ({ ...prev, value: raw }));
                      }}
                      className={newLeadErrors.value ? "border-destructive" : ""}
                    />
                    {newLeadErrors.value && <p className="text-xs text-destructive">{newLeadErrors.value}</p>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input 
                    placeholder="Sales Director" 
                    value={newLead.title} 
                    onChange={(e) => setNewLead(prev => ({ ...prev, title: e.target.value }))} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Preferences</Label>
                  <div className="rounded-md border p-3 space-y-2">
                    {[
                      { key: "email", label: "Email" },
                      { key: "linkedin_connection", label: "LinkedIn Connection" },
                      { key: "cold_call", label: "Cold Call" },
                    ].map((option) => {
                      const isChecked = newLead.contactOptions.includes(option.key);
                      return (
                        <label key={option.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={isChecked}
                            onChange={(e) =>
                              setNewLead((prev) => ({
                                ...prev,
                                contactOptions: e.target.checked
                                  ? [...prev.contactOptions, option.key]
                                  : prev.contactOptions.filter((selected) => selected !== option.key),
                              }))
                            }
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {canManageAssignments && (
                  <>
                    <div className="space-y-2">
                      <Label>Team</Label>
                      <Select
                        value={newLead.teamId || "__none__"}
                        onValueChange={(value) => {
                          const nextTeamId = value === "__none__" ? "" : value;
                          const nextTeam = teamsList.find((t) => t.id === nextTeamId);
                          setNewLead((prev) => ({
                            ...prev,
                            teamId: nextTeamId,
                            ownerId: "",
                            teamLeadId: nextTeam?.leadId || "",
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Owner</Label>
                      <Select
                        value={newLead.ownerId || "__none__"}
                        onValueChange={(value) =>
                          setNewLead((prev) => ({ ...prev, ownerId: value === "__none__" ? "" : value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name} — {u.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Assigned Team Lead</Label>
                      <Select
                        value={newLead.teamLeadId || "__none__"}
                        onValueChange={(value) =>
                          setNewLead((prev) => ({ ...prev, teamLeadId: value === "__none__" ? "" : value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select team lead" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableTLs.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {!canManageAssignments && isMultiTeamUser && (
                  <div className="space-y-2">
                    <Label>Team</Label>
                    <Select
                      value={newLead.teamId || "__none__"}
                      onValueChange={(value) =>
                        setNewLead((prev) => ({
                          ...prev,
                          teamId: value === "__none__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibleTeams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {canManageAssignments && (
                  <div className="space-y-2">
                    <Label>Plan (Optional)</Label>
                    <Select
                      value={newLead.planId || "__none__"}
                      onValueChange={(value) =>
                        setNewLead((prev) => ({
                          ...prev,
                          planId: value === "__none__" ? "" : value,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Plan</SelectItem>
                        {visiblePlans.map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="pt-3 border-t">
                <Button className="w-full" onClick={handleCreateLead}>
                  Create Lead
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Owner */}
            {(user?.role !== "AE" && user?.role !== "SDR") && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[175px] shrink-0">
                  <SelectValue placeholder="Filter by Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Leads</SelectItem>
                  <SelectItem value="MINE">My Leads</SelectItem>
                  {usersList
                    .filter(u => {
                      if (u.id === user?.id) return false;
                      if (user?.role === Role.ADMIN) return true;
                      return userBelongsToTeam(user, u.teamId) ||
                        u.teamIds?.some(tid => userBelongsToTeam(user, tid));
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            )}

            {/* Search */}
            <div className="relative w-[220px] shrink-0">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Stage */}
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[145px] shrink-0">
                <Filter className="w-4 h-4 mr-2 shrink-0" />
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Stages</SelectItem>
                {availableStages.map(stage => (
                  <SelectItem key={stage} value={stage}>{formatStageLabel(stage)}</SelectItem>
                ))}
                <SelectItem value="LINKEDIN_SENT">LinkedIn — Sent</SelectItem>
                <SelectItem value="LINKEDIN_ACCEPTED">LinkedIn — Accepted</SelectItem>
              </SelectContent>
            </Select>

            {/* Date range */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Activity:</span>
              <Input
                type="date"
                className="h-8 w-[140px] text-xs"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="date"
                className="h-8 w-[140px] text-xs"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table className="min-w-[1500px] [&_th]:whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] shrink-0">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-[160px]">
                  <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-foreground font-medium">
                    Name
                    {sortCol === "name" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </TableHead>
                <TableHead className="w-[160px]">
                  <button onClick={() => handleSort("company")} className="flex items-center gap-1 hover:text-foreground font-medium">
                    Company
                    {sortCol === "company" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </TableHead>
                <TableHead className="w-[110px]">Source</TableHead>
                <TableHead className="w-[80px]">Value</TableHead>
                <TableHead className="w-[140px]">Assigned Team</TableHead>
                <TableHead className="w-[130px]">Team Lead</TableHead>
                <TableHead className="w-[140px]">Title</TableHead>
                <TableHead className="w-[120px]">Owner</TableHead>
                <TableHead className="w-[120px]">Created By</TableHead>
                {visibleStatusColumns.linkedin && (
                  <TableHead className="whitespace-nowrap min-w-[120px]">LinkedIn Status</TableHead>
                )}
                {visibleStatusColumns.email && (
                  <TableHead className="whitespace-nowrap min-w-[110px]">Email Status</TableHead>
                )}
                {visibleStatusColumns.coldCall && (
                  <TableHead className="whitespace-nowrap min-w-[130px]">Cold Call Status</TableHead>
                )}
                <TableHead className="whitespace-nowrap min-w-[110px]">Pipeline Stage</TableHead>
                <TableHead>
                  <button onClick={() => handleSort("lastActivity")} className="flex items-center gap-1 hover:text-foreground font-medium">
                    Last Activity
                    {sortCol === "lastActivity" ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                  </button>
                </TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingLeads && leadsList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="h-32 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Spinner className="size-5" />
                      <span className="text-sm">Loading leads...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLeads.map((lead) => {
                const isOwner = lead.ownerId === user?.id;
                const editable = canEdit(lead);
                const assignedTeam = teamsList.find((team) => team.id === lead.teamId);
                const teamLeadUser =
                  usersList.find((u) => u.id === assignedTeam?.leadId) ||
                  usersList.find((u) => u.id === lead.ownerId);
                
                return (
                  <TableRow key={lead.id} className="group">
                    <TableCell>
                      <input 
                        type="checkbox" 
                        className="rounded border-gray-300"
                        checked={selectedLeadIds.includes(lead.id)}
                        onChange={() => toggleSelectLead(lead.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium max-w-[160px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link
                          href={`/leads/${lead.id}`}
                          className="hover:underline truncate"
                          title={`${lead.firstName} ${lead.lastName}`}
                        >
                          {lead.firstName} {lead.lastName}
                        </Link>
                        <a href={lead.linkedinUrl || "#"} target="_blank" rel="noreferrer" className="text-[#0077b5] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Linkedin className="w-4 h-4" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <span className="block truncate" title={lead.company || "-"}>{lead.company || "-"}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[110px]">
                      <span className="block truncate" title={lead.source || "-"}>{lead.source || "-"}</span>
                    </TableCell>
                    <TableCell className="text-xs font-medium w-[80px]">
                      {typeof lead.value === "number" ? lead.value.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="max-w-[140px]">
                      <span className="block truncate text-xs text-muted-foreground" title={assignedTeam?.name || "Unassigned"}>
                        {assignedTeam?.name || "Unassigned"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[130px]">
                      <span className="block truncate text-xs font-medium" title={teamLeadUser?.name || "Unassigned"}>
                        {teamLeadUser?.name || "Unassigned"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[140px]">
                      <span className="block truncate text-xs text-muted-foreground" title={lead.title || "-"}>{lead.title || "-"}</span>
                    </TableCell>
                    <TableCell className="max-w-[120px]">
                      <span className={`block truncate text-xs ${isOwner ? "font-medium text-primary" : "text-muted-foreground"}`} title={getOwnerName(lead)}>
                        {getOwnerName(lead)}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[120px]">
                      {(() => {
                        const creator = usersList.find(u => u.id === lead.createdById);
                        const name = creator?.name || (lead.createdById ? "Unknown" : "-");
                        return (
                          <span className="block truncate text-xs text-muted-foreground" title={name}>{name}</span>
                        );
                      })()}
                    </TableCell>
                    {visibleStatusColumns.linkedin && (
                      <TableCell>
                        {!(lead.contactOptions || []).includes("linkedin_connection") ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (() => {
                          const snapshot = channelSnapshotsByLeadId[lead.id];
                          const nextStep = snapshot?.nextLinkedInStep ||
                            (lead.connectionStatus === ConnectionStatus.SENT ? "Connection Sent" : "Not Contacted");
                          const isUpdating = statusUpdateKey === `${lead.id}:linkedin`;
                          return (
                            <Select
                              value={nextStep}
                              onValueChange={(value: "Not Contacted" | "Connection Sent" | "Connected") =>
                                handleLinkedInTableStatusSelect(lead, value)
                              }
                              disabled={!editable || isUpdating}
                            >
                              <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0">
                                <Badge variant="outline" className={getLinkedInBadgeClass(nextStep)}>
                                  {isUpdating ? "Updating..." : nextStep}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Not Contacted">Not Contacted</SelectItem>
                                <SelectItem value="Connection Sent">Connection Sent</SelectItem>
                                <SelectItem value="Connected">Connected</SelectItem>
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </TableCell>
                    )}
                    {visibleStatusColumns.email && (
                      <TableCell>
                        {!(lead.contactOptions || []).includes("email") ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (() => {
                          const snapshot = channelSnapshotsByLeadId[lead.id];
                          const nextStep = snapshot?.nextEmailStep || "No Email Sent";
                          const isUpdating = statusUpdateKey === `${lead.id}:email`;
                          return (
                            <Select
                              value={nextStep}
                              onValueChange={(value: "No Email Sent" | "Email Reply sent" | "Replied") =>
                                handleEmailTableStatusSelect(lead, nextStep, value)
                              }
                              disabled={!editable || isUpdating}
                            >
                              <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0">
                                <Badge variant="outline" className={getEmailBadgeClass(nextStep)}>
                                  {isUpdating ? "Updating..." : nextStep}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="No Email Sent">No Email Sent</SelectItem>
                                <SelectItem value="Email Reply sent">Email Reply sent</SelectItem>
                                <SelectItem value="Replied">Replied</SelectItem>
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </TableCell>
                    )}
                    {visibleStatusColumns.coldCall && (
                      <TableCell>
                        {!(lead.contactOptions || []).includes("cold_call") ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (() => {
                          const snapshot = channelSnapshotsByLeadId[lead.id];
                          const nextStep = snapshot?.nextColdCallStep || "No Call Yet";
                          const isUpdating = statusUpdateKey === `${lead.id}:cold_call`;
                          return (
                            <Select
                              value={nextStep}
                              onValueChange={(value: "No Call Yet" | "Call Completed" | "Meeting Completed") =>
                                handleColdCallTableStatusSelect(lead, nextStep, value)
                              }
                              disabled={!editable || isUpdating}
                            >
                              <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0">
                                <Badge variant="outline" className={getColdCallBadgeClass(nextStep)}>
                                  {isUpdating ? "Updating..." : nextStep}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="No Call Yet">No Call Yet</SelectItem>
                                <SelectItem value="Call Completed">Call Completed</SelectItem>
                                <SelectItem value="Meeting Completed">Meeting Completed</SelectItem>
                              </SelectContent>
                            </Select>
                          );
                        })()}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={stageBadgeClassMap[String(lead.stage).toUpperCase()] || ""}
                      >
                        {formatStageLabel(lead.stage)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(parseISO(lead.updatedAt), "MMM d")}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable && (
                        <div className="flex items-center justify-end gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" data-testid={`button-complete-task-${lead.id}`}>
                                <CheckSquare className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Complete Task</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleStatusChange(lead.id, "Initial Contact Done")}>
                                <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                                Mark Initial Contact Done
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Mail className="mr-2 h-4 w-4 text-blue-500" />
                                  Mark Email Sent
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuLabel>Next Email Follow-up</DropdownMenuLabel>
                                    {[2, 3, 4, 7].map(days => (
                                      <DropdownMenuItem key={days} onClick={() => handleStatusChange(lead.id, `Email Sent (Next: +${days}d)`)}>
                                        +{days} days
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem>Custom Date...</DropdownMenuItem>
                                  </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                              </DropdownMenuSub>

                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <MessageSquare className="mr-2 h-4 w-4 text-indigo-500" />
                                  Mark LinkedIn Sent
                                </DropdownMenuSubTrigger>
                                <DropdownMenuPortal>
                                  <DropdownMenuSubContent>
                                    <DropdownMenuLabel>Next Message Follow-up</DropdownMenuLabel>
                                    {[2, 3, 4, 7].map(days => (
                                      <DropdownMenuItem key={days} onClick={() => handleStatusChange(lead.id, `LinkedIn Sent (Next: +${days}d)`)}>
                                        +{days} days
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem>Custom Date...</DropdownMenuItem>
                                  </DropdownMenuSubContent>
                                </DropdownMenuPortal>
                              </DropdownMenuSub>

                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-lead-actions-${lead.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Lead Details</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link href={`/leads/${lead.id}`}>View Profile</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/leads/${lead.id}?edit=contact`}>Edit Details</Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>LinkedIn Connection</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => handleLinkedInStatusChange(lead, "SENT")}
                              >
                                <Linkedin className="mr-2 h-4 w-4 text-blue-600" />
                                Mark Connection Sent
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleLinkedInStatusChange(lead, "ACCEPTED")}
                              >
                                <Linkedin className="mr-2 h-4 w-4 text-emerald-600" />
                                Mark Connection Accepted
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>Change Stage</DropdownMenuLabel>
                              {availableStages.map(s => (
                                 <DropdownMenuItem key={s} onClick={() => handleStatusChange(lead.id, s)}>
                                   Move to {formatStageLabel(s)}
                                 </DropdownMenuItem>
                              ))}
                              {canDelete(lead) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => {
                                      setTimeout(() => setDeleteTarget(lead), 0);
                                    }}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Lead
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
          <div className="mt-4 text-xs text-muted-foreground text-center">
            Showing {filteredLeads.length} leads
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
