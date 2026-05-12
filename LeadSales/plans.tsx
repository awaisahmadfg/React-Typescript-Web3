import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Settings2, Users, Mail, MessageSquare, Trash2, Building2, Phone, Clock, ArrowUpAZ, ArrowDownAZ } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Role, type User, type PlanAssignment, type Team } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import type { Plan } from "@/lib/types";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

export default function PlansPage() {
  const PLAN_ACTIVE_STATUSES = new Set(["OPEN", "PENDING", "IN_PROGRESS"]);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editPlanNameError, setEditPlanNameError] = useState("");
  const [editLinkedInEnabled, setEditLinkedInEnabled] = useState(true);
  const [editEmailEnabled, setEditEmailEnabled] = useState(true);
  const [editCallEnabled, setEditCallEnabled] = useState(false);
  const [editScheduleStartDate, setEditScheduleStartDate] = useState("");
  const [editLinkedinTaskCount, setEditLinkedinTaskCount] = useState("4");
  const [editEmailTaskCount, setEditEmailTaskCount] = useState("4");
  const [editCallTaskCount, setEditCallTaskCount] = useState("4");
  const [editInitialValues, setEditInitialValues] = useState<{
    name: string;
    taskScheduleStartDate: string;
    emailTaskCount: number;
    linkedinTaskCount: number;
    callTaskCount: number;
    emailDelayDays: number;
    messageDelayDays: number;
    callDelayDays: number;
    initialContactChannel: string;
  } | null>(null);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [managingAePlanId, setManagingAePlanId] = useState<string | null>(null);
  const [managingTeamsPlanId, setManagingTeamsPlanId] = useState<string | null>(null);
  const [focusedPlanId, setFocusedPlanId] = useState<string | null>(null);

  const parseJsonSafely = async <T,>(res: Response): Promise<T | null> => {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  };

  const { data: usersResponse = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  const users = Array.isArray(usersResponse) ? usersResponse : [];

  const { data: teamsResponse = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });
  const teams = Array.isArray(teamsResponse) ? teamsResponse : [];

  const { data: plansResponse = [], isLoading: isLoadingPlans } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });
  const plans = Array.isArray(plansResponse) ? plansResponse : [];

  const { data: editPlanTasksResponse = [], isLoading: isLoadingEditPlanTasks } = useQuery<
    Array<{ id: string; status?: string; scheduleKey?: string | null }>
  >({
    queryKey: ["/api/tasks", "plan-edit", editingPlan?.id],
    queryFn: async () => {
      if (!editingPlan?.id) return [];
      const res = await fetch(`/api/tasks?planId=${editingPlan.id}`);
      if (!res.ok) return [];
      const parsed = await parseJsonSafely<Array<{ id: string; status?: string; scheduleKey?: string | null }>>(res);
      return Array.isArray(parsed) ? parsed : [];
    },
    enabled: !!editingPlan?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const editPlanTasks = Array.isArray(editPlanTasksResponse) ? editPlanTasksResponse : [];
  const hasPendingGeneratedPlanTasks = editPlanTasks.some((task) => {
    const normalizedStatus = String(task.status ?? "OPEN").toUpperCase();
    return !!task.scheduleKey && PLAN_ACTIVE_STATUSES.has(normalizedStatus);
  });

  // AE assignments per plan
  const [selectedAeIdsByPlan, setSelectedAeIdsByPlan] = useState<Record<string, string[]>>({});

  const { data: assignmentsResponse = {} } = useQuery<Record<string, PlanAssignment[]>>({
    queryKey: ["/api/plan-assignments"],
    queryFn: async () => {
      const results: Record<string, PlanAssignment[]> = {};
      for (const plan of plans) {
        const res = await fetch(`/api/plans/${plan.id}/assignments`);
        if (res.ok) {
          const parsed = await parseJsonSafely<PlanAssignment[]>(res);
          results[plan.id] = Array.isArray(parsed) ? parsed : [];
        } else {
          results[plan.id] = [];
        }
      }
      return results;
    },
    enabled: plans.length > 0,
  });
  const assignmentsByPlanId =
    assignmentsResponse && typeof assignmentsResponse === "object" && !Array.isArray(assignmentsResponse)
      ? assignmentsResponse
      : {};

  // Team assignments per plan
  const [selectedTeamIdsByPlan, setSelectedTeamIdsByPlan] = useState<Record<string, string[]>>({});

  const { data: teamAssignmentsResponse = {} } = useQuery<Record<string, string[]>>({
    queryKey: ["/api/plan-team-assignments"],
    queryFn: async () => {
      const results: Record<string, string[]> = {};
      for (const plan of plans) {
        const res = await fetch(`/api/plans/${plan.id}/teams`);
        if (res.ok) {
          const parsed = await parseJsonSafely<{ teamIds: string[] }>(res);
          results[plan.id] = parsed?.teamIds ?? [];
        } else {
          results[plan.id] = [];
        }
      }
      return results;
    },
    enabled: plans.length > 0,
  });
  const teamIdsByPlanId =
    teamAssignmentsResponse && typeof teamAssignmentsResponse === "object" && !Array.isArray(teamAssignmentsResponse)
      ? teamAssignmentsResponse
      : {};

  // Sync AE selection state with server
  React.useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const [planId, assignments] of Object.entries(assignmentsByPlanId)) {
      next[planId] = assignments.map((a) => a.userId);
    }
    setSelectedAeIdsByPlan((prev) => {
      const nextEntries = Object.entries(next);
      const unchanged = nextEntries.every(([planId, ids]) => {
        const prevIds = prev[planId] ?? [];
        return prevIds.length === ids.length && prevIds.every((id, idx) => id === ids[idx]);
      });
      if (unchanged && Object.keys(prev).length === nextEntries.length) return prev;
      return next;
    });
  }, [assignmentsByPlanId]);

  // Sync team selection state with server
  React.useEffect(() => {
    const next: Record<string, string[]> = { ...teamIdsByPlanId };
    setSelectedTeamIdsByPlan((prev) => {
      const nextEntries = Object.entries(next);
      const unchanged = nextEntries.every(([planId, ids]) => {
        const prevIds = prev[planId] ?? [];
        return prevIds.length === ids.length && prevIds.every((id, idx) => id === ids[idx]);
      });
      if (unchanged && Object.keys(prev).length === nextEntries.length) return prev;
      return next;
    });
  }, [teamIdsByPlanId]);

  const resolveInitialContactChannel = (
    linkedinEnabled: boolean,
    emailEnabled: boolean,
    callEnabled: boolean,
  ): string => {
    const selected: string[] = [];
    if (emailEnabled) selected.push("Email");
    if (linkedinEnabled) selected.push("LinkedIn");
    if (callEnabled) selected.push("Call");
    if (selected.length === 3) return "Email+LinkedIn+Call";
    if (selected.length === 2 && selected.includes("Email") && selected.includes("LinkedIn")) return "Both";
    if (selected.length === 1) return selected[0];
    if (selected.length > 1) return selected.join("+");
    return "None";
  };

  const parseTaskCount = (value: string): number =>
    Math.min(4, Math.max(0, Number.parseInt(value, 10) || 0));

  const buildEditComparisonValues = (
    plan: Pick<Plan, "name" | "taskScheduleStartDate" | "emailDelayDays" | "messageDelayDays" | "callDelayDays">,
    flags: { linkedinEnabled: boolean; emailEnabled: boolean; callEnabled: boolean },
    counts: { linkedinTaskCount: string; emailTaskCount: string; callTaskCount: string },
  ) => ({
    name: plan.name?.trim() || "",
    taskScheduleStartDate: (plan.taskScheduleStartDate || "").slice(0, 10),
    emailTaskCount: flags.emailEnabled ? parseTaskCount(counts.emailTaskCount) : 0,
    linkedinTaskCount: flags.linkedinEnabled ? parseTaskCount(counts.linkedinTaskCount) : 0,
    callTaskCount: flags.callEnabled ? parseTaskCount(counts.callTaskCount) : 0,
    emailDelayDays: flags.emailEnabled ? Math.max(0, Number(plan.emailDelayDays ?? 0)) : 0,
    messageDelayDays: flags.linkedinEnabled ? Math.max(0, Number(plan.messageDelayDays ?? 0)) : 0,
    callDelayDays: flags.callEnabled ? Math.max(0, Number(plan.callDelayDays ?? 0)) : 0,
    initialContactChannel: resolveInitialContactChannel(flags.linkedinEnabled, flags.emailEnabled, flags.callEnabled),
  });

  const createPlanMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      taskScheduleStartDate: string;
      emailTaskCount: number;
      linkedinTaskCount: number;
      callTaskCount: number;
      emailDelayDays: number;
      messageDelayDays: number;
      callDelayDays: number;
      initialContactChannel: string;
    }) => {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          ownerId: user?.id || "system",
          taskScheduleStartDate: payload.taskScheduleStartDate,
          emailTaskCount: payload.emailTaskCount,
          linkedinTaskCount: payload.linkedinTaskCount,
          callTaskCount: payload.callTaskCount,
          emailDelayDays: payload.emailDelayDays,
          messageDelayDays: payload.messageDelayDays,
          callDelayDays: payload.callDelayDays,
          initialContactsPerDay: 0,
          initialContactChannel: payload.initialContactChannel,
          isActive: true,
        }),
      });
      if (!res.ok) throw new Error("Failed to create plan");
      return (await parseJsonSafely<Plan>(res)) as Plan | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-plans-index"] });
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name?: string;
      taskScheduleStartDate?: string;
      emailTaskCount?: number;
      linkedinTaskCount?: number;
      callTaskCount?: number;
      emailDelayDays?: number;
      messageDelayDays?: number;
      callDelayDays?: number;
      initialContactChannel?: string;
    }) => {
      const res = await fetch(`/api/plans/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          taskScheduleStartDate: payload.taskScheduleStartDate,
          emailTaskCount: payload.emailTaskCount,
          linkedinTaskCount: payload.linkedinTaskCount,
          callTaskCount: payload.callTaskCount,
          emailDelayDays: payload.emailDelayDays,
          messageDelayDays: payload.messageDelayDays,
          callDelayDays: payload.callDelayDays,
          initialContactChannel: payload.initialContactChannel,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to update plan");
      }
      return (await parseJsonSafely<Plan>(res)) as Plan | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-plans-index"] });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/plans/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to delete plan");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-plans-index"] });
    },
  });

  const handleUpdatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    const currentValues = buildEditComparisonValues(
      { ...editingPlan, taskScheduleStartDate: editScheduleStartDate || "" },
      { linkedinEnabled: editLinkedInEnabled, emailEnabled: editEmailEnabled, callEnabled: editCallEnabled },
      { linkedinTaskCount: editLinkedinTaskCount, emailTaskCount: editEmailTaskCount, callTaskCount: editCallTaskCount },
    );
    if (!editingPlan.name?.trim()) {
      setEditPlanNameError("Plan name is required.");
      return;
    }
    const hasNoFieldChanges = editInitialValues && JSON.stringify(currentValues) === JSON.stringify(editInitialValues);
    if (hasNoFieldChanges && hasPendingGeneratedPlanTasks) {
      toast({ title: "No changes to save.", description: "Update any field before saving." });
      return;
    }
    setEditPlanNameError("");
    updatePlanMutation.mutate(
      {
        id: editingPlan.id,
        name: currentValues.name,
        taskScheduleStartDate: currentValues.taskScheduleStartDate || undefined,
        emailTaskCount: currentValues.emailTaskCount,
        linkedinTaskCount: currentValues.linkedinTaskCount,
        callTaskCount: currentValues.callTaskCount,
        emailDelayDays: currentValues.emailDelayDays,
        messageDelayDays: currentValues.messageDelayDays,
        callDelayDays: currentValues.callDelayDays,
        initialContactChannel: currentValues.initialContactChannel,
      },
      {
        onSuccess: () => {
          toast({ title: "Plan Updated", description: `Follow-up flow for ${editingPlan.name} has been updated.` });
          setEditingPlan(null);
          setEditInitialValues(null);
        },
        onError: (error: unknown) => {
          toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update plan.", variant: "destructive" });
        },
      },
    );
  };

  const [newPlanName, setNewPlanName] = useState("");
  const [newLinkedInDelay, setNewLinkedInDelay] = useState("2");
  const [newEmailDelay, setNewEmailDelay] = useState("3");
  const [newCallDelay, setNewCallDelay] = useState("1");
  const [newLinkedInEnabled, setNewLinkedInEnabled] = useState(true);
  const [newEmailEnabled, setNewEmailEnabled] = useState(true);
  const [newCallEnabled, setNewCallEnabled] = useState(false);
  const [newScheduleStartDate, setNewScheduleStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [newLinkedinTaskCount, setNewLinkedinTaskCount] = useState("4");
  const [newEmailTaskCount, setNewEmailTaskCount] = useState("4");
  const [newCallTaskCount, setNewCallTaskCount] = useState("4");
  const [newPlanTeamIds, setNewPlanTeamIds] = useState<string[]>([]);
  const [newPlanNameError, setNewPlanNameError] = useState("");

  const currentEditValues = editingPlan
    ? buildEditComparisonValues(
        { ...editingPlan, taskScheduleStartDate: editScheduleStartDate || "" },
        { linkedinEnabled: editLinkedInEnabled, emailEnabled: editEmailEnabled, callEnabled: editCallEnabled },
        { linkedinTaskCount: editLinkedinTaskCount, emailTaskCount: editEmailTaskCount, callTaskCount: editCallTaskCount },
      )
    : null;
  const hasEditChanges =
    !!currentEditValues &&
    !!editInitialValues &&
    JSON.stringify(currentEditValues) !== JSON.stringify(editInitialValues);
  const canRegenerateSameRules =
    !!editingPlan &&
    !hasEditChanges &&
    !isLoadingEditPlanTasks &&
    !hasPendingGeneratedPlanTasks;

  const handleCreatePlan = () => {
    if (!newPlanName.trim()) {
      setNewPlanNameError("Plan name is required.");
      return;
    }
    setNewPlanNameError("");
    const emailDelayDays = newEmailEnabled ? Math.max(0, Number.parseInt(newEmailDelay, 10) || 0) : 0;
    const messageDelayDays = newLinkedInEnabled ? Math.max(0, Number.parseInt(newLinkedInDelay, 10) || 0) : 0;
    const callDelayDays = newCallEnabled ? Math.max(0, Number.parseInt(newCallDelay, 10) || 0) : 0;
    const emailTaskCount = newEmailEnabled ? parseTaskCount(newEmailTaskCount) : 0;
    const linkedinTaskCount = newLinkedInEnabled ? parseTaskCount(newLinkedinTaskCount) : 0;
    const callTaskCount = newCallEnabled ? parseTaskCount(newCallTaskCount) : 0;
    createPlanMutation.mutate(
      {
        name: newPlanName,
        taskScheduleStartDate: newScheduleStartDate,
        emailTaskCount,
        linkedinTaskCount,
        callTaskCount,
        emailDelayDays,
        messageDelayDays,
        callDelayDays,
        initialContactChannel: resolveInitialContactChannel(newLinkedInEnabled, newEmailEnabled, newCallEnabled),
      },
      {
        onSuccess: async (plan) => {
          if (plan && newPlanTeamIds.length > 0) {
            const teamRes = await fetch(`/api/plans/${plan.id}/teams`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ teamIds: newPlanTeamIds }),
            });
            if (!teamRes.ok) {
              const body = await teamRes.json().catch(() => ({}));
              toast({ title: "Plan Created", description: `Plan created but team assignment failed: ${body?.message ?? "unknown error"}`, variant: "destructive" });
              await queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
              setIsCreateOpen(false);
              return;
            }
            await queryClient.invalidateQueries({ queryKey: ["/api/plan-team-assignments"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/team-plans-index"] });
          }
          toast({ title: "Plan Created", description: "New follow-up plan is ready." });
          setIsCreateOpen(false);
          setNewPlanName("");
          setNewLinkedInDelay("2");
          setNewEmailDelay("3");
          setNewCallDelay("1");
          setNewLinkedInEnabled(true);
          setNewEmailEnabled(true);
          setNewCallEnabled(false);
          setNewScheduleStartDate(new Date().toISOString().slice(0, 10));
          setNewLinkedinTaskCount("4");
          setNewEmailTaskCount("4");
          setNewCallTaskCount("4");
          setNewPlanTeamIds([]);
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create plan.", variant: "destructive" });
        },
      },
    );
  };

  const handleDeletePlan = (id: string) => {
    deletePlanMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Plan Deleted", description: "The follow-up plan has been removed." });
      },
      onError: (error: unknown) => {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete plan.",
          variant: "destructive",
        });
      },
    });
  };

  const handleSaveTeams = async (planId: string) => {
    const selectedIds = selectedTeamIdsByPlan[planId] ?? [];
    try {
      const res = await fetch(`/api/plans/${planId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamIds: selectedIds }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to update team assignments");
      }
      const payload = await parseJsonSafely<{ teamIds: string[] }>(res);
      const savedTeamIds = payload?.teamIds ?? selectedIds;
      setSelectedTeamIdsByPlan((prev) => ({ ...prev, [planId]: savedTeamIds }));
      setSelectedAeIdsByPlan((prev) => {
        const allowedUserIds = new Set(
          aeAndSdrUsers
            .filter((candidate) => {
              const candidateTeamIds = candidate.teamIds?.length
                ? candidate.teamIds
                : candidate.teamId
                  ? [candidate.teamId]
                  : [];
              return savedTeamIds.length === 0 || candidateTeamIds.some((teamId) => savedTeamIds.includes(teamId));
            })
            .map((candidate) => candidate.id),
        );
        const currentSelected = prev[planId] ?? [];
        return {
          ...prev,
          [planId]: currentSelected.filter((id) => allowedUserIds.has(id)),
        };
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/plan-team-assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/team-plans-index"] });
      toast({ title: "Teams Updated", description: "Plan team assignments have been saved." });
      setManagingTeamsPlanId(null);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update team assignments.", variant: "destructive" });
    }
  };

  const handleSaveAEs = async (planId: string) => {
    const assignableUserIds = new Set(getAssignableUsersForPlan(planId).map((u) => u.id));
    const selectedIds = (selectedAeIdsByPlan[planId] ?? []).filter((id) => assignableUserIds.has(id));
    try {
      const res = await fetch(`/api/plans/${planId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      if (!res.ok) throw new Error("Failed to update assignments");
      await queryClient.invalidateQueries({ queryKey: ["/api/plan-assignments"] });
      toast({ title: "Assignments Updated", description: "Plan assignments have been saved." });
      setManagingAePlanId(null);
    } catch {
      toast({ title: "Error", description: "Failed to update plan assignments.", variant: "destructive" });
    }
  };

  const [sortBy, setSortBy] = useState<"newest" | "name">("newest");
  const [nameAsc, setNameAsc] = useState(true);

  const isAdmin = user?.role === Role.ADMIN;
  const isTeamLead = user?.role === Role.TEAM_LEAD;
  const canManagePlans = isAdmin || isTeamLead;
  const headedTeamIds = new Set(
    teams.filter((team) => team.leadId === user?.id).map((team) => team.id),
  );
  const aeAndSdrUsers = users.filter((u) => u.role === Role.AE || u.role === Role.SDR);

  const getAssignableUsersForPlan = (planId: string): User[] => {
    const assignedTeamIds = selectedTeamIdsByPlan[planId] ?? teamIdsByPlanId[planId] ?? [];
    if (assignedTeamIds.length === 0) return [];
    return aeAndSdrUsers.filter((candidate) => {
      const candidateTeamIds = candidate.teamIds?.length
        ? candidate.teamIds
        : candidate.teamId
          ? [candidate.teamId]
          : [];
      return candidateTeamIds.some((teamId) => assignedTeamIds.includes(teamId));
    });
  };

  React.useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const hashPlanId = new URLSearchParams(hash).get("planId");
    const queryPlanId = new URLSearchParams(window.location.search).get("planId");
    const planId = hashPlanId || queryPlanId;
    if (!planId || plans.length === 0) return;
    setFocusedPlanId(planId);
    // Wait for cards to render, then scroll target into view.
    requestAnimationFrame(() => {
      const el = document.getElementById(`plan-card-${planId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timeout = window.setTimeout(() => setFocusedPlanId((prev) => (prev === planId ? null : prev)), 2500);
    return () => window.clearTimeout(timeout);
  }, [plans]);

  if (isLoadingPlans) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }
  const sortedPlans = [...plans].sort((a, b) => {
    if (sortBy === "name") return nameAsc ? (a.name ?? "").localeCompare(b.name ?? "") : (b.name ?? "").localeCompare(a.name ?? "");
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Follow-up Plans</h1>
          <p className="text-muted-foreground mt-1">Manage reusable campaign templates and rules</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border bg-muted/50 p-1 gap-0.5">
            <button
              onClick={() => setSortBy("newest")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${sortBy === "newest" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/60"}`}
            >
              <Clock className="w-3 h-3" />
              Newest
            </button>
            <button
              onClick={() => { sortBy === "name" ? setNameAsc((p) => !p) : setSortBy("name"); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${sortBy === "name" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/60"}`}
            >
              {nameAsc ? <ArrowUpAZ className="w-3 h-3" /> : <ArrowDownAZ className="w-3 h-3" />}
              Name
            </button>
          </div>
          {canManagePlans && (
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) { setNewPlanName(""); setNewPlanNameError(""); setNewLinkedInDelay("2"); setNewEmailDelay("3"); setNewCallDelay("1"); setNewLinkedInEnabled(true); setNewEmailEnabled(true); setNewCallEnabled(false); setNewScheduleStartDate(new Date().toISOString().slice(0, 10)); setNewLinkedinTaskCount("4"); setNewEmailTaskCount("4"); setNewCallTaskCount("4"); setNewPlanTeamIds([]); } }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Plan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Follow-up Plan</DialogTitle>
                <DialogDescription>Define rules for a new outreach sequence.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Plan Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. Enterprise Outreach"
                    value={newPlanName}
                    maxLength={100}
                    className={newPlanNameError ? "border-destructive" : ""}
                    onChange={(e) => { setNewPlanName(e.target.value); if (newPlanNameError) setNewPlanNameError(""); }}
                  />
                  {newPlanNameError && <p className="text-xs text-destructive">{newPlanNameError}</p>}
                  {!newPlanNameError && newPlanName.length > 80 && (
                    <p className="text-xs text-muted-foreground text-right">{newPlanName.length}/100</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Task Schedule Start Date</Label>
                  <Input
                    type="date"
                    value={newScheduleStartDate}
                    onChange={(e) => setNewScheduleStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Outreach Delays</Label>
                  <div className="rounded-lg border divide-y">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Switch
                        id="create-linkedin-enabled"
                        checked={newLinkedInEnabled}
                        onCheckedChange={(checked) => {
                          setNewLinkedInEnabled(checked);
                          if (checked && (newLinkedInDelay === "0" || newLinkedInDelay === "")) setNewLinkedInDelay("2");
                        }}
                      />
                      <label htmlFor="create-linkedin-enabled" className={`flex flex-1 items-center gap-2 text-sm font-medium cursor-pointer select-none transition-colors ${!newLinkedInEnabled ? "text-muted-foreground" : ""}`}>
                        <MessageSquare className="w-3.5 h-3.5" />
                        LinkedIn
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          className={`w-16 h-7 text-sm text-center transition-colors ${!newLinkedInEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                          value={newLinkedInDelay}
                          disabled={!newLinkedInEnabled}
                          onChange={(e) => setNewLinkedInDelay(e.target.value)}
                        />
                        <span className={`text-xs transition-colors ${!newLinkedInEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>days</span>
                        <Input
                          type="number"
                          min={0}
                          max={4}
                          className={`w-16 h-7 text-sm text-center transition-colors ${!newLinkedInEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                          value={newLinkedinTaskCount}
                          disabled={!newLinkedInEnabled}
                          onChange={(e) => setNewLinkedinTaskCount(String(parseTaskCount(e.target.value)))}
                        />
                        <span className={`text-xs transition-colors ${!newLinkedInEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>tasks</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Switch
                        id="create-email-enabled"
                        checked={newEmailEnabled}
                        onCheckedChange={(checked) => {
                          setNewEmailEnabled(checked);
                          if (checked && (newEmailDelay === "0" || newEmailDelay === "")) setNewEmailDelay("3");
                        }}
                      />
                      <label htmlFor="create-email-enabled" className={`flex flex-1 items-center gap-2 text-sm font-medium cursor-pointer select-none transition-colors ${!newEmailEnabled ? "text-muted-foreground" : ""}`}>
                        <Mail className="w-3.5 h-3.5" />
                        Email
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          className={`w-16 h-7 text-sm text-center transition-colors ${!newEmailEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                          value={newEmailDelay}
                          disabled={!newEmailEnabled}
                          onChange={(e) => setNewEmailDelay(e.target.value)}
                        />
                        <span className={`text-xs transition-colors ${!newEmailEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>days</span>
                        <Input
                          type="number"
                          min={0}
                          max={4}
                          className={`w-16 h-7 text-sm text-center transition-colors ${!newEmailEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                          value={newEmailTaskCount}
                          disabled={!newEmailEnabled}
                          onChange={(e) => setNewEmailTaskCount(String(parseTaskCount(e.target.value)))}
                        />
                        <span className={`text-xs transition-colors ${!newEmailEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>tasks</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Switch
                        id="create-call-enabled"
                        checked={newCallEnabled}
                        onCheckedChange={(checked) => {
                          setNewCallEnabled(checked);
                          if (checked && (newCallDelay === "0" || newCallDelay === "")) setNewCallDelay("1");
                        }}
                      />
                      <label htmlFor="create-call-enabled" className={`flex flex-1 items-center gap-2 text-sm font-medium cursor-pointer select-none transition-colors ${!newCallEnabled ? "text-muted-foreground" : ""}`}>
                        <Phone className="w-3.5 h-3.5" />
                        Call
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          className={`w-16 h-7 text-sm text-center transition-colors ${!newCallEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                          value={newCallDelay}
                          disabled={!newCallEnabled}
                          onChange={(e) => setNewCallDelay(e.target.value)}
                        />
                        <span className={`text-xs transition-colors ${!newCallEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>days</span>
                        <Input
                          type="number"
                          min={0}
                          max={4}
                          className={`w-16 h-7 text-sm text-center transition-colors ${!newCallEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                          value={newCallTaskCount}
                          disabled={!newCallEnabled}
                          onChange={(e) => setNewCallTaskCount(String(parseTaskCount(e.target.value)))}
                        />
                        <span className={`text-xs transition-colors ${!newCallEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>tasks</span>
                      </div>
                    </div>
                  </div>
                </div>
                {canManagePlans && (
                  <div className="space-y-2">
                    <Label>Assign to Teams</Label>
                    {(() => {
                      const assignableTeams = isAdmin ? teams : teams.filter((t) => (user?.teamIds ?? []).includes(t.id));
                      return assignableTeams.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No teams available yet.</p>
                      ) : (
                      <div className="border rounded-md p-2 space-y-2 max-h-36 overflow-y-auto">
                        {assignableTeams.map((team) => (
                          <div key={team.id} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm">{team.name}</span>
                            </div>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300"
                              checked={newPlanTeamIds.includes(team.id)}
                              onChange={(e) =>
                                setNewPlanTeamIds((prev) =>
                                  e.target.checked ? [...prev, team.id] : prev.filter((id) => id !== team.id),
                                )
                              }
                            />
                          </div>
                        ))}
                      </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCreatePlan} disabled={createPlanMutation.isPending}>
                  {createPlanMutation.isPending ? "Creating..." : "Create Plan"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* Edit Plan Rules Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={(open) => { if (!open) { setEditingPlan(null); setEditPlanNameError(""); setEditLinkedInEnabled(true); setEditEmailEnabled(true); setEditCallEnabled(false); setEditScheduleStartDate(""); setEditLinkedinTaskCount("4"); setEditEmailTaskCount("4"); setEditCallTaskCount("4"); setEditInitialValues(null); } }}>
        <DialogContent className="sm:max-w-[560px]">
          <form onSubmit={handleUpdatePlan}>
            <DialogHeader>
              <DialogTitle>Edit Plan Rules</DialogTitle>
              <DialogDescription>Configure the follow-up cadence for all prospects in this plan.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-3">
                <Label htmlFor="name" className="text-right mt-2">Name <span className="text-destructive">*</span></Label>
                <div className="min-w-0">
                  <Input
                    id="name"
                    value={editingPlan?.name || ""}
                    maxLength={100}
                    className={`w-full ${editPlanNameError ? "border-destructive" : ""}`}
                    onChange={(e) => {
                      setEditingPlan((prev) => (prev ? { ...prev, name: e.target.value } : prev));
                      if (editPlanNameError) setEditPlanNameError("");
                    }}
                  />
                  {editPlanNameError && <p className="text-xs text-destructive mt-0.5">{editPlanNameError}</p>}
                  {!editPlanNameError && (editingPlan?.name?.length ?? 0) > 80 && (
                    <p className="text-xs text-muted-foreground text-right mt-0.5">{editingPlan?.name?.length}/100</p>
                  )}
                </div>
              </div>
              <div className="col-span-4 space-y-2">
                <Label>Task Schedule Start Date</Label>
                <Input
                  type="date"
                  value={editScheduleStartDate}
                  onChange={(e) => setEditScheduleStartDate(e.target.value)}
                />
              </div>
              <div className="col-span-4 space-y-2">
                <Label className="text-sm font-medium">Outreach Delays</Label>
                <div className="rounded-lg border divide-y">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Switch
                      id="edit-linkedin-enabled"
                      checked={editLinkedInEnabled}
                      onCheckedChange={(checked) => {
                        setEditLinkedInEnabled(checked);
                        setEditingPlan((prev) => prev ? { ...prev, messageDelayDays: checked ? (prev.messageDelayDays || 2) : 0 } : prev);
                      }}
                    />
                    <label htmlFor="edit-linkedin-enabled" className={`flex flex-1 items-center gap-2 text-sm font-medium cursor-pointer select-none transition-colors ${!editLinkedInEnabled ? "text-muted-foreground" : ""}`}>
                      <MessageSquare className="w-3.5 h-3.5" />
                      LinkedIn
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        className={`w-16 h-7 text-sm text-center transition-colors ${!editLinkedInEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                        disabled={!editLinkedInEnabled}
                        value={editingPlan?.messageDelayDays ?? 0}
                        onChange={(e) => setEditingPlan((prev) => prev ? { ...prev, messageDelayDays: Math.max(0, parseInt(e.target.value || "0", 10) || 0) } : prev)}
                      />
                      <span className={`text-xs transition-colors ${!editLinkedInEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>days</span>
                      <Input
                        type="number"
                        min={0}
                        max={4}
                        className={`w-16 h-7 text-sm text-center transition-colors ${!editLinkedInEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                        disabled={!editLinkedInEnabled}
                        value={editLinkedinTaskCount}
                        onChange={(e) => setEditLinkedinTaskCount(String(parseTaskCount(e.target.value)))}
                      />
                      <span className={`text-xs transition-colors ${!editLinkedInEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>tasks</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Switch
                      id="edit-email-enabled"
                      checked={editEmailEnabled}
                      onCheckedChange={(checked) => {
                        setEditEmailEnabled(checked);
                        setEditingPlan((prev) => prev ? { ...prev, emailDelayDays: checked ? (prev.emailDelayDays || 3) : 0 } : prev);
                      }}
                    />
                    <label htmlFor="edit-email-enabled" className={`flex flex-1 items-center gap-2 text-sm font-medium cursor-pointer select-none transition-colors ${!editEmailEnabled ? "text-muted-foreground" : ""}`}>
                      <Mail className="w-3.5 h-3.5" />
                      Email
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        className={`w-16 h-7 text-sm text-center transition-colors ${!editEmailEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                        disabled={!editEmailEnabled}
                        value={editingPlan?.emailDelayDays ?? 0}
                        onChange={(e) => setEditingPlan((prev) => prev ? { ...prev, emailDelayDays: Math.max(0, parseInt(e.target.value || "0", 10) || 0) } : prev)}
                      />
                      <span className={`text-xs transition-colors ${!editEmailEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>days</span>
                      <Input
                        type="number"
                        min={0}
                        max={4}
                        className={`w-16 h-7 text-sm text-center transition-colors ${!editEmailEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                        disabled={!editEmailEnabled}
                        value={editEmailTaskCount}
                        onChange={(e) => setEditEmailTaskCount(String(parseTaskCount(e.target.value)))}
                      />
                      <span className={`text-xs transition-colors ${!editEmailEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>tasks</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Switch
                      id="edit-call-enabled"
                      checked={editCallEnabled}
                      onCheckedChange={(checked) => {
                        setEditCallEnabled(checked);
                        setEditingPlan((prev) => prev ? { ...prev, callDelayDays: checked ? (prev.callDelayDays || 1) : 0 } : prev);
                      }}
                    />
                    <label htmlFor="edit-call-enabled" className={`flex flex-1 items-center gap-2 text-sm font-medium cursor-pointer select-none transition-colors ${!editCallEnabled ? "text-muted-foreground" : ""}`}>
                      <Phone className="w-3.5 h-3.5" />
                      Call
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        className={`w-16 h-7 text-sm text-center transition-colors ${!editCallEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                        disabled={!editCallEnabled}
                        value={editingPlan?.callDelayDays ?? 0}
                        onChange={(e) => setEditingPlan((prev) => prev ? { ...prev, callDelayDays: Math.max(0, parseInt(e.target.value || "0", 10) || 0) } : prev)}
                      />
                      <span className={`text-xs transition-colors ${!editCallEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>days</span>
                      <Input
                        type="number"
                        min={0}
                        max={4}
                        className={`w-16 h-7 text-sm text-center transition-colors ${!editCallEnabled ? "bg-muted text-muted-foreground border-muted" : ""}`}
                        disabled={!editCallEnabled}
                        value={editCallTaskCount}
                        onChange={(e) => setEditCallTaskCount(String(parseTaskCount(e.target.value)))}
                      />
                      <span className={`text-xs transition-colors ${!editCallEnabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>tasks</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  updatePlanMutation.isPending ||
                  !editingPlan ||
                  (!hasEditChanges && !canRegenerateSameRules) ||
                  (isLoadingEditPlanTasks && !hasEditChanges)
                }
              >
                {updatePlanMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sortedPlans.map((plan) => {
          const planTeamIds = teamIdsByPlanId[plan.id] ?? [];
          const planTeams = teams.filter((t) => planTeamIds.includes(t.id));
          const aeAssignments = assignmentsByPlanId[plan.id] ?? [];
          const canManageThisPlan =
            isAdmin ||
            (isTeamLead &&
              (
                plan.ownerId === user?.id ||
                planTeamIds.some((teamId) => headedTeamIds.has(teamId))
              ));

          return (
            <Card
              key={plan.id}
              id={`plan-card-${plan.id}`}
              className={focusedPlanId === plan.id ? "ring-2 ring-primary shadow-lg transition-all" : ""}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={plan.isActive ? "default" : "secondary"}>
                      {plan.isActive ? "Active" : "Paused"}
                    </Badge>
                    {canManageThisPlan && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Plan</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{plan.name}"? This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeletePlan(plan.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                <CardDescription>Plan Rules & Configuration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {(plan.messageDelayDays ?? 0) > 0 && (<>
                      <div className="text-muted-foreground text-xs uppercase font-semibold flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> LinkedIn Delay
                      </div>
                      <div className="text-right font-medium">{plan.messageDelayDays} days</div>
                    </>)}

                    {(plan.emailDelayDays ?? 0) > 0 && (<>
                      <div className="text-muted-foreground text-xs uppercase font-semibold flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Email Delay
                      </div>
                      <div className="text-right font-medium">{plan.emailDelayDays} days</div>
                    </>)}

                    {(plan.callDelayDays ?? 0) > 0 && (<>
                      <div className="text-muted-foreground text-xs uppercase font-semibold flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Call Delay
                      </div>
                      <div className="text-right font-medium">{plan.callDelayDays} days</div>
                    </>)}

                    <div className="text-muted-foreground text-xs uppercase font-semibold flex items-center gap-1">
                      <Users className="w-3 h-3" /> Assigned AEs
                    </div>
                    <div className="text-right font-medium">{aeAssignments.length}</div>

                    <div className="text-muted-foreground text-xs uppercase font-semibold flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Teams
                    </div>
                    <div className="text-right font-medium">
                      {planTeamIds.length === 0 ? (
                        <span className="text-muted-foreground text-xs">None</span>
                      ) : (
                        planTeamIds.length
                      )}
                    </div>
                  </div>

                  {/* Team badges */}
                  {planTeams.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {planTeams.map((t) => (
                        <Badge key={t.id} variant="outline" className="text-xs">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-2">
                    {canManageThisPlan && (
                      <Button
                        variant="outline"
                        className="w-full text-xs h-8"
                        onClick={() => {
                          const linkedinEnabled = (plan.messageDelayDays ?? 0) > 0;
                          const emailEnabled = (plan.emailDelayDays ?? 0) > 0;
                          const callEnabled = (plan.callDelayDays ?? 0) > 0;
                          const linkedinTaskCount = String(plan.linkedinTaskCount ?? 4);
                          const emailTaskCount = String(plan.emailTaskCount ?? 4);
                          const callTaskCount = String(plan.callTaskCount ?? 4);
                          const taskScheduleStartDate = (plan.taskScheduleStartDate || "").slice(0, 10);

                          setEditingPlan(plan);
                          setEditLinkedInEnabled(linkedinEnabled);
                          setEditEmailEnabled(emailEnabled);
                          setEditCallEnabled(callEnabled);
                          setEditScheduleStartDate(taskScheduleStartDate);
                          setEditLinkedinTaskCount(linkedinTaskCount);
                          setEditEmailTaskCount(emailTaskCount);
                          setEditCallTaskCount(callTaskCount);
                          setEditInitialValues(
                            buildEditComparisonValues(
                              { ...plan, taskScheduleStartDate },
                              { linkedinEnabled, emailEnabled, callEnabled },
                              { linkedinTaskCount, emailTaskCount, callTaskCount },
                            ),
                          );
                        }}
                      >
                        <Settings2 className="w-3 h-3 mr-1" />
                        Edit Rules
                      </Button>
                    )}

                    {/* Manage Teams — ADMIN and TEAM_LEAD */}
                    {canManageThisPlan && (
                      <Dialog
                        open={managingTeamsPlanId === plan.id}
                        onOpenChange={(open) => {
                          if (open) {
                            const savedTeamIds = teamIdsByPlanId[plan.id] ?? [];
                            setSelectedTeamIdsByPlan((prev) => ({ ...prev, [plan.id]: [...savedTeamIds] }));
                            setManagingTeamsPlanId(plan.id);
                            return;
                          }
                          const savedTeamIds = teamIdsByPlanId[plan.id] ?? [];
                          setSelectedTeamIdsByPlan((prev) => ({ ...prev, [plan.id]: [...savedTeamIds] }));
                          setManagingTeamsPlanId(null);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" className="w-full text-xs h-8">
                            <Building2 className="w-3 h-3 mr-1" />
                            Manage Teams
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign Teams to {plan.name}</DialogTitle>
                            <DialogDescription>
                              Select which teams can access and use this follow-up plan.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4 space-y-3">
                            {(() => {
                              const visibleTeams = isAdmin ? teams : teams.filter((t) => (user?.teamIds ?? []).includes(t.id));
                              if (visibleTeams.length === 0) return <p className="text-xs text-muted-foreground italic">No teams available. Create teams first.</p>;
                              return visibleTeams.map((team) => {
                                const currentSelected = selectedTeamIdsByPlan[plan.id] ?? [];
                                const checked = currentSelected.includes(team.id);
                                return (
                                  <div key={team.id} className="flex items-center justify-between p-2 border rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Building2 className="h-3 w-3 text-primary" />
                                      </div>
                                      <span className="text-sm font-medium">{team.name}</span>
                                    </div>
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300"
                                      checked={checked}
                                      onChange={(e) => {
                                        setSelectedTeamIdsByPlan((prev) => {
                                          const current = prev[plan.id] ?? [];
                                          return {
                                            ...prev,
                                            [plan.id]: e.target.checked
                                              ? [...current, team.id]
                                              : current.filter((id) => id !== team.id),
                                          };
                                        });
                                      }}
                                    />
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          <DialogFooter>
                            <Button className="w-full" onClick={() => handleSaveTeams(plan.id)}>
                              Save Team Assignments
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}

                    {/* Manage AEs — ADMIN + TEAM_LEAD */}
                    {canManageThisPlan && (
                      <Dialog
                        open={managingAePlanId === plan.id}
                        onOpenChange={(open) => {
                          if (open) {
                            const savedAssignments = assignmentsByPlanId[plan.id] ?? [];
                            setSelectedAeIdsByPlan((prev) => ({
                              ...prev,
                              [plan.id]: savedAssignments.map((assignment) => assignment.userId),
                            }));
                            setManagingAePlanId(plan.id);
                            return;
                          }
                          const savedAssignments = assignmentsByPlanId[plan.id] ?? [];
                          setSelectedAeIdsByPlan((prev) => ({
                            ...prev,
                            [plan.id]: savedAssignments.map((assignment) => assignment.userId),
                          }));
                          setManagingAePlanId(null);
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button variant="secondary" className="w-full text-xs h-8">
                            <Users className="w-3 h-3 mr-1" />
                            Manage AEs/SDRs
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign AEs/SDRs to {plan.name}</DialogTitle>
                            <DialogDescription>Select which team members will use this follow-up plan.</DialogDescription>
                          </DialogHeader>
                          <div className="py-4 space-y-4">
                            {getAssignableUsersForPlan(plan.id).map((ae) => {
                                const selectedIds = selectedAeIdsByPlan[plan.id] ?? [];
                                const checked = selectedIds.includes(ae.id);
                                return (
                                  <div key={ae.id} className="flex items-center justify-between p-2 border rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarFallback>{ae.name[0]}</AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <span className="text-sm font-medium">{ae.name}</span>
                                        <span className="text-xs text-muted-foreground ml-1">({ae.role})</span>
                                      </div>
                                    </div>
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300"
                                      checked={checked}
                                      onChange={(e) => {
                                        setSelectedAeIdsByPlan((prev) => {
                                          const current = prev[plan.id] ?? [];
                                          return {
                                            ...prev,
                                            [plan.id]: e.target.checked
                                              ? [...current, ae.id]
                                              : current.filter((id) => id !== ae.id),
                                          };
                                        });
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            {getAssignableUsersForPlan(plan.id).length === 0 && (
                              <p className="text-xs text-muted-foreground italic">
                                Assign at least one team first, then AE/SDR members will appear here.
                              </p>
                            )}
                          </div>
                          <DialogFooter>
                            <Button className="w-full" onClick={() => handleSaveAEs(plan.id)}>
                              Save Assignments
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {plans.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <p className="text-sm">No follow-up plans yet.</p>
            {canManagePlans && <p className="text-xs mt-1">Create your first plan to get started.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

