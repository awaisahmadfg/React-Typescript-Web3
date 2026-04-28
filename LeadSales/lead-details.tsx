import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Linkedin, Mail, ArrowLeft, Building2, Phone, StickyNote, History, ChevronDown, ChevronUp, Plus, Zap, CalendarClock, Trash2, Briefcase, Info } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { Role, Lead, ActivityTimeline, User, Team, Plan, ConnectionStatus } from "@/lib/types";
import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isPhoneValid, normalizePhoneForSave } from "@/lib/phone";
import { userBelongsToTeam } from "@/lib/team-utils";
import { availableStages } from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type LeadTask = {
  id: string;
  leadId: string;
  userId: string;
  type: string;
  status: string;
  priority: string;
  dueDate: string;
  notes?: string | null;
  createdAt?: string;
};

export default function LeadDetailsPage() {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, params] = useRoute("/leads/:id");
  const [, navigate] = useLocation();
  const leadId = params?.id;

  const { data: lead, isLoading: isLoadingLead } = useQuery<Lead>({
    queryKey: [`/api/leads/${leadId}`],
    enabled: !!leadId,
  });

  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });
  const { data: plansList = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });
  const { data: teamPlansForLead = [] } = useQuery<Plan[]>({
    queryKey: [`/api/teams/${lead?.teamId}/plans`],
    enabled: !!lead?.teamId,
  });
  const plansForDialog = lead?.teamId ? teamPlansForLead : plansList;

  const owner = usersList.find(u => u.id === lead?.ownerId);
  const team = teamsList.find((t) => t.id === lead?.teamId);
  // teamLeadId takes precedence; fall back to team's configured head
  const teamLead = usersList.find((u) => u.id === (lead?.teamLeadId || team?.leadId));
  const plan = plansList.find((p) => p.id === lead?.planId);

  const { data: timelineEntries = [], refetch: refetchTimeline } = useQuery<ActivityTimeline[]>({
    queryKey: [`/api/activity-timeline/${leadId}`],
    enabled: !!leadId,
  });
  const {
    data: leadTasks = [],
    isLoading: isLoadingLeadTasks,
    isError: isLeadTasksError,
    refetch: refetchLeadTasks,
  } = useQuery<LeadTask[]>({
    queryKey: [leadId ? `/api/tasks?leadId=${leadId}` : "/api/tasks"],
    enabled: !!leadId,
  });

  const [timelineFilter, setTimelineFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // Modal states
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isLinkedInOpen, setIsLinkedInOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isTeamAssignOpen, setIsTeamAssignOpen] = useState(false);
  const [isEditInfoOpen, setIsEditInfoOpen] = useState(false);
  const [editInfoErrors, setEditInfoErrors] = useState<Record<string, string>>({});
  const [isStageOpen, setIsStageOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isContactOptionsOpen, setIsContactOptionsOpen] = useState(false);
  const [selectedContactOptions, setSelectedContactOptions] = useState<string[]>([]);
  const [linkedinMessageType, setLinkedinMessageType] = useState<"conn" | "dm" | "inmail" | "accepted">("dm");
  const [emailActivityType, setEmailActivityType] = useState<"sent" | "replied">("sent");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailSummary, setEmailSummary] = useState("");
  const [callOutcome, setCallOutcome] = useState<"connected" | "voicemail" | "no-answer" | "meeting">("no-answer");
  const [callSummary, setCallSummary] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedStage, setSelectedStage] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [isOwnerAssignOpen, setIsOwnerAssignOpen] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [isTlAssignOpen, setIsTlAssignOpen] = useState(false);
  const [selectedTlId, setSelectedTlId] = useState("");

  const formatStageLabel = (stage: string) => {
    if (stage === "MEETING_SET") return "Meeting Set";
    return stage;
  };

  const [taskType, setTaskType] = useState<"EMAIL" | "LINKEDIN" | "CALL" | "OTHER">("EMAIL");
  const [taskTypeOther, setTaskTypeOther] = useState("");
  const [taskPriority, setTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [taskDueDate, setTaskDueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [taskNotes, setTaskNotes] = useState("");
  const [taskAssigneeId, setTaskAssigneeId] = useState<string>("");

  // Edit fields state
  const [editEmail, setEditEmail] = useState(lead?.email || "");
  const [editLinkedin, setEditLinkedin] = useState(lead?.linkedinUrl || "");
  const [editPhone, setEditPhone] = useState(lead?.phone || "");
  const [editCompany, setEditCompany] = useState(lead?.company || "");
  const [editSource, setEditSource] = useState(lead?.source || "");
  const [editTitle, setEditTitle] = useState(lead?.title || "");
  const [editValue, setEditValue] = useState(
    typeof lead?.value === "number" ? String(lead.value) : "",
  );
  const isEditPhoneValid = isPhoneValid(editPhone);
  const isEditValueValid = editValue.trim() === "" || /^\d+$/.test(editValue);

  useEffect(() => {
    if (isEditInfoOpen && lead) {
      setEditEmail(lead.email || "");
      setEditLinkedin(lead.linkedinUrl || "");
      setEditPhone(lead.phone || "");
      setEditCompany(lead.company || "");
      setEditSource(lead.source || "");
      setEditTitle(lead.title || "");
      setEditValue(typeof lead.value === "number" ? String(lead.value) : "");
    }
  }, [isEditInfoOpen, lead]);

  useEffect(() => {
    if (isStageOpen && lead) {
      setSelectedStage(lead.stage || "");
    }
  }, [isStageOpen, lead]);

  useEffect(() => {
    if (isPlanOpen && lead) {
      setSelectedPlanId(lead.planId || "");
    }
  }, [isPlanOpen, lead]);

  useEffect(() => {
    if (isOwnerAssignOpen && lead) {
      setSelectedOwnerId(lead.ownerId || "");
    }
  }, [isOwnerAssignOpen, lead]);

  useEffect(() => {
    if (isTlAssignOpen && lead) {
      setSelectedTlId(lead.teamLeadId || team?.leadId || "");
    }
  }, [isTlAssignOpen, lead, team?.leadId]);

  useEffect(() => {
    if (isContactOptionsOpen && lead) {
      setSelectedContactOptions(lead.contactOptions || []);
    }
  }, [isContactOptionsOpen, lead]);

  useEffect(() => {
    if (!leadId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "contact") {
      setIsEditInfoOpen(true);
    }
  }, [leadId]);

  useEffect(() => {
    if (!lead) return;
    setSelectedTeamId(lead.teamId || "");
  }, [lead?.id, lead?.teamId]);

  if (isLoadingLead) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!lead || !authUser) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold">Lead not found</h2>
        <Link href="/leads">
          <Button variant="link" className="mt-4">Back to Leads</Button>
        </Link>
      </div>
    );
  }

  // RBAC Checks
  const isSuperAdmin = authUser.role === Role.ADMIN;
  const isTeamLead = authUser.role === Role.TEAM_LEAD && userBelongsToTeam(authUser, lead.teamId);
  const isOwner = lead.ownerId === authUser.id;
  const canEdit = isSuperAdmin || isTeamLead || isOwner;
  const isCreator = lead.createdById === authUser.id;
  const canDeleteLead = isSuperAdmin || isTeamLead || isOwner || isCreator;
  const canReassignTeam = isSuperAdmin || isTeamLead;
  const activeContactOptions = lead.contactOptions || [];
  const showEmailAction = activeContactOptions.includes("email");
  const showLinkedInAction = activeContactOptions.includes("linkedin_connection");
  const showCallAction = activeContactOptions.includes("cold_call");
  const teamOptions = isSuperAdmin
    ? teamsList
    : teamsList.filter((candidateTeam) => authUser.teamIds?.includes(candidateTeam.id) || candidateTeam.id === authUser.teamId);

  // Users that the current user can assign this lead's tasks to.
  const assignableUsers = usersList.filter((u) => {
    if (!u.isActive) return false;
    if (u.role !== Role.AE && u.role !== Role.SDR && u.role !== Role.TEAM_LEAD) return false;
    if (isSuperAdmin) {
      return lead.teamId ? u.teamIds?.includes(lead.teamId) : true;
    }
    return userBelongsToTeam(u, authUser.teamId);
  });

  // Active TLs that can be set as the lead owner.
  // Any active team member for Owner reassignment
  const ownerCandidates = usersList.filter((u) => {
    if (!u.isActive || u.role === Role.ADMIN) return false;
    if (!lead.teamId) return true;
    return u.teamIds?.includes(lead.teamId) || u.teamId === lead.teamId;
  });

  // Active TLs in the lead's team for Team Lead reassignment
  const teamLeadCandidates = usersList.filter((u) => {
    if (!u.isActive || u.role !== Role.TEAM_LEAD) return false;
    if (!lead.teamId) return true;
    return u.teamIds?.includes(lead.teamId) || u.teamId === lead.teamId;
  });

  if (!isSuperAdmin && !isTeamLead && !isOwner) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">You don't have permission to view this lead.</p>
        <Link href="/dashboard">
          <Button variant="outline" className="mt-4">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredTimeline = timelineEntries
    .filter(at => {
      if (timelineFilter === "all") return true;
      if (timelineFilter === "emails") return at.type === "email" || at.type === "email_replied";
      if (timelineFilter === "linkedin") return at.type === "linkedin_message";
      if (timelineFilter === "notes") return at.type === "note";
      if (timelineFilter === "calls") return at.type === "call" || at.type === "meeting";
      if (timelineFilter === "status") return at.type === "status_change";
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.happenedAt).getTime();
      const dateB = new Date(b.happenedAt).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

  const touchpoints = timelineEntries.filter(at => at.type !== "status_change");
  const lastTouch = touchpoints.length > 0 ? touchpoints.sort((a,b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime())[0] : null;
  const displayTimeZone = authUser?.timezone || "Asia/Karachi";
  const formatTimelineDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: displayTimeZone,
    }).format(parsed);
  };
  const visibleLeadTasks = [...leadTasks].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.dueDate).getTime();
    const dateB = new Date(b.createdAt || b.dueDate).getTime();
    return dateB - dateA;
  });
  const linkedinSentCount = timelineEntries.filter(
    (entry) => entry.type === "linkedin_message" && entry.channel === "conn",
  ).length;
  const linkedinAcceptedCount = timelineEntries.filter(
    (entry) => entry.type === "linkedin_connection_accepted",
  ).length;
  // Use connectionStatus as the authoritative source for button gating.
  // Timeline counts are kept for informational tooltip only.
  // SENT = waiting for acceptance → only "Mark Accepted" enabled.
  // NONE or ACCEPTED = no pending request → only "Mark Sent" enabled.
  const canLogConnectionRequest = lead.connectionStatus !== ConnectionStatus.SENT;
  const canLogConnectionAccepted = lead.connectionStatus === ConnectionStatus.SENT;
  const linkedinCurrentLabel =
    lead.connectionStatus === ConnectionStatus.ACCEPTED
      ? "Connected"
      : lead.connectionStatus === ConnectionStatus.SENT
        ? "Request Sent"
        : "Not Connected";
  const linkedinNextActionLabel = canLogConnectionAccepted
    ? "Mark Connection Accepted"
    : "Send Connection Request";

  const logActivity = async (type: string, body: string, notes?: string, extra?: any) => {
    try {
      await fetch("/api/activity-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          teamId: lead.teamId || authUser.teamIds?.[0] || authUser.teamId || "global",
          createdByUserId: authUser.id,
          activityType: type,
          body,
          notes,
          ...extra
        })
      });
      refetchTimeline();
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
    } catch (error) {
      console.error("Failed to log activity", error);
    }
  };

  const stageRank = (stage: string | null | undefined) => {
    const normalized = String(stage || "").toUpperCase();
    if (normalized === "NEW") return 0;
    if (normalized === "CONTACTED") return 1;
    if (normalized === "MEETING_SET") return 2;
    // Treat later pipeline stages as more advanced than meeting set.
    return 3;
  };

  const maybeAutoAdvanceStage = async (targetStage: "CONTACTED" | "MEETING_SET", reason: string) => {
    if (!leadId) return;
    try {
      const currentLeadRes = await fetch(`/api/leads/${leadId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!currentLeadRes.ok) return;
      const currentLead = (await currentLeadRes.json()) as Lead;
      if (stageRank(currentLead.stage) >= stageRank(targetStage)) return;

      const patchRes = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!patchRes.ok) return;

      await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Stage Auto-updated",
        description: `Moved to ${formatStageLabel(targetStage)} after ${reason}.`,
      });
    } catch {
      // Non-blocking; outreach logging should still succeed.
    }
  };

  const handleConnectionSent = async () => {
    if (!canLogConnectionRequest) {
      if (lead.connectionStatus === ConnectionStatus.SENT) {
        toast({
          title: "LinkedIn Status",
          description: `LinkedIn connection for ${lead.firstName} ${lead.lastName} is already sent.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Already sent",
        description: "Mark connection accepted before sending another connection request.",
        variant: "destructive",
      });
      return;
    }
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionStatus: ConnectionStatus.SENT,
          connectionSentAt: new Date().toISOString(),
        }),
      });
      await logActivity("linkedin_message", "LinkedIn connection request sent", undefined, { channel: "conn" });
      await maybeAutoAdvanceStage("CONTACTED", "LinkedIn connection request");
      await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Connection Sent", description: "LinkedIn connection marked as sent." });
    } catch {
      toast({ title: "Error", description: "Failed to mark LinkedIn connection as sent.", variant: "destructive" });
    }
  };

  const handleConnectionAccepted = async () => {
    if (!canLogConnectionAccepted) {
      if (lead.connectionStatus === ConnectionStatus.ACCEPTED) {
        toast({
          title: "LinkedIn Status",
          description: `LinkedIn connection for ${lead.firstName} ${lead.lastName} is already accepted.`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Send connection first",
        description: "First log a connection request, then mark it as accepted.",
        variant: "destructive",
      });
      return;
    }
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionStatus: ConnectionStatus.ACCEPTED,
          connectionAcceptedAt: new Date().toISOString(),
        }),
      });
      await logActivity("linkedin_connection_accepted", "LinkedIn connection request accepted");
      await maybeAutoAdvanceStage("CONTACTED", "LinkedIn connection acceptance");
      await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Connection Accepted", description: "LinkedIn connection marked as accepted." });
    } catch {
      toast({ title: "Error", description: "Failed to mark LinkedIn connection as accepted.", variant: "destructive" });
    }
  };

  const handleStageChange = async (newStage: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to update stage");
      }
      await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Stage Updated", description: `Lead moved to ${formatStageLabel(newStage)}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update stage.", variant: "destructive" });
    }
  };

  const handleDeleteLead = async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to delete lead");
      }
      toast({ title: "Lead Deleted", description: `${lead.firstName} ${lead.lastName} has been deleted.` });
      navigate("/leads");
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete lead.", variant: "destructive" });
    }
    setIsDeleteOpen(false);
  };

  const handleSaveContactOptions = async () => {
    if (!leadId) return;
    try {
      const normalized = Array.from(new Set(selectedContactOptions));
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactOptions: normalized }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to update contact preferences");
      }
      await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({
        title: "Contact Preferences Updated",
        description: "Lead detail actions are now synced with selected channels.",
      });
      setIsContactOptionsOpen(false);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to update contact preferences.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {lead.firstName} {lead.lastName}? This will also remove all associated tasks and activity history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteLead(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/leads">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight break-words">{lead.firstName} {lead.lastName}</h1>
            <p className="text-muted-foreground mt-1">{lead.company} • {lead.title || "No title"}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-nowrap shrink-0">
          {showEmailAction && (
            <Dialog
              open={isEmailOpen}
              onOpenChange={(open) => {
                setIsEmailOpen(open);
                if (open) {
                  setEmailActivityType("sent");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2"><Mail className="w-4 h-4" /> Email</Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>Log Email Sent</DialogTitle>
                <DialogDescription>Record a touchpoint for an email sent to this lead.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Email Activity</Label>
                  <Select value={emailActivityType} onValueChange={(value: "sent" | "replied") => setEmailActivityType(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sent">Email Sent</SelectItem>
                      <SelectItem value="replied">Reply Received</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    placeholder="e.g. ROI Calculator Case Study"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{emailActivityType === "replied" ? "Reply Summary" : "Email Content Summary"}</Label>
                  <Textarea
                    placeholder="Summary of what was discussed..."
                    value={emailSummary}
                    onChange={(e) => setEmailSummary(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={async () => {
                  const normalizedSubject = emailSubject.trim();
                  const normalizedSummary = emailSummary.trim();
                  const subjectLabel = normalizedSubject ? `: ${normalizedSubject}` : "";
                  if (emailActivityType === "replied") {
                    await logActivity(
                      "email_replied",
                      `Email reply received${subjectLabel}`,
                      normalizedSummary || undefined,
                    );
                    await maybeAutoAdvanceStage("CONTACTED", "email reply");
                    toast({ title: "Reply Logged", description: "Email reply recorded in timeline." });
                  } else {
                    await logActivity(
                      "email",
                      `Email sent${subjectLabel}`,
                      normalizedSummary || undefined,
                    );
                    await maybeAutoAdvanceStage("CONTACTED", "email outreach");
                    toast({ title: "Email Logged", description: "Sent email recorded in timeline." });
                  }

                  setEmailActivityType("sent");
                  setEmailSubject("");
                  setEmailSummary("");
                  setIsEmailOpen(false);
                }}>Save Activity</Button>
              </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {showLinkedInAction && (
            <Dialog
              open={isLinkedInOpen}
              onOpenChange={(open) => {
                setIsLinkedInOpen(open);
                if (open) {
                  setLinkedinMessageType(
                    canLogConnectionRequest ? "conn" : canLogConnectionAccepted ? "accepted" : "dm",
                  );
                }
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2"><Linkedin className="w-4 h-4" /> Message</Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>Log LinkedIn Message</DialogTitle>
                <DialogDescription>Record a LinkedIn outreach touchpoint.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Message Type</Label>
                  <Select value={linkedinMessageType} onValueChange={(value: "conn" | "dm" | "inmail" | "accepted") => setLinkedinMessageType(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conn">Connection Request</SelectItem>
                      <SelectItem value="accepted">Connection Request Accepted</SelectItem>
                      <SelectItem value="dm">Direct Message</SelectItem>
                      <SelectItem value="inmail">InMail</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Message Content</Label>
                  <Textarea placeholder="Paste or summarize the message..." />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={async () => {
                  if (linkedinMessageType === "conn" && !canLogConnectionRequest) {
                    toast({
                      title: "Already sent",
                      description: "Mark connection accepted before sending another connection request.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (linkedinMessageType === "accepted" && !canLogConnectionAccepted) {
                    toast({
                      title: "Send connection first",
                      description: "First log a connection request, then mark it as accepted.",
                      variant: "destructive",
                    });
                    return;
                  }
                  const bodyByType: Record<"conn" | "dm" | "inmail" | "accepted", string> = {
                    conn: "Logged LinkedIn connection request",
                    accepted: "LinkedIn connection request accepted",
                    dm: "Logged LinkedIn direct message",
                    inmail: "Logged LinkedIn InMail",
                  };
                  if (linkedinMessageType === "accepted") {
                    await handleConnectionAccepted();
                    setIsLinkedInOpen(false);
                    return;
                  }
                  if (linkedinMessageType === "conn") {
                    await handleConnectionSent();
                    setIsLinkedInOpen(false);
                    return;
                  }
                  await logActivity(
                    "linkedin_message",
                    bodyByType[linkedinMessageType],
                    undefined,
                    { channel: linkedinMessageType },
                  );
                  await maybeAutoAdvanceStage("CONTACTED", "LinkedIn outreach");
                  toast({ title: "Message Logged", description: "Activity recorded in timeline." });
                  setIsLinkedInOpen(false);
                }}>Save Activity</Button>
              </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2"><StickyNote className="w-4 h-4" /> Note</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Internal Note</DialogTitle>
                <DialogDescription>Add a note for yourself or your team regarding this lead.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Note Category</Label>
                  <Select defaultValue="internal">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">General Internal</SelectItem>
                      <SelectItem value="strategy">Outreach Strategy</SelectItem>
                      <SelectItem value="objection">Objection Handling</SelectItem>
                      <SelectItem value="qualification">Qualification Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Note Content</Label>
                  <Textarea placeholder="Enter your note here..." />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => {
                  logActivity("note", "Added internal note");
                  toast({ title: "Note Added", description: "Internal note saved." });
                  setIsNoteOpen(false);
                }}>Save Note</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {showCallAction && (
            <Dialog open={isCallOpen} onOpenChange={setIsCallOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2"><Phone className="w-4 h-4" /> Call</Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>Log Call/Meeting</DialogTitle>
                <DialogDescription>Record the details of a phone call or meeting.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Outcome</Label>
                  <Select value={callOutcome} onValueChange={(value: "connected" | "voicemail" | "no-answer" | "meeting") => setCallOutcome(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="connected">Connected / Spoke</SelectItem>
                      <SelectItem value="voicemail">Left Voicemail</SelectItem>
                      <SelectItem value="no-answer">No Answer</SelectItem>
                      <SelectItem value="meeting">Meeting Held</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Conversation Summary</Label>
                  <Textarea
                    placeholder="Summary of what was discussed..."
                    value={callSummary}
                    onChange={(e) => setCallSummary(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={async () => {
                  const bodyByOutcome: Record<"connected" | "voicemail" | "no-answer" | "meeting", string> = {
                    connected: "Cold call connected",
                    voicemail: "Cold call attempt: left voicemail",
                    "no-answer": "Cold call attempt: no answer",
                    meeting: "Call led to meeting",
                  };
                  const activityType = callOutcome === "meeting" ? "meeting" : "call";
                  await logActivity(activityType, bodyByOutcome[callOutcome], callSummary.trim() || undefined);
                  await maybeAutoAdvanceStage(
                    callOutcome === "meeting" ? "MEETING_SET" : "CONTACTED",
                    callOutcome === "meeting" ? "meeting outcome" : "cold call activity",
                  );
                  toast({ title: "Call Logged", description: "Activity recorded in timeline." });
                  setCallOutcome("no-answer");
                  setCallSummary("");
                  setIsCallOpen(false);
                }}>Save Activity</Button>
              </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canEdit && (
            <Dialog open={isContactOptionsOpen} onOpenChange={setIsContactOptionsOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-2">
                  <Info className="w-4 h-4" />
                  Channels
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Contact Preferences</DialogTitle>
                  <DialogDescription>
                    Choose which outreach channels should appear on this lead detail page and lead table.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-3">
                  {[
                    { key: "email", label: "Email" },
                    { key: "linkedin_connection", label: "LinkedIn Message" },
                    { key: "cold_call", label: "Call" },
                  ].map((option) => (
                    <label key={option.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300"
                        checked={selectedContactOptions.includes(option.key)}
                        onChange={(e) =>
                          setSelectedContactOptions((prev) =>
                            e.target.checked
                              ? [...prev, option.key]
                              : prev.filter((selected) => selected !== option.key),
                          )
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <DialogFooter>
                  <Button className="w-full" onClick={handleSaveContactOptions}>
                    Save Preferences
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {canDeleteLead && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive hover:border-destructive"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards — 4-column, 2 rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Current Stage */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Current Stage</p>
          <Badge className="mt-1">{formatStageLabel(lead.stage)}</Badge>
          {canEdit && (
            <Dialog open={isStageOpen} onOpenChange={setIsStageOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 mt-1 text-xs underline">
                  Change Stage
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Pipeline Stage</DialogTitle>
                  <DialogDescription>Move this lead to a different stage in the pipeline.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-3">
                  <Label>Stage</Label>
                  <Select value={selectedStage} onValueChange={setSelectedStage}>
                    <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                    <SelectContent>
                      {availableStages.map((stage) => (
                        <SelectItem key={stage} value={stage}>{formatStageLabel(stage)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    className="w-full"
                    disabled={!selectedStage || selectedStage === lead.stage}
                    onClick={async () => {
                      await handleStageChange(selectedStage);
                      setIsStageOpen(false);
                    }}
                  >
                    Save Stage
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </Card>

        {/* Touchpoints */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Touchpoints</p>
          <p className="text-2xl font-bold text-primary">{touchpoints.length}</p>
        </Card>

        {/* Last Touch */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Last Touch</p>
          <p className="text-sm font-bold truncate w-full">
            {lastTouch ? format(parseISO(lastTouch.happenedAt), "MMM d") : "None"}
          </p>
        </Card>

        {/* LinkedIn Status */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase">LinkedIn Status</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px] whitespace-pre-line text-left">
                  {`Current: ${linkedinCurrentLabel}
Next action available: ${linkedinNextActionLabel}
Cycle counters - Sent: ${linkedinSentCount}, Accepted: ${linkedinAcceptedCount}`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {lead.connectionStatus === ConnectionStatus.ACCEPTED ? (
            <Badge className="mt-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">Accepted</Badge>
          ) : lead.connectionStatus === ConnectionStatus.SENT ? (
            <Badge variant="outline" className="mt-1 text-blue-600 border-blue-200 bg-blue-50">Sent</Badge>
          ) : (
            <Badge variant="outline" className="mt-1 text-muted-foreground">Not Sent</Badge>
          )}
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 mt-1 text-xs underline">
                  Update Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuLabel>LinkedIn Connection</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleConnectionSent}>
                  <Linkedin className="mr-2 h-4 w-4 text-blue-600" />
                  Mark Connection Sent
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleConnectionAccepted}>
                  <Linkedin className="mr-2 h-4 w-4 text-emerald-600" />
                  Mark Connection Accepted
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </Card>

        {/* Assigned Team */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Assigned Team</p>
          <Badge variant="outline" className="mt-1">{team?.name || "Unassigned"}</Badge>
          {canReassignTeam && (
            <Dialog open={isTeamAssignOpen} onOpenChange={setIsTeamAssignOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 mt-1 text-xs underline">
                  Reassign Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reassign Team</DialogTitle>
                  <DialogDescription>
                    Assign this lead to a team. Team lead owner mapping will be aligned automatically.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-3">
                  <Label>Team</Label>
                  <Select value={selectedTeamId || "__none__"} onValueChange={(value) => setSelectedTeamId(value === "__none__" ? "" : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {teamOptions.map((candidateTeam) => (
                        <SelectItem key={candidateTeam.id} value={candidateTeam.id}>
                          {candidateTeam.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    className="w-full"
                    disabled={!selectedTeamId}
                    onClick={async () => {
                      if (!leadId || !selectedTeamId) return;
                      try {
                        const selectedTeam = teamsList.find((candidateTeam) => candidateTeam.id === selectedTeamId);
                        const currentOwner = usersList.find((candidateUser) => candidateUser.id === lead.ownerId);
                        const currentOwnerMatchesTeam =
                          !!currentOwner &&
                          currentOwner.role === Role.TEAM_LEAD &&
                          (userBelongsToTeam(currentOwner, selectedTeamId) ||
                            selectedTeam?.leadId === currentOwner.id);
                        const nextOwnerId = currentOwnerMatchesTeam
                          ? lead.ownerId
                          : selectedTeam?.leadId;

                        if (!nextOwnerId) {
                          throw new Error("Selected team has no configured team lead to assign as owner.");
                        }

                        const res = await fetch(`/api/leads/${leadId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            teamId: selectedTeamId,
                            ownerId: nextOwnerId,
                          }),
                        });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          throw new Error(data?.message || "Failed to update team assignment");
                        }
                        await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
                        await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                        toast({
                          title: "Team Updated",
                          description: "Lead team assignment has been updated.",
                        });
                        setIsTeamAssignOpen(false);
                      } catch (err: any) {
                        toast({
                          title: "Error",
                          description: err?.message || "Failed to update team assignment.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Save Team
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </Card>

        {/* Assigned Plan */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Assigned Plan</p>
          <Badge variant="outline" className="mt-1">{plan?.name || "No Plan"}</Badge>
          {(isSuperAdmin || isTeamLead) && (
            <Dialog open={isPlanOpen} onOpenChange={setIsPlanOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 mt-1 text-xs underline">
                  Change Plan
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Assigned Plan</DialogTitle>
                  <DialogDescription>Assign a sales engagement plan to this lead.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-3">
                  <Label>Plan</Label>
                  <Select value={selectedPlanId || "__none__"} onValueChange={(value) => setSelectedPlanId(value === "__none__" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No Plan</SelectItem>
                      {plansForDialog.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    className="w-full"
                    onClick={async () => {
                      if (!leadId) return;
                      try {
                        const res = await fetch(`/api/leads/${leadId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ planId: selectedPlanId || null }),
                        });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          throw new Error(data?.message || "Failed to update plan");
                        }
                        await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
                        await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                        toast({ title: "Plan Updated", description: "Lead plan assignment has been updated." });
                        setIsPlanOpen(false);
                      } catch (err: any) {
                        toast({ title: "Error", description: err?.message || "Failed to update plan.", variant: "destructive" });
                      }
                    }}
                  >
                    Save Plan
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </Card>

        {/* Owner */}
        {/* Owner — any active team member, editable by admin/TL */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Owner</p>
          <p className="text-sm font-bold truncate w-full">{owner?.name || (lead as any).ownerName || "Unassigned"}</p>
          {(isSuperAdmin || isTeamLead) && (
            <Dialog open={isOwnerAssignOpen} onOpenChange={setIsOwnerAssignOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 mt-1 text-xs underline">
                  Reassign
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reassign Owner</DialogTitle>
                  <DialogDescription>Assign any active team member to look after this lead.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-3">
                  <Label>Owner</Label>
                  <Select value={selectedOwnerId || "__none__"} onValueChange={(v) => setSelectedOwnerId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                    <SelectContent>
                      {ownerCandidates.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name} — {u.role}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    className="w-full"
                    disabled={!selectedOwnerId || selectedOwnerId === lead.ownerId}
                    onClick={async () => {
                      if (!leadId || !selectedOwnerId) return;
                      try {
                        const res = await fetch(`/api/leads/${leadId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ ownerId: selectedOwnerId }),
                        });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          throw new Error(data?.message || "Failed to reassign owner");
                        }
                        await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
                        await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                        toast({ title: "Owner Updated", description: "Lead owner has been updated." });
                        setIsOwnerAssignOpen(false);
                      } catch (err: any) {
                        toast({ title: "Error", description: err?.message || "Failed to reassign owner.", variant: "destructive" });
                      }
                    }}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </Card>

        {/* Team Lead — active TL responsible for this lead, editable by admin/TL */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Team Lead</p>
          <p className="text-sm font-bold truncate w-full">{teamLead?.name || "Unassigned"}</p>
          {(isSuperAdmin || isTeamLead) && (
            <Dialog open={isTlAssignOpen} onOpenChange={setIsTlAssignOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 mt-1 text-xs underline">
                  Reassign
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reassign Team Lead</DialogTitle>
                  <DialogDescription>Assign a team lead responsible for this lead.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-3">
                  <Label>Team Lead</Label>
                  <Select value={selectedTlId || "__none__"} onValueChange={(v) => setSelectedTlId(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select team lead" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {teamLeadCandidates.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button
                    className="w-full"
                    disabled={selectedTlId === (lead.teamLeadId || team?.leadId || "")}
                    onClick={async () => {
                      if (!leadId) return;
                      try {
                        const res = await fetch(`/api/leads/${leadId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ teamLeadId: selectedTlId || null }),
                        });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          throw new Error(data?.message || "Failed to reassign team lead");
                        }
                        await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
                        await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                        toast({ title: "Team Lead Updated", description: "Lead team lead has been updated." });
                        setIsTlAssignOpen(false);
                      } catch (err: any) {
                        toast({ title: "Error", description: err?.message || "Failed to reassign team lead.", variant: "destructive" });
                      }
                    }}
                  >
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </Card>

        {/* Created By */}
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Created By</p>
          <p className="text-sm font-bold truncate w-full">
            {usersList.find(u => u.id === lead.createdById)?.name || "—"}
          </p>
          {lead.createdAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(lead.createdAt), "MMM d, yyyy")}
            </p>
          )}
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg">Activity Journey</CardTitle>
              <CardDescription>Timeline of all interactions</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Activities</SelectItem>
                  <SelectItem value="emails">Emails</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="notes">Notes</SelectItem>
                  <SelectItem value="calls">Calls</SelectItem>
                  <SelectItem value="status">Status Changes</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSortOrder(prev => prev === "newest" ? "oldest" : "newest")}
              >
                <History className={cn("w-4 h-4 transition-transform", sortOrder === "oldest" && "rotate-180")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="relative space-y-6 before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {filteredTimeline.map((item) => {
                const creator = usersList.find(u => u.id === item.createdByUserId);
                const isExpanded = expandedItems[item.id];

                let Icon = History;
                let colorClass = "bg-slate-100 text-slate-600";

                if (item.type === "email") { Icon = Mail; colorClass = "bg-blue-100 text-blue-600"; }
                if (item.type === "email_replied") { Icon = Mail; colorClass = "bg-emerald-100 text-emerald-700"; }
                if (item.type === "linkedin_message") { Icon = Linkedin; colorClass = "bg-[#0077b5]/10 text-[#0077b5]"; }
                if (item.type === "note") { Icon = StickyNote; colorClass = "bg-amber-100 text-amber-600"; }
                if (item.type === "call") { Icon = Phone; colorClass = "bg-green-100 text-green-600"; }
                if (item.type === "status_change") { Icon = Zap; colorClass = "bg-purple-100 text-purple-600"; }

                return (
                  <div key={item.id} className="relative flex items-start gap-4 group">
                    <div className={cn("absolute left-0 mt-0.5 ml-4 -translate-x-1/2 w-8 h-8 rounded-full border-4 border-background flex items-center justify-center z-10 shadow-sm", colorClass)}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 ml-10 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div>
                          <span className="text-sm font-bold capitalize">{item.type?.replace("_", " ")}</span>
                          <span className="text-xs text-muted-foreground ml-2">by {creator?.name}</span>
                        </div>
                        <time className="text-[10px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full">
                          {item.happenedAt ? formatTimelineDateTime(item.happenedAt) : "N/A"}
                        </time>
                      </div>
                      <Card className={cn("transition-all duration-200 hover:shadow-md", isExpanded ? "border-primary/20 bg-primary/[0.01]" : "border-border/50")}>
                        <CardContent className="p-3">
                          <p className={cn("text-sm text-foreground", !isExpanded && "line-clamp-2")}>{item.body}</p>
                          {isExpanded && item.notes && (
                            <div className="mt-3 pt-3 border-t border-dashed">
                              <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Internal Notes</p>
                              <p className="text-xs italic text-muted-foreground">{item.notes}</p>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full h-6 mt-2 text-[10px] text-muted-foreground hover:text-primary gap-1"
                            onClick={() => toggleExpand(item.id)}
                          >
                            {isExpanded ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> View Details</>}
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                );
              })}
              {filteredTimeline.length === 0 && (
                <div className="text-center py-12 ml-10 text-muted-foreground italic text-sm border-2 border-dashed rounded-lg">
                  No activity found for this lead.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Quick Info</CardTitle>
              <Dialog open={isEditInfoOpen} onOpenChange={(open) => { setIsEditInfoOpen(open); if (!open) setEditInfoErrors({}); }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-xs underline">Edit</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Quick Info</DialogTitle>
                    <DialogDescription>
                      Update contact and company details for {lead.firstName}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
                      <Input
                        id="edit-linkedin"
                        value={editLinkedin}
                        onChange={(e) => setEditLinkedin(e.target.value)}
                        placeholder="https://linkedin.com/in/username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-phone">Phone Number</Label>
                      <PhoneInput
                        id="edit-phone"
                        value={editPhone}
                        onChange={(value) => setEditPhone(value)}
                        placeholder="+1 (555) 000-0000"
                      />
                      {!isEditPhoneValid && (
                        <p className="text-xs text-destructive">
                          Enter a valid phone number with country code (e.g. +92...).
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-title">Job Title</Label>
                      <Input
                        id="edit-title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Sales Director"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-company">Company <span className="text-destructive">*</span></Label>
                      <Input
                        id="edit-company"
                        value={editCompany}
                        className={editInfoErrors.company ? "border-destructive" : ""}
                        onChange={(e) => { setEditCompany(e.target.value); if (editInfoErrors.company) setEditInfoErrors(p => ({...p, company: ""})); }}
                        placeholder="Company name"
                      />
                      {editInfoErrors.company && <p className="text-xs text-destructive">{editInfoErrors.company}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-source">Source <span className="text-destructive">*</span></Label>
                      <Input
                        id="edit-source"
                        value={editSource}
                        className={editInfoErrors.source ? "border-destructive" : ""}
                        onChange={(e) => { setEditSource(e.target.value); if (editInfoErrors.source) setEditInfoErrors(p => ({...p, source: ""})); }}
                        placeholder="LinkedIn / Referral / Website"
                      />
                      {editInfoErrors.source && <p className="text-xs text-destructive">{editInfoErrors.source}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-value">Value</Label>
                      <Input
                        id="edit-value"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={editValue}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "" || /^\d+$/.test(raw)) {
                            setEditValue(raw);
                          }
                        }}
                        placeholder="5000"
                      />
                      {!isEditValueValid && (
                        <p className="text-xs text-destructive">
                          Value must contain digits only.
                        </p>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      className="w-full"
                      disabled={!isEditPhoneValid || !isEditValueValid}
                      onClick={async () => {
                        if (!leadId) return;

                        const currentEmail = lead.email || "";
                        const currentLinkedin = lead.linkedinUrl || "";
                        const currentPhone = lead.phone || "";
                        const currentTitle = lead.title || "";
                        const currentCompany = lead.company || "";
                        const currentSource = lead.source || "";
                        const currentValue = typeof lead.value === "number" ? String(lead.value) : "";
                        const normalizedPhone = normalizePhoneForSave(editPhone);

                        const errs: Record<string, string> = {};
                        if (editPhone !== currentPhone && editPhone.trim().length > 0 && !normalizedPhone) errs.phone = "Enter a valid phone number with country code.";
                        if (editCompany !== currentCompany && !editCompany.trim()) errs.company = "Company is required.";
                        if (editSource !== currentSource && !editSource.trim()) errs.source = "Source is required.";
                        if (editValue !== currentValue && (!editValue.trim() || !/^\d+$/.test(editValue))) errs.value = "Value must be a non-negative number.";
                        if (Object.keys(errs).length > 0) { setEditInfoErrors(errs); return; }
                        setEditInfoErrors({});

                        try {
                          const updates: Partial<Lead> = {};
                          if (editEmail !== currentEmail) updates.email = editEmail || null;
                          if (editLinkedin !== currentLinkedin) updates.linkedinUrl = editLinkedin || null;
                          if (editPhone !== currentPhone) updates.phone = normalizedPhone;
                          if (editTitle !== currentTitle) updates.title = editTitle.trim() || null;
                          if (editCompany !== currentCompany) updates.company = editCompany.trim();
                          if (editSource !== currentSource) updates.source = editSource.trim();
                          if (editValue !== currentValue) updates.value = Number(editValue);

                          if (Object.keys(updates).length === 0) { setIsEditInfoOpen(false); return; }

                          const res = await fetch(`/api/leads/${leadId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(updates),
                          });

                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            throw new Error(data?.message || "Failed to update lead");
                          }

                          await queryClient.invalidateQueries({ queryKey: [`/api/leads/${leadId}`] });
                          await queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
                          toast({ title: "Contact Info Updated", description: "The lead's contact details have been saved." });
                          setIsEditInfoOpen(false);
                        } catch (err: any) {
                          toast({ title: "Error", description: err?.message || "Failed to update lead contact info.", variant: "destructive" });
                        }
                      }}
                    >
                      Save Changes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Email</p>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  <a href={`mailto:${lead.email || lead.id + "@example.com"}`} className="text-sm font-medium hover:underline truncate block">
                    {lead.email || `${lead.id}@example.com`}
                  </a>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">LinkedIn</p>
                <div className="flex items-center gap-2">
                  <Linkedin className="w-3.5 h-3.5 text-[#0077b5]" />
                  {lead.linkedinUrl ? (
                    <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline truncate block">View Profile</a>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No profile linked</span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Phone</p>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-green-600" />
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="text-sm font-medium hover:underline truncate block">{lead.phone}</a>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">No phone added</span>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Job Title</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                  {lead.title || <span className="text-muted-foreground italic">No title</span>}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Company</p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                  {lead.company}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Source</p>
                <div className="text-sm font-medium">{lead.source || "-"}</div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Value</p>
                <div className="text-sm font-medium">
                  {typeof lead.value === "number" ? lead.value.toLocaleString() : "-"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tasks</CardTitle>
              <Dialog
                open={isTaskOpen}
                onOpenChange={(open) => {
                  setIsTaskOpen(open);
                  if (open) {
                    const selfAssignable = assignableUsers.find((u) => u.id === authUser.id);
                    setTaskAssigneeId(
                      selfAssignable?.id || assignableUsers[0]?.id || authUser.id,
                    );
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6"><Plus className="w-4 h-4" /></Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Task</DialogTitle>
                    <DialogDescription>Schedule a new action for this lead.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Assign To</Label>
                      <Select
                        value={taskAssigneeId}
                        onValueChange={setTaskAssigneeId}
                        disabled={assignableUsers.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                              {u.id === authUser.id ? " (You)" : ""} — {u.role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Task Type</Label>
                      <Select value={taskType} onValueChange={(val) => setTaskType(val as typeof taskType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EMAIL">Email Follow-up</SelectItem>
                          <SelectItem value="LINKEDIN">LinkedIn Message</SelectItem>
                          <SelectItem value="CALL">Phone Call</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      {taskType === "OTHER" && (
                        <Input
                          placeholder="Enter custom task type"
                          value={taskTypeOther}
                          onChange={(e) => setTaskTypeOther(e.target.value)}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={taskDueDate}
                        onChange={(e) => setTaskDueDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select
                        value={taskPriority}
                        onValueChange={(val: "LOW" | "MEDIUM" | "HIGH") => setTaskPriority(val)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="What needs to be done?"
                        value={taskNotes}
                        onChange={(e) => setTaskNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      className="w-full"
                      onClick={async () => {
                        if (!leadId || !authUser) return;
                        if (taskType === "OTHER" && !taskTypeOther.trim()) {
                          toast({
                            title: "Error",
                            description: "Please enter the custom task type.",
                            variant: "destructive",
                          });
                          return;
                        }
                        try {
                          const resolvedTaskType =
                            taskType === "EMAIL"
                              ? "Email Follow-up"
                              : taskType === "LINKEDIN"
                              ? "LinkedIn Message"
                              : taskType === "CALL"
                              ? "Phone Call"
                              : taskTypeOther.trim();
                          const res = await fetch("/api/tasks", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              leadId,
                              userId: taskAssigneeId || authUser.id,
                              type: resolvedTaskType,
                              priority: taskPriority,
                              dueDate: taskDueDate,
                              notes: taskNotes || undefined,
                            }),
                          });

                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            throw new Error(data?.message || "Failed to create task");
                          }

                          queryClient.invalidateQueries({
                            queryKey: [authUser ? `/api/tasks?userId=${authUser.id}` : "/api/tasks"],
                          });
                          queryClient.invalidateQueries({
                            queryKey: [leadId ? `/api/tasks?leadId=${leadId}` : "/api/tasks"],
                          });
                          await refetchLeadTasks();
                          await refetchTimeline();

                          toast({ title: "Task Created", description: "New task has been scheduled." });
                          setIsTaskOpen(false);
                          setTaskType("EMAIL");
                          setTaskTypeOther("");
                          setTaskPriority("MEDIUM");
                          setTaskDueDate(format(new Date(), "yyyy-MM-dd"));
                          setTaskNotes("");
                        } catch (err: any) {
                          toast({
                            title: "Error",
                            description: err?.message || "Failed to create task.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Create Task
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoadingLeadTasks ? (
                <div className="p-3 border rounded-lg bg-muted/20 text-xs text-muted-foreground text-center italic">
                  Loading tasks...
                </div>
              ) : isLeadTasksError ? (
                <div className="p-3 border rounded-lg bg-destructive/10 text-xs text-destructive text-center">
                  Failed to load tasks for this lead.
                </div>
              ) : visibleLeadTasks.length === 0 ? (
                <div className="p-3 border rounded-lg bg-muted/20 text-xs text-muted-foreground text-center italic">
                  No tasks found for this lead.
                </div>
              ) : (
                visibleLeadTasks.map((task) => (
                  <div key={task.id} className="p-3 border rounded-lg bg-muted/20">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold">{
                        task.type === "EMAIL" ? "Email Follow-up" :
                        task.type === "LINKEDIN" ? "LinkedIn Connection Request" :
                        task.type === "CALL" ? "Phone Call" :
                        task.type === "OTHER" ? "Other" :
                        task.type
                      }</p>
                      <Badge variant={task.status === "COMPLETED" ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                        {task.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        {format(parseISO(task.dueDate), "MMM d")}
                      </span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {task.priority}
                      </Badge>
                    </div>
                    {task.notes ? <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{task.notes}</p> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
