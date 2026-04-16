import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Linkedin, Mail, ArrowLeft, Building2, Phone, StickyNote, History, ChevronDown, ChevronUp, Plus, Zap, CalendarClock } from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { Role, Lead, ActivityTimeline, User, Team, Plan } from "@/lib/types";
import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isPhoneValid, normalizePhoneForSave } from "@/lib/phone";

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

  const owner = usersList.find(u => u.id === lead?.ownerId);
  const team = teamsList.find((t) => t.id === lead?.teamId);
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
  
  // Modal states for auto-closing
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isLinkedInOpen, setIsLinkedInOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isTeamAssignOpen, setIsTeamAssignOpen] = useState(false);
  const [isEditInfoOpen, setIsEditInfoOpen] = useState(false);
  const [linkedinMessageType, setLinkedinMessageType] = useState<"conn" | "dm" | "inmail">("dm");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const formatStageLabel = (stage: string) => {
    if (stage === "MEETING_SET") return "Meeting Set";
    return stage;
  };

  const [taskType, setTaskType] = useState<"EMAIL" | "LINKEDIN" | "CALL">("EMAIL");
  const [taskPriority, setTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [taskDueDate, setTaskDueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [taskNotes, setTaskNotes] = useState("");

  // Edit fields state
  const [editEmail, setEditEmail] = useState(lead?.email || "");
  const [editLinkedin, setEditLinkedin] = useState(lead?.linkedinUrl || "");
  const [editPhone, setEditPhone] = useState(lead?.phone || "");
  const [editCompany, setEditCompany] = useState(lead?.company || "");
  const [editSource, setEditSource] = useState(lead?.source || "");
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
      setEditValue(typeof lead.value === "number" ? String(lead.value) : "");
    }
  }, [isEditInfoOpen, lead]);

  useEffect(() => {
    if (!leadId) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "contact") {
      setIsEditInfoOpen(true);
    }
  }, [leadId]);

  useEffect(() => {
    // Once a connection is accepted, connection request logging is no longer valid for this lead.
    if (lead?.connectionStatus === "ACCEPTED" && linkedinMessageType === "conn") {
      setLinkedinMessageType("dm");
    }
  }, [lead?.connectionStatus, linkedinMessageType]);

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
  const isTeamLead = authUser.role === Role.TEAM_LEAD && lead.teamId === authUser.teamId;
  const isOwner = lead.ownerId === authUser.id;
  const canReassignTeam = isSuperAdmin || isTeamLead;
  const teamOptions = isSuperAdmin
    ? teamsList
    : teamsList.filter((candidateTeam) => candidateTeam.id === authUser.teamId);

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
      if (timelineFilter === "emails") return at.type === "email";
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
  const formatTimelineDateTime = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "N/A";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      // activity_timeline currently stores timestamp without timezone, and API serializes
      // it as ISO(Z). Rendering with UTC avoids the +5h double-shift for current data.
      timeZone: "UTC",
    }).format(parsed);
  };
  const visibleLeadTasks = [...leadTasks].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.dueDate).getTime();
    const dateB = new Date(b.createdAt || b.dueDate).getTime();
    return dateB - dateA;
  });

  const logActivity = async (type: string, body: string, notes?: string, extra?: any) => {
    try {
      await fetch("/api/activity-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          teamId: lead.teamId || authUser.teamId || "global",
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/leads">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{lead.firstName} {lead.lastName}</h1>
            <p className="text-muted-foreground mt-1">{lead.company} • {lead.title}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={isEmailOpen} onOpenChange={setIsEmailOpen}>
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
                  <Label>Subject</Label>
                  <Input placeholder="e.g. ROI Calculator Case Study" />
                </div>
                <div className="space-y-2">
                  <Label>Email Content Summary</Label>
                  <Textarea placeholder="Summary of what was discussed..." />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => {
                  logActivity("email", "Logged email activity");
                  toast({ title: "Email Logged", description: "Activity recorded in timeline." });
                  setIsEmailOpen(false);
                }}>Save Activity</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isLinkedInOpen} onOpenChange={setIsLinkedInOpen}>
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
                  <Select value={linkedinMessageType} onValueChange={(value: "conn" | "dm" | "inmail") => setLinkedinMessageType(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {lead.connectionStatus !== "ACCEPTED" && (
                        <SelectItem value="conn">Connection Request</SelectItem>
                      )}
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
                <Button className="w-full" onClick={() => {
                  if (linkedinMessageType === "conn" && lead.connectionStatus === "ACCEPTED") {
                    toast({
                      title: "Already accepted",
                      description: "Connection request is already accepted for this lead. Log DM or InMail instead.",
                    });
                    return;
                  }
                  const bodyByType: Record<"conn" | "dm" | "inmail", string> = {
                    conn: "Logged LinkedIn connection request",
                    dm: "Logged LinkedIn direct message",
                    inmail: "Logged LinkedIn InMail",
                  };
                  logActivity("linkedin_message", bodyByType[linkedinMessageType], undefined, { channel: linkedinMessageType });
                  toast({ title: "Message Logged", description: "Activity recorded in timeline." });
                  setIsLinkedInOpen(false);
                }}>Save Activity</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                  <Select defaultValue="no-answer">
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
                  <Textarea placeholder="Summary of what was discussed..." />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={() => {
                  logActivity("call", "Logged call activity");
                  toast({ title: "Call Logged", description: "Activity recorded in timeline." });
                  setIsCallOpen(false);
                }}>Save Activity</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Current Stage</p>
          <Badge className="mt-1">{formatStageLabel(lead.stage)}</Badge>
        </Card>
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Touchpoints</p>
          <p className="text-2xl font-bold text-primary">{touchpoints.length}</p>
        </Card>
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Last Touch</p>
          <p className="text-sm font-bold truncate w-full">
            {lastTouch ? format(parseISO(lastTouch.happenedAt), "MMM d") : "None"}
          </p>
        </Card>
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
                          (currentOwner.teamId === selectedTeamId ||
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
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Assigned Plan</p>
          <Badge variant="outline" className="mt-1">{plan?.name || "No Plan"}</Badge>
        </Card>
        <Card className="p-4 flex flex-col items-center justify-center text-center">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Owner</p>
          <p className="text-sm font-bold truncate w-full">{(lead as any).ownerName || owner?.name || "Unassigned"}</p>
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
              <Dialog open={isEditInfoOpen} onOpenChange={setIsEditInfoOpen}>
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
                      <Label htmlFor="edit-company">Company</Label>
                      <Input
                        id="edit-company"
                        value={editCompany}
                        onChange={(e) => setEditCompany(e.target.value)}
                        placeholder="Company name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-source">Source</Label>
                      <Input
                        id="edit-source"
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        placeholder="LinkedIn / Referral / Website"
                      />
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
                        try {
                          if (!leadId) return;

                          const currentEmail = lead.email || "";
                          const currentLinkedin = lead.linkedinUrl || "";
                          const currentPhone = lead.phone || "";
                          const currentCompany = lead.company || "";
                          const currentSource = lead.source || "";
                          const currentValue =
                            typeof lead.value === "number" ? String(lead.value) : "";
                          const normalizedPhone = normalizePhoneForSave(editPhone);

                          const updates: Partial<Lead> = {};
                          if (editEmail !== currentEmail) {
                            updates.email = editEmail || null;
                          }
                          if (editLinkedin !== currentLinkedin) {
                            updates.linkedinUrl = editLinkedin || null;
                          }
                          if (editPhone !== currentPhone) {
                            if (editPhone.trim().length > 0 && !normalizedPhone) {
                              throw new Error("Please enter a valid phone number with country code.");
                            }
                            updates.phone = normalizedPhone;
                          }
                          if (editCompany !== currentCompany) {
                            if (!editCompany.trim()) {
                              throw new Error("Company is required.");
                            }
                            updates.company = editCompany.trim();
                          }
                          if (editSource !== currentSource) {
                            if (!editSource.trim()) {
                              throw new Error("Source is required.");
                            }
                            updates.source = editSource.trim();
                          }
                          if (editValue !== currentValue) {
                            if (!editValue.trim() || !/^\d+$/.test(editValue)) {
                              throw new Error("Value is required and must be a non-negative number.");
                            }
                            updates.value = Number(editValue);
                          }

                          // If nothing changed, just close the dialog.
                          if (Object.keys(updates).length === 0) {
                            setIsEditInfoOpen(false);
                            return;
                          }

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

                          toast({
                            title: "Contact Info Updated",
                            description: "The lead's contact details have been saved.",
                          });
                          setIsEditInfoOpen(false);
                        } catch (err: any) {
                          toast({
                            title: "Error",
                            description: err?.message || "Failed to update lead contact info.",
                            variant: "destructive",
                          });
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
              <Dialog open={isTaskOpen} onOpenChange={setIsTaskOpen}>
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
                      <Label>Task Type</Label>
                      <Select value={taskType} onValueChange={(val) => setTaskType(val as typeof taskType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EMAIL">Email Follow-up</SelectItem>
                          <SelectItem value="LINKEDIN">LinkedIn Message</SelectItem>
                          <SelectItem value="CALL">Phone Call</SelectItem>
                        </SelectContent>
                      </Select>
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
                        try {
                          const res = await fetch("/api/tasks", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              leadId,
                              userId: authUser.id,
                              type: taskType,
                              priority: taskPriority,
                              dueDate: taskDueDate,
                              notes: taskNotes || undefined,
                            }),
                          });

                          if (!res.ok) {
                            const data = await res.json().catch(() => ({}));
                            throw new Error(data?.message || "Failed to create task");
                          }

                          // Invalidate tasks list (if Tasks page is open)
                          queryClient.invalidateQueries({
                            queryKey: [authUser ? `/api/tasks?userId=${authUser.id}` : "/api/tasks"],
                          });
                          queryClient.invalidateQueries({
                            queryKey: [leadId ? `/api/tasks?leadId=${leadId}` : "/api/tasks"],
                          });
                          await refetchLeadTasks();

                          // Task creation is already logged server-side in /api/tasks.
                          // Refetch timeline to show the new backend entry without duplicating it.
                          await refetchTimeline();

                          toast({ title: "Task Created", description: "New task has been scheduled." });
                          setIsTaskOpen(false);
                          setTaskType("EMAIL");
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
                      <p className="text-xs font-semibold">{task.type}</p>
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
