import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, Clock, Mail, MessageSquare, AlertCircle, Plus, Trash2, Pencil } from "lucide-react";
import { format, isPast, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ReminderDialog } from "@/components/leads/ReminderDialog";
import { Link } from "wouter";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Lead, Role, Team, User } from "@/lib/types";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export default function TasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "today" | "overdue">("all");
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [newTaskLeadId, setNewTaskLeadId] = useState("");
  const [newTaskUserId, setNewTaskUserId] = useState("");
  const [newTaskType, setNewTaskType] = useState("EMAIL");
  const [newTaskTypeOther, setNewTaskTypeOther] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [newTaskDueDate, setNewTaskDueDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newTaskNotes, setNewTaskNotes] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});

  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["/api/leads", user?.id, user?.role, user?.teamIds?.join(",")],
    enabled: !!user,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/leads?includeStale=true", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch leads");
      }
      return res.json();
    },
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams", user?.id, user?.role],
    enabled: !!user,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/teams", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch teams");
      }
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  interface TaskItem {
    id: string;
    userId: string;
    createdByUserId?: string | null;
    leadId?: string | null;
    planId?: string | null;
    planName?: string | null;
    teamName?: string | null;
    leadName: string;
    assigneeName: string;
    company: string;
    type: string;
    dueDate: Date;
    createdAt: Date;
    priority: string;
    notes?: string | null;
    status: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
  }

  const tasksQueryUrl = user
    ? user.role === Role.AE || user.role === Role.SDR
      ? `/api/tasks?userId=${user.id}`
      : "/api/tasks"
    : "/api/tasks";

  const { data: rawTasks = [] } = useQuery<any[]>({
    queryKey: ["/api/tasks", user?.id, user?.role, user?.teamIds?.join(",")],
    enabled: !!user,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(tasksQueryUrl, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch tasks");
      }
      return res.json();
    },
  });

  const getTaskTypeLabel = (type: string): string => {
    const upper = type.toUpperCase();
    if (upper === "EMAIL") return "Email Follow-up";
    if (upper === "LINKEDIN") return "LinkedIn Connection Request";
    if (upper === "CALL") return "Phone Call";
    if (upper === "OTHER") return "Other";
    return type; // legacy display labels or custom OTHER text
  };

  const tasks: TaskItem[] = rawTasks
    .map((t) => {
      const lead = leads.find((l) => l.id === t.leadId);
      const assignee = users.find((u) => u.id === t.userId);

      // Map task type to icon and color
      let icon: TaskItem["icon"] = Clock;
      let color = "text-muted-foreground";
      const type: string = t.type;

      if (type.toLowerCase().includes("email")) {
        icon = Mail;
        color = "text-blue-500";
      } else if (type.toLowerCase().includes("linkedin")) {
        icon = MessageSquare;
        color = "text-indigo-500";
      } else if (type.toLowerCase().includes("follow-up") || type.toLowerCase().includes("followup")) {
        icon = Clock;
        color = "text-amber-500";
      } else if (type.toLowerCase().includes("call")) {
        icon = Clock;
        color = "text-emerald-500";
      }

      return {
        id: t.id,
        userId: t.userId,
        createdByUserId: t.createdByUserId ?? null,
        leadId: t.leadId ?? null,
        planId: t.planId ?? null,
        planName: t.planName ?? null,
        teamName: t.teamName ?? null,
        leadName: t.leadName || (lead ? `${lead.firstName} ${lead.lastName}` : "Unknown Lead"),
        assigneeName: assignee?.name || "Unknown User",
        company: t.company ?? t.teamName ?? lead?.company ?? "Unknown",
        type,
        dueDate: new Date(t.dueDate),
        createdAt: t.createdAt ? new Date(t.createdAt) : new Date(0),
        priority: t.priority ?? "MEDIUM",
        notes: t.notes,
        status: t.status ?? "OPEN",
        icon,
        color,
      };
    });

  const visibleLeads = useMemo(() => {
    if (!user) return [];
    return leads;
  }, [leads, user]);

  const filteredLeads = visibleLeads
    .filter(
      (l) =>
        `${l.firstName} ${l.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.company && l.company.toLowerCase().includes(searchQuery.toLowerCase())),
    );

  const selectedLead = visibleLeads.find((l) => l.id === newTaskLeadId);
  const assignableUsers = useMemo(() => {
    if (!user) return [];

    if (user.role === Role.ADMIN) {
      // Admin can assign to any active user.
      return users.filter((u) => u.isActive);
    }

    if (user.role === Role.TEAM_LEAD) {
      // Only teams the TL actually HEADS — not teams they're just a member of
      const headedTeamIds = new Set<string>();
      teams.forEach((team) => {
        if (team.leadId === user.id) {
          headedTeamIds.add(team.id);
        }
      });

      // Self is always assignable, plus AE/SDR members of headed teams
      const scopedMembers = users.filter(
        (u) =>
          u.isActive &&
          (u.role === Role.AE || u.role === Role.SDR) &&
          (u.teamIds?.some((id) => headedTeamIds.has(id)) || (!!u.teamId && headedTeamIds.has(u.teamId))),
      );
      const self = users.find((u) => u.id === user.id && u.isActive);
      const uniqueAssignable = new Map<string, User>();
      if (self) {
        uniqueAssignable.set(self.id, self);
      }
      scopedMembers.forEach((member) => {
        uniqueAssignable.set(member.id, member);
      });
      return Array.from(uniqueAssignable.values());
    }

    // AE/SDR can assign tasks only to themselves.
    return users.filter((u) => u.isActive && u.id === user.id);
  }, [user, users, teams]);
  const selectedAssignee = assignableUsers.find((u) => u.id === newTaskUserId);

  useEffect(() => {
    if (!user) return;
    // If current selection is no longer assignable (e.g., lead team changed), reset.
    if (newTaskUserId && !assignableUsers.find((u) => u.id === newTaskUserId)) {
      const fallback = assignableUsers.find((u) => u.id === user.id)?.id ||
        assignableUsers[0]?.id ||
        "";
      setNewTaskUserId(fallback);
      return;
    }
    if (newTaskUserId) return;
    // Default: assign to self when possible, otherwise first available.
    const selfAssignable = assignableUsers.find((u) => u.id === user.id);
    setNewTaskUserId(selfAssignable?.id || assignableUsers[0]?.id || "");
  }, [assignableUsers, newTaskUserId, user]);

  const openTasks = tasks
    .filter((task) => task.status === "OPEN")
    .filter(
      (task) =>
        task.leadName.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
        task.company.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
        (task.planName || "").toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
        task.type.toLowerCase().includes(taskSearchQuery.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const filteredTasks = openTasks.filter(task => {
    if (filter === "all") return true;
    if (filter === "today") return isToday(task.dueDate);
    if (filter === "overdue") return isPast(task.dueDate) && !isToday(task.dueDate);
    return true;
  });

  const createTaskMutation = useMutation({
    mutationFn: async (payload: {
      leadId: string;
      type: string;
      dueDate: string;
      notes?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: payload.leadId,
          userId: newTaskUserId || user.id,
          type: payload.type,
          dueDate: payload.dueDate,
          notes: payload.notes,
          status: "OPEN",
          priority: newTaskPriority,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to create task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async (payload: { id: string; updates: any }) => {
      const res = await fetch(`/api/tasks/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to update task");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tasks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const handleDeleteTask = () => {
    if (!deleteTarget) return;
    deleteTaskMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast({ title: "Task Deleted", description: `Deleted "${deleteTarget.type}" task.` });
        setDeleteTarget(null);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete task.", variant: "destructive" });
        setDeleteTarget(null);
      },
    });
  };

  const canEditTask = (task: TaskItem) => {
    if (!user) return false;
    const creatorId = task.createdByUserId || task.userId;
    if (user.role === Role.ADMIN || user.role === Role.TEAM_LEAD) return true;
    return creatorId === user.id || task.userId === user.id;
  };

  const resetTaskForm = () => {
    setNewTaskLeadId("");
    setSearchQuery("");
    setNewTaskType("EMAIL");
    setNewTaskTypeOther("");
    setNewTaskPriority("MEDIUM");
    setNewTaskDueDate(format(new Date(), "yyyy-MM-dd"));
    setNewTaskNotes("");
    setTaskErrors({});
    if (user) {
      const selfAssignable = assignableUsers.find((u) => u.id === user.id);
      setNewTaskUserId(selfAssignable?.id || assignableUsers[0]?.id || "");
    } else {
      setNewTaskUserId("");
    }
  };

  const openAddTaskDialog = () => {
    setEditingTaskId(null);
    resetTaskForm();
    setIsCreateOpen(true);
  };

  const openEditTaskDialog = (task: TaskItem) => {
    if (!canEditTask(task)) {
      toast({
        title: "Permission denied",
        description: "You do not have permission to edit this task.",
        variant: "destructive",
      });
      return;
    }
    if (!task.leadId) {
      toast({
        title: "Plan task",
        description: "This is a plan-level task and cannot be edited from lead task form.",
      });
      return;
    }
    setEditingTaskId(task.id);
    setNewTaskLeadId(task.leadId || "");
    setSearchQuery("");
    setNewTaskUserId(task.userId);
    const lowerType = task.type.toLowerCase();
    if (lowerType.includes("email")) {
      setNewTaskType("EMAIL");
      setNewTaskTypeOther("");
    } else if (lowerType.includes("linkedin")) {
      setNewTaskType("LINKEDIN");
      setNewTaskTypeOther("");
    } else if (lowerType.includes("call")) {
      setNewTaskType("CALL");
      setNewTaskTypeOther("");
    } else {
      setNewTaskType("OTHER");
      setNewTaskTypeOther(task.type);
    }
    setNewTaskPriority((["LOW", "MEDIUM", "HIGH"].includes(task.priority) ? task.priority : "MEDIUM") as "LOW" | "MEDIUM" | "HIGH");
    setNewTaskDueDate(format(task.dueDate, "yyyy-MM-dd"));
    setNewTaskNotes(task.notes || "");
    setIsCreateOpen(true);
  };

  const handleSubmitTask = () => {
    const errors: Record<string, string> = {};
    if (!newTaskLeadId) errors.leadId = "Please select a lead.";
    if (!newTaskUserId) errors.userId = "Please select an assignee.";
    if (newTaskType === "OTHER" && !newTaskTypeOther.trim()) errors.typeOther = "Please enter the custom task type.";
    if (Object.keys(errors).length > 0) { setTaskErrors(errors); return; }
    setTaskErrors({});

    const lead = visibleLeads.find(l => l.id === newTaskLeadId);
    if (!lead || !user) return;

    const type =
      newTaskType === "EMAIL"
        ? "Email Follow-up"
        : newTaskType === "LINKEDIN"
        ? "LinkedIn Message"
        : newTaskType === "CALL"
        ? "Phone Call"
        : newTaskTypeOther.trim();

    const commonPayload = {
      leadId: lead.id,
      userId: newTaskUserId || user.id,
      type,
      dueDate: newTaskDueDate,
      notes: newTaskNotes,
      priority: newTaskPriority,
    };

    if (editingTaskId) {
      updateTaskMutation.mutate(
        { id: editingTaskId, updates: commonPayload },
        {
          onSuccess: () => {
            toast({ title: "Task Updated", description: "Task has been updated successfully." });
            setIsCreateOpen(false);
            setEditingTaskId(null);
            resetTaskForm();
          },
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to update task.",
              variant: "destructive",
            });
          },
        },
      );
      return;
    }

    createTaskMutation.mutate(
      {
        leadId: commonPayload.leadId,
        type: commonPayload.type,
        dueDate: commonPayload.dueDate,
        notes: commonPayload.notes,
      },
      {
        onSuccess: () => {
          toast({ title: "Task Created", description: "New task has been scheduled." });
          setIsCreateOpen(false);
          resetTaskForm();
        },
        onError: (error: any) => {
          toast({
            title: "Error",
            description: error?.message || "Failed to create task.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleComplete = (task: TaskItem) => {
    updateTaskMutation.mutate(
      { id: task.id, updates: { status: "COMPLETED" } },
      {
        onSuccess: () => {
          toast({
            title: "Task Completed",
            description: `Completed "${task.type}"`,
          });
          if (task.leadId) {
            setSelectedTask(task);
            setIsReminderOpen(true);
          }
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to complete task.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onReminderSuccess = (followupData?: { date: string, notes: string }) => {
    // Do not auto-create a new follow-up task from this reminder modal.
    // Completing a task should only log one completion activity in the lead timeline.
    toast({
      title: followupData ? "Follow-up Scheduled" : "Task Finished",
      description: followupData 
        ? `Next follow-up scheduled for ${selectedTask?.leadName ?? "this lead"}`
        : `Completed task for ${selectedTask?.leadName ?? "this lead"} without further follow-up.`,
    });
    setSelectedTask(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {selectedTask && (
        <ReminderDialog
          open={isReminderOpen}
          onOpenChange={setIsReminderOpen}
          leadId={selectedTask.leadId}
          leadName={selectedTask.leadName}
          onSuccess={onReminderSuccess}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{deleteTarget?.type}" task for {deleteTarget?.leadName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteTask();
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
          <h1 className="text-3xl font-bold tracking-tight">To-Do Tasks</h1>
          <p className="text-muted-foreground mt-1">Manage your daily outreach and follow-ups</p>
        </div>
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (open) {
              setSearchQuery("");
            } else {
              setTaskErrors({});
            }
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openAddTaskDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTaskId ? "Edit Task" : "Create New Task"}</DialogTitle>
              <DialogDescription>
                {editingTaskId ? "Update task details for this lead." : "Schedule a new action for a lead."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Select Lead <span className="text-destructive">*</span></Label>
                <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={leadPickerOpen}
                      className={cn("w-full justify-between", taskErrors.leadId && "border-destructive")}
                      onClick={() => { if (taskErrors.leadId) setTaskErrors(p => ({...p, leadId: ""})); }}
                    >
                      {selectedLead
                        ? `${selectedLead.firstName} ${selectedLead.lastName} (${selectedLead.company})`
                        : "Search and select lead record..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[460px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search lead by name or company..."
                        value={searchQuery}
                        onValueChange={setSearchQuery}
                      />
                      <CommandList>
                        <CommandEmpty>No leads found.</CommandEmpty>
                        <CommandGroup>
                          {filteredLeads.map((l) => (
                            <CommandItem
                              key={l.id}
                              value={`${l.firstName} ${l.lastName} ${l.company || ""}`}
                              onSelect={() => {
                                setNewTaskLeadId(l.id);
                                setLeadPickerOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", newTaskLeadId === l.id ? "opacity-100" : "opacity-0")} />
                              {l.firstName} {l.lastName} ({l.company})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {taskErrors.leadId && <p className="text-xs text-destructive">{taskErrors.leadId}</p>}
              </div>
              <div className="space-y-2">
                <Label>Assign To <span className="text-destructive">*</span></Label>
                <Select
                  value={newTaskUserId}
                  onValueChange={(v) => { setNewTaskUserId(v); if (taskErrors.userId) setTaskErrors(p => ({...p, userId: ""})); }}
                  disabled={assignableUsers.length === 0}
                >
                  <SelectTrigger className={taskErrors.userId ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select assignee">
                      {selectedAssignee
                        ? `${selectedAssignee.name}${selectedAssignee.id === user?.id ? " (You)" : ""} — ${selectedAssignee.role}`
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {assignableUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                        {u.id === user?.id ? " (You)" : ""} — {u.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {taskErrors.userId && <p className="text-xs text-destructive">{taskErrors.userId}</p>}
              </div>
              <div className="space-y-2">
                <Label>Task Type</Label>
                <Select value={newTaskType} onValueChange={setNewTaskType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMAIL">Email Follow-up</SelectItem>
                    <SelectItem value="LINKEDIN">LinkedIn Message</SelectItem>
                    <SelectItem value="CALL">Phone Call</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                {newTaskType === "OTHER" && (
                  <Input
                    placeholder="Enter custom task type"
                    value={newTaskTypeOther}
                    className={taskErrors.typeOther ? "border-destructive" : ""}
                    onChange={(e) => { setNewTaskTypeOther(e.target.value); if (taskErrors.typeOther) setTaskErrors(p => ({...p, typeOther: ""})); }}
                  />
                )}
                {taskErrors.typeOther && <p className="text-xs text-destructive">{taskErrors.typeOther}</p>}
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input 
                  type="date" 
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={newTaskPriority}
                  onValueChange={(value: "LOW" | "MEDIUM" | "HIGH") => setNewTaskPriority(value)}
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
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={handleSubmitTask}>
                {editingTaskId ? "Update Task" : "Create Task"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-1 bg-secondary/50 p-1 rounded-lg w-fit">
          {(["all", "today", "overdue"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-all",
                filter === f 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Input
            placeholder="Search tasks..."
            value={taskSearchQuery}
            onChange={(e) => setTaskSearchQuery(e.target.value)}
            className="pl-8"
          />
          <svg
            className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredTasks.map((task) => (
          <Card key={task.id} className="hover:bg-muted/30 transition-colors">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn("p-2 rounded-full bg-background border", task.color)}>
                  <task.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{getTaskTypeLabel(task.type)}</p>
                    <Badge variant="outline" className="text-[10px] uppercase h-4 px-1">
                      {task.priority}
                    </Badge>
                  </div>
                  {task.leadId ? (
                    <Link href={`/leads/${task.leadId}`} className="text-sm text-muted-foreground hover:underline">
                      Lead: {task.leadName} • <span className="text-xs">{task.company}</span>
                    </Link>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Plan: {task.planName || task.leadName.replace(/^Plan:\s*/, "")} • <span className="text-xs">{task.teamName || task.company}</span>
                    </p>
                  )}
                  {user?.role === Role.ADMIN && (
                    <p className="text-xs text-muted-foreground">
                      Assignee: {task.assigneeName}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {isPast(task.dueDate) && !isToday(task.dueDate) ? (
                      <AlertCircle className="w-4 h-4 text-destructive" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className={cn(
                      isPast(task.dueDate) && !isToday(task.dueDate) ? "text-destructive" : "text-foreground"
                    )}>
                      {format(task.dueDate, "MMM d, yyyy")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                </div>
                <Button size="sm" onClick={() => handleComplete(task)}>
                  Complete
                </Button>
                {task.leadId && canEditTask(task) && (
                  <Button size="sm" variant="ghost" onClick={() => openEditTaskDialog(task)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(task)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredTasks.length === 0 && (
          <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
            No tasks found for the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}
