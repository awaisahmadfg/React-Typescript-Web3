import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Role, LeadStage, ConnectionStatus, Lead, Plan, Team, User } from "@/lib/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Filter, MoreHorizontal, Linkedin, Upload, CheckSquare, Plus, ArrowLeft } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { availableStages } from "@/lib/mock-data";
import { useQuery } from "@tanstack/react-query";
import { isPhoneValid, normalizePhoneForSave } from "@/lib/phone";

export default function LeadsPage() {
  const { user } = useAuth();
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [viewMode, setViewMode] = useState<"mine" | "team">("mine");
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const { toast } = useToast();
  const [selectedLead, setSelectedLead] = useState<{id: string, name: string} | null>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [hasStageQuery, setHasStageQuery] = useState(false);
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
    ownerId: "",
    teamId: user?.teamId || "",
    planId: "",
    stage: "NEW"
  });

  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });
  const { data: plansList = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const managedTeamIdsForTeamLead =
    user?.role === Role.TEAM_LEAD
      ? teamsList
          .filter((team) => team.leadId === user.id)
          .map((team) => team.id)
      : [];

  const fallbackTeamIdForTeamLead =
    managedTeamIdsForTeamLead[0] || (user?.teamId || "");

  useEffect(() => {
    setNewLead((prev) => ({
      ...prev,
      ownerId: prev.ownerId || (user?.role === Role.TEAM_LEAD ? user?.id || "" : ""),
      teamId:
        prev.teamId ||
        (user?.role === Role.TEAM_LEAD ? fallbackTeamIdForTeamLead : user?.teamId || ""),
    }));
  }, [user?.id, user?.role, user?.teamId, fallbackTeamIdForTeamLead]);

  useEffect(() => {
    fetchLeads();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stageFromQuery = params.get("stage");
    setHasStageQuery(Boolean(stageFromQuery));
    if (stageFromQuery && availableStages.includes(stageFromQuery as LeadStage)) {
      setStageFilter(stageFromQuery);
      return;
    }
    setStageFilter("ALL");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (stageFilter === "ALL") {
      params.delete("stage");
    } else {
      params.set("stage", stageFilter);
    }
    setHasStageQuery(stageFilter !== "ALL");
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [stageFilter]);

  const fetchLeads = async () => {
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      setLeadsList(data);
    } catch (error) {
      console.error("Failed to fetch leads", error);
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
      fetchLeads();
    } catch (error) {
      toast({ title: "Error", description: "Bulk update failed", variant: "destructive" });
    }
    setSelectedLeadIds([]);
  };

  const filteredLeads = leadsList.filter(lead => {
    // 1. RBAC Team Scoping
    if (user?.role === "ADMIN") {
      // Admin sees everything
    } else {
      // Everyone else is scoped to their team
      if (user?.teamId && lead.teamId !== user.teamId) return false;
      
      // AE/SDR can further filter to their own leads
      if ((user?.role === "AE" || user?.role === "SDR") && viewMode === "mine") {
        if (lead.ownerId !== user.id) return false;
      }
    }

    // 2. Search & Stage Filters
    const matchesSearch = 
      lead.firstName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      lead.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStage = stageFilter === "ALL" || lead.stage === stageFilter;

    return matchesSearch && matchesStage;
  });

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
        fetchLeads();
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleConnectionAccepted = async (lead: Lead) => {
    if (lead.connectionStatus !== ConnectionStatus.SENT) {
      toast({
        title: "Send connection first",
        description: "Mark LinkedIn Connection Sent before marking it as accepted.",
      });
      return;
    }

    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionStatus: ConnectionStatus.ACCEPTED,
          connectionAcceptedAt: new Date().toISOString(),
        }),
      });

      await fetch("/api/activity-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          teamId: lead.teamId || user?.teamId || "unassigned",
          createdByUserId: user?.id,
          activityType: "linkedin_connection_accepted",
          body: "LinkedIn connection request accepted",
        }),
      });

      toast({
        title: "Connection Accepted",
        description: `${lead.firstName} ${lead.lastName} marked as accepted.`,
      });
      fetchLeads();
    } catch {
      toast({
        title: "Error",
        description: "Failed to mark LinkedIn connection as accepted.",
        variant: "destructive",
      });
    }
  };

  const handleConnectionSent = async (lead: Lead) => {
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionStatus: ConnectionStatus.SENT,
          connectionSentAt: new Date().toISOString(),
        }),
      });

      await fetch("/api/activity-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          teamId: lead.teamId || user?.teamId || "unassigned",
          createdByUserId: user?.id,
          activityType: "linkedin_message",
          channel: "conn",
          body: "LinkedIn connection request sent",
        }),
      });

      toast({
        title: "Connection Sent",
        description: `${lead.firstName} ${lead.lastName} marked as sent.`,
      });
      fetchLeads();
    } catch {
      toast({
        title: "Error",
        description: "Failed to mark LinkedIn connection as sent.",
        variant: "destructive",
      });
    }
  };

  const canEdit = (lead: any) => {
    if (user?.role === "ADMIN" || user?.role === "TEAM_LEAD") return true;
    return lead.ownerId === user?.id;
  };

  const canManageAssignments = user?.role === "ADMIN" || user?.role === "TEAM_LEAD";
  const visibleTeams =
    user?.role === "ADMIN"
      ? teamsList
      : user?.role === "TEAM_LEAD"
      ? teamsList.filter((team) =>
          managedTeamIdsForTeamLead.length > 0
            ? managedTeamIdsForTeamLead.includes(team.id)
            : team.id === user?.teamId,
        )
      : teamsList.filter((team) => team.id === user?.teamId);
  const assignableUsers = (() => {
    const selectedTeamId = newLead.teamId;
    const selectedTeam = teamsList.find((team) => team.id === selectedTeamId);
    const teamLeadCandidates = usersList.filter((u) => {
      if (!u.isActive) return false;
      if (u.role !== Role.TEAM_LEAD) return false;
      if (user?.role === "ADMIN") {
        if (!selectedTeamId) return true;
        return u.teamId === selectedTeamId || u.id === selectedTeam?.leadId;
      }
      if (user?.role === "TEAM_LEAD") {
        if (!selectedTeamId) {
          return u.id === user.id;
        }
        const isManagedTeam =
          managedTeamIdsForTeamLead.length > 0
            ? managedTeamIdsForTeamLead.includes(selectedTeamId)
            : selectedTeamId === user?.teamId;
        if (!isManagedTeam) return false;
        return u.teamId === selectedTeamId || u.id === selectedTeam?.leadId;
      }
      return u.teamId === user?.teamId;
    });

    // Fallback for stale data: if team has a configured leadId but user.teamId is outdated,
    // still allow selecting that team lead.
    if (selectedTeam?.leadId) {
      const configuredLead = usersList.find((u) => u.id === selectedTeam.leadId && u.isActive);
      if (configuredLead && configuredLead.role === Role.TEAM_LEAD) {
        const exists = teamLeadCandidates.some((u) => u.id === configuredLead.id);
        if (!exists) {
          return [...teamLeadCandidates, configuredLead];
        }
      }
    }

    return teamLeadCandidates;
  })();

  useEffect(() => {
    if (!canManageAssignments) return;
    const preferredTeamId =
      visibleTeams.find((team) => team.id === newLead.teamId)?.id || visibleTeams[0]?.id || "";
    const selectedTeam = teamsList.find((team) => team.id === preferredTeamId);
    const preferredOwnerId =
      assignableUsers.find((u) => u.id === newLead.ownerId)?.id ||
      (selectedTeam?.leadId &&
      assignableUsers.some((u) => u.id === selectedTeam.leadId)
        ? selectedTeam.leadId
        : assignableUsers[0]?.id || "");

    if (preferredTeamId === newLead.teamId && preferredOwnerId === newLead.ownerId) return;
    setNewLead((prev) => ({
      ...prev,
      teamId: preferredTeamId,
      ownerId: preferredOwnerId,
    }));
  }, [canManageAssignments, visibleTeams, assignableUsers, teamsList, newLead.teamId, newLead.ownerId]);
  const visiblePlans = plansList;
  const isNewLeadPhoneValid = isPhoneValid(newLead.phone);

  const formatStageLabel = (stage: string) => {
    if (stage === LeadStage.MEETING_SET) return "Meeting Set";
    return stage;
  };

  const getOwnerName = (lead: Lead) => {
    if (lead.ownerId === user?.id) return "You";
    return (
      (lead as any).ownerName ||
      usersList.find((u) => u.id === lead.ownerId)?.name ||
      "Unknown"
    );
  };

  const handleCreateLead = async () => {
    if (!newLead.firstName || !newLead.lastName || !newLead.company) {
      toast({ title: "Error", description: "First Name, Last Name, and Company are required", variant: "destructive" });
      return;
    }
    if (canManageAssignments && (!newLead.teamId || !newLead.ownerId)) {
      toast({
        title: "Error",
        description: "Please select a team and assigned team lead.",
        variant: "destructive",
      });
      return;
    }
    if (!newLead.source.trim()) {
      toast({
        title: "Error",
        description: "Lead source is required.",
        variant: "destructive",
      });
      return;
    }
    const normalizedValue = Number(newLead.value);
    if (!newLead.value || !Number.isFinite(normalizedValue) || normalizedValue < 0) {
      toast({
        title: "Error",
        description: "Lead value is required and must be a non-negative number.",
        variant: "destructive",
      });
      return;
    }

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
          ownerId: newLead.ownerId || user?.id,
          teamId:
            newLead.teamId ||
            (user?.role === Role.TEAM_LEAD ? fallbackTeamIdForTeamLead : user?.teamId),
          planId: newLead.planId || null,
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to create lead");
      }
      
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
        ownerId: "",
        teamId: user?.role === Role.TEAM_LEAD ? fallbackTeamIdForTeamLead : user?.teamId || "",
        planId: "",
        stage: "NEW"
      });
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
                availableStages.map((stage) => (
                  <DropdownMenuItem key={stage} onClick={() => handleBulkStatusChange(stage)}>
                    Move to {formatStageLabel(stage)}
                  </DropdownMenuItem>
                ))
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
          <Dialog open={isAddLeadOpen} onOpenChange={setIsAddLeadOpen}>
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
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input 
                      placeholder="John" 
                      value={newLead.firstName} 
                      onChange={(e) => setNewLead(prev => ({ ...prev, firstName: e.target.value }))} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input 
                      placeholder="Doe" 
                      value={newLead.lastName} 
                      onChange={(e) => setNewLead(prev => ({ ...prev, lastName: e.target.value }))} 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input 
                    placeholder="john.doe@company.com" 
                    type="email" 
                    value={newLead.email} 
                    onChange={(e) => setNewLead(prev => ({ ...prev, email: e.target.value }))} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>LinkedIn URL</Label>
                  <Input 
                    placeholder="https://linkedin.com/in/..." 
                    value={newLead.linkedinUrl} 
                    onChange={(e) => setNewLead(prev => ({ ...prev, linkedinUrl: e.target.value }))} 
                  />
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
                  <Label>Company</Label>
                  <Input 
                    placeholder="Acme Corp" 
                    value={newLead.company} 
                    onChange={(e) => setNewLead(prev => ({ ...prev, company: e.target.value }))} 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Source</Label>
                    <Input
                      placeholder="LinkedIn / Referral / Website"
                      value={newLead.source}
                      onChange={(e) => setNewLead((prev) => ({ ...prev, source: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Value</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="5000"
                      value={newLead.value}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          setNewLead((prev) => ({ ...prev, value: "" }));
                          return;
                        }
                        if (!/^\d+$/.test(raw)) return;
                        setNewLead((prev) => ({ ...prev, value: raw }));
                      }}
                    />
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
                {canManageAssignments && (
                  <>
                    <div className="space-y-2">
                      <Label>Team</Label>
                      <Select
                        value={newLead.teamId || "__none__"}
                        onValueChange={(value) => {
                          const nextTeamId = value === "__none__" ? "" : value;
                          const nextAssignableUsers = usersList.filter(
                            (u) => u.isActive && u.role === Role.TEAM_LEAD && (!nextTeamId || u.teamId === nextTeamId),
                          );
                          const ownerStillValid = nextAssignableUsers.some((u) => u.id === newLead.ownerId);
                          const fallbackOwnerId =
                            ownerStillValid
                              ? newLead.ownerId
                              : (user?.role === Role.TEAM_LEAD && user?.teamId === nextTeamId ? user.id : nextAssignableUsers[0]?.id || "");
                          setNewLead((prev) => ({
                            ...prev,
                            teamId: nextTeamId,
                            ownerId: fallbackOwnerId,
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unassigned</SelectItem>
                          {visibleTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Assigned Team Lead</Label>
                      <Select
                        value={newLead.ownerId || "__none__"}
                        onValueChange={(value) =>
                          setNewLead((prev) => ({
                            ...prev,
                            ownerId: value === "__none__" ? "" : value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select assigned team lead" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
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
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCreateLead} disabled={!isNewLeadPhoneValid}>
                  Create Lead
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col space-y-4">
            {/* View Toggle for AE/SDR */}
            {(user?.role === "AE" || user?.role === "SDR") && (
              <div className="flex items-center space-x-1 bg-secondary/50 p-1 rounded-lg w-fit">
                <button
                  onClick={() => setViewMode("mine")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    viewMode === "mine" 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  My Leads
                </button>
                <button
                  onClick={() => setViewMode("team")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    viewMode === "team" 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Team Leads
                </button>
              </div>
            )}
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search leads..." 
                  className="pl-9" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStageFilter("ALL")}
                  disabled={stageFilter === "ALL" && !hasStageQuery}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Leads
                </Button>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filter by Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Stages</SelectItem>
                    {availableStages.map(stage => (
                      <SelectItem key={stage} value={stage}>{formatStageLabel(stage)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300"
                    checked={selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0}
                    onChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Assigned Team</TableHead>
                <TableHead>Team Lead</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>LinkedIn Connection Status</TableHead>
                <TableHead>Pipeline Stage</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => {
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
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                         <Link href={`/leads/${lead.id}`} className="hover:underline">
                           {lead.firstName} {lead.lastName}
                         </Link>
                         <a href={lead.linkedinUrl || "#"} target="_blank" rel="noreferrer" className="text-[#0077b5] opacity-0 group-hover:opacity-100 transition-opacity">
                           <Linkedin className="w-4 h-4" />
                         </a>
                      </div>
                    </TableCell>
                    <TableCell>{lead.company}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lead.source || "-"}</TableCell>
                    <TableCell className="text-xs font-medium">
                      {typeof lead.value === "number" ? lead.value.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {assignedTeam?.name || "Unassigned"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-medium">
                        {teamLeadUser?.name || "Unassigned"}
                      </span>
                    </TableCell>
                    <TableCell>{lead.title || "-"}</TableCell>
                    <TableCell>
                      <span className={isOwner ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>
                        {getOwnerName(lead)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {lead.connectionStatus === ConnectionStatus.ACCEPTED ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">Accepted</Badge>
                      ) : lead.connectionStatus === ConnectionStatus.SENT ? (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Sent</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        lead.stage === "MQL" ? "bg-purple-50 text-purple-700 border-purple-200" :
                        lead.stage === "SQL" ? "bg-orange-50 text-orange-700 border-orange-200" : ""
                      }>{formatStageLabel(lead.stage)}</Badge>
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

                              <DropdownMenuItem
                                onClick={() => handleConnectionAccepted(lead)}
                                disabled={lead.connectionStatus !== ConnectionStatus.SENT}
                              >
                                <Linkedin className="mr-2 h-4 w-4 text-emerald-600" />
                                {lead.connectionStatus === ConnectionStatus.ACCEPTED
                                  ? "Connection Already Accepted"
                                  : lead.connectionStatus === ConnectionStatus.SENT
                                    ? "Mark Connection Accepted"
                                    : "Mark Connection Accepted (Send First)"}
                              </DropdownMenuItem>
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
                              <DropdownMenuItem
                                onClick={() => handleConnectionSent(lead)}
                                disabled={
                                  lead.connectionStatus === ConnectionStatus.SENT ||
                                  lead.connectionStatus === ConnectionStatus.ACCEPTED
                                }
                              >
                                <Linkedin className="mr-2 h-4 w-4 text-blue-600" />
                                {lead.connectionStatus === ConnectionStatus.ACCEPTED
                                  ? "LinkedIn Connection Already Accepted"
                                  : lead.connectionStatus === ConnectionStatus.SENT
                                    ? "LinkedIn Connection Sent"
                                    : "Mark LinkedIn Connection Sent"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleConnectionAccepted(lead)}
                                disabled={lead.connectionStatus !== ConnectionStatus.SENT}
                              >
                                <Linkedin className="mr-2 h-4 w-4 text-emerald-600" />
                                {lead.connectionStatus === ConnectionStatus.ACCEPTED
                                  ? "LinkedIn Connection Accepted"
                                  : lead.connectionStatus === ConnectionStatus.SENT
                                    ? "Mark LinkedIn Connection Accepted"
                                    : "Mark LinkedIn Connection Accepted (Send First)"}
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/leads/${lead.id}`}>View Profile</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/leads/${lead.id}?edit=contact`}>Edit Details</Link>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel>Change Stage</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => handleStatusChange(lead.id, "MQL")}>
                                 Mark as MQL
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(lead.id, "SQL")}>
                                 Mark as SQL
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {availableStages.filter(s => s !== "MQL" && s !== "SQL").map(s => (
                                 <DropdownMenuItem key={s} onClick={() => handleStatusChange(lead.id, s)}>
                                   Move to {s}
                                 </DropdownMenuItem>
                              ))}
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
          <div className="mt-4 text-xs text-muted-foreground text-center">
            Showing {filteredLeads.length} leads
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
