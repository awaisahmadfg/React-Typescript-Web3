import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import type { Team, User, Goal, Plan } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Plus, Users, Settings2, Trash2, Pencil, FileText } from "lucide-react";
import { KPIDialog } from "@/components/teams/KPIDialog";
import { useAuth } from "@/hooks/use-auth";
import { Role } from "@/lib/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

function EditTeamDialog({
  team,
  users,
  onSave,
}: {
  team: Team;
  users: User[];
  onSave: (teamId: string, leadId: string | undefined, memberIds: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState<string | undefined>(team.leadId ?? undefined);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setLeadId(team.leadId ?? undefined);
      setMemberIds(users.filter((u) => u.teamIds?.includes(team.id)).map((u) => u.id));
    }
  }, [open, team, users]);

  const availableLeads = users.filter((u) => u.role === Role.TEAM_LEAD);
  // Show AE, SDR, and Team Leads (except the one selected as head) as assignable members
  const assignableMembers = users.filter((u) => {
    if (u.role === Role.ADMIN) return false;
    // Exclude the user currently selected as this team's lead — they're auto-added
    if (u.id === leadId) return false;
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 text-muted-foreground">
          <Pencil className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Team</DialogTitle>
          <DialogDescription>Update the team lead and members.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Team Lead</Label>
            <Select
              value={leadId}
              onValueChange={(val) => setLeadId(val)}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    availableLeads.length === 0
                      ? "No team leads available yet"
                      : "Select Lead"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableLeads.length === 0 ? (
                  <SelectItem value="__no_leads__" disabled>
                    No team leads have been created yet
                  </SelectItem>
                ) : (
                  availableLeads.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Team Members</Label>
            <div className="grid grid-cols-2 gap-2 border rounded-md p-2 max-h-48 overflow-y-auto">
              {assignableMembers.length === 0 ? (
                <p className="col-span-2 text-xs text-muted-foreground italic">
                  No users available to assign. Create users first, then assign them to this team.
                </p>
              ) : (
                assignableMembers.map((member) => (
                  <div key={member.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`edit-member-${team.id}-${member.id}`}
                      className="rounded border-gray-300"
                      checked={memberIds.includes(member.id)}
                      onChange={(e) => {
                        setMemberIds((prev) =>
                          e.target.checked
                            ? [...prev, member.id]
                            : prev.filter((id) => id !== member.id),
                        );
                      }}
                    />
                    <label htmlFor={`edit-member-${team.id}-${member.id}`} className="text-sm cursor-pointer">
                      {member.name} <span className="text-muted-foreground text-xs">({member.role})</span>
                    </label>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              await onSave(team.id, leadId, memberIds);
              setOpen(false);
            }}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [reassigningMember, setReassigningMember] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamLeadId, setNewTeamLeadId] = useState<string | undefined>(undefined);
  const [newTeamMemberIds, setNewTeamMemberIds] = useState<string[]>([]);
  const [newTeamNameError, setNewTeamNameError] = useState("");

  const { data: teams = [], isLoading: isLoadingTeams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ["/api/goals"],
  });

  const { data: teamPlansMap = {} } = useQuery<Record<string, Plan[]>>({
    queryKey: ["/api/team-plans-index"],
    queryFn: async () => {
      const result: Record<string, Plan[]> = {};
      await Promise.all(
        teams.map(async (team) => {
          const res = await fetch(`/api/teams/${team.id}/plans`);
          if (res.ok) {
            result[team.id] = await res.json();
          } else {
            result[team.id] = [];
          }
        }),
      );
      return result;
    },
    enabled: teams.length > 0,
  });

  const createTeamMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      leadId?: string;
      memberIds: string[];
    }) => {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to create team");
      }
      return res.json() as Promise<Team>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-plans-index"] });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/teams/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete team");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/team-plans-index"] });
    },
  });

  const reassignMemberMutation = useMutation({
    mutationFn: async (payload: { userId: string; newTeamId: string | null }) => {
      const res = await fetch("/api/teams/reassign-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to reassign member");
      }
      return res.json() as Promise<User>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async (payload: { id: string; updates: Partial<Team> }) => {
      const res = await fetch(`/api/teams/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.updates),
      });
      if (!res.ok) {
        throw new Error("Failed to update team");
      }
      return res.json() as Promise<Team>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const handleEditTeam = async (teamId: string, newLeadId: string | undefined, newMemberIds: string[]) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;

    const currentMemberIds = users.filter((u) => u.teamIds?.includes(teamId)).map((u) => u.id);

    const toAdd = newMemberIds.filter((id) => !currentMemberIds.includes(id));
    const toRemove = currentMemberIds.filter((id) => !newMemberIds.includes(id));

    try {
      // Optimistic UI update for team lead so card updates instantly
      queryClient.setQueryData<Team[] | undefined>(["/api/teams"], (old) =>
        old
          ? old.map((t) =>
              t.id === teamId
                ? {
                    ...t,
                    leadId: newLeadId ?? null,
                  }
                : t,
            )
          : old,
      );

      const promises: Promise<unknown>[] = [];

      if (newLeadId !== team.leadId) {
        promises.push(
          updateTeamMutation.mutateAsync({
            id: teamId,
            updates: { leadId: newLeadId ?? null },
          }),
        );
      }

      for (const userId of toAdd) {
        promises.push(
          fetch(`/api/teams/${teamId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId }),
          }).then((res) => {
            if (!res.ok) throw new Error("Failed to add member");
            return res.json();
          }),
        );
      }

      for (const userId of toRemove) {
        promises.push(
          fetch(`/api/teams/${teamId}/members/${userId}`, {
            method: "DELETE",
          }).then((res) => {
            if (!res.ok) throw new Error("Failed to remove member");
          }),
        );
      }

      await Promise.all(promises);

      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });

      toast({
        title: "Team Updated",
        description: "Team lead and memberships have been updated.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update team.",
        variant: "destructive",
      });
    }
  };
  
  if (isLoadingTeams) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground mt-1">Manage teams and memberships</p>
        </div>
        {user?.role === Role.ADMIN && (
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setNewTeamNameError(""); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogDescription>Add a new organizational unit.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Team Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. Red Dragons"
                    value={newTeamName}
                    onChange={(e) => { setNewTeamName(e.target.value); if (newTeamNameError) setNewTeamNameError(""); }}
                    className={newTeamNameError ? "border-destructive" : ""}
                  />
                  {newTeamNameError && <p className="text-xs text-destructive">{newTeamNameError}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Team Lead</Label>
                  <Select
                    value={newTeamLeadId}
                    onValueChange={(val) => setNewTeamLeadId(val)}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          users.filter((u) => u.role === Role.TEAM_LEAD).length === 0
                            ? "No team leads available yet"
                            : "Select Lead"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter((u) => u.role === Role.TEAM_LEAD).length === 0 ? (
                        <SelectItem value="__no_leads__" disabled>
                          No team leads have been created yet
                        </SelectItem>
                      ) : (
                        users
                          .filter((u) => u.role === Role.TEAM_LEAD)
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    You can still create the team without a lead and assign one later from User Management.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Team Members</Label>
                  <div className="grid grid-cols-2 gap-2 border rounded-md p-2 max-h-40 overflow-y-auto">
                    {users.filter(u => u.role !== Role.ADMIN && u.id !== newTeamLeadId).length === 0 ? (
                      <p className="col-span-2 text-xs text-muted-foreground italic">
                        No users available yet. Create users first, then assign them to this team.
                      </p>
                    ) : (
                      users
                        .filter(u => u.role !== Role.ADMIN && u.id !== newTeamLeadId)
                        .map(u => (
                          <div key={u.id} className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`member-${u.id}`}
                              className="rounded border-gray-300"
                              checked={newTeamMemberIds.includes(u.id)}
                              onChange={(e) => {
                                setNewTeamMemberIds((prev) =>
                                  e.target.checked
                                    ? [...prev, u.id]
                                    : prev.filter((id) => id !== u.id),
                                );
                              }}
                            />
                            <label htmlFor={`member-${u.id}`} className="text-sm cursor-pointer">
                              {u.name} <span className="text-muted-foreground text-xs">({u.role})</span>
                            </label>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  className="w-full"
                  disabled={createTeamMutation.isPending}
                  onClick={() => {
                    if (!newTeamName.trim()) {
                      setNewTeamNameError("Team name is required.");
                      return;
                    }
                    if (newTeamName.trim().length > 80) {
                      setNewTeamNameError("Team name must be 80 characters or fewer.");
                      return;
                    }
                    setNewTeamNameError("");
                    createTeamMutation.mutate(
                      {
                        name: newTeamName.trim(),
                        leadId: newTeamLeadId,
                        memberIds: newTeamMemberIds,
                      },
                      {
                        onSuccess: () => {
                          toast({ title: "Team Created", description: "Organization unit added." });
                          setIsCreateOpen(false);
                          setNewTeamName("");
                          setNewTeamLeadId(undefined);
                          setNewTeamMemberIds([]);
                        },
                        onError: (error: any) => {
                          toast({
                            title: "Unable to create team",
                            description: error?.message || "Failed to create team.",
                            variant: "destructive",
                          });
                        },
                      },
                    );
                  }}
                >
                  {createTeamMutation.isPending ? "Creating..." : "Create Team"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {teams.map((team) => {
          const teamLead = users.find(u => u.id === team.leadId);
          const membersById = new Map<string, User>();
          users
            .filter((u) => u.teamIds?.includes(team.id))
            .forEach((u) => membersById.set(u.id, u));
          if (teamLead) {
            // Ensure team lead always appears even if junction table is briefly out of sync.
            membersById.set(teamLead.id, teamLead);
          }
          const members = Array.from(membersById.values());
          const teamGoals = goals.filter(g => g.teamId === team.id);
          const teamPlansList = teamPlansMap[team.id] ?? [];

          return (
            <Card key={team.id} className="overflow-hidden">
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                       <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{team.name}</CardTitle>
                      <CardDescription>{members.length} Members</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {user?.role === Role.ADMIN && (
                      <>
                        <KPIDialog team={team} existingGoals={teamGoals} />
                        <EditTeamDialog team={team} users={users} onSave={handleEditTeam} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Team</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete {team.name}? This action cannot be undone and will require all members to be reassigned.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => {
                                deleteTeamMutation.mutate(team.id, {
                                  onSuccess: () => {
                                    toast({ title: "Team Deleted", description: `${team.name} has been removed.` });
                                  },
                                  onError: () => {
                                    toast({ title: "Error", description: "Failed to delete team.", variant: "destructive" });
                                  },
                                });
                              }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-2">
                   <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Team Lead</h4>
                   <div className="flex items-center gap-3 p-2 rounded-lg border bg-card">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={teamLead?.avatar} />
                        <AvatarFallback>TL</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{teamLead?.name}</p>
                        <p className="text-xs text-muted-foreground">{teamLead?.email}</p>
                      </div>
                      <Badge variant="secondary">Lead</Badge>
                   </div>
                </div>

                <div className="space-y-2">
                   <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Active KPIs</h4>
                   <div className="grid grid-cols-2 gap-2">
                     {teamGoals.length > 0 ? (
                       teamGoals.slice(0, 4).map(goal => (
                         <div key={goal.id} className="bg-muted/30 p-2 rounded text-xs flex justify-between items-center">
                            <span className="text-muted-foreground font-medium truncate pr-2">{goal.metric.replace(/_/g, ' ')}</span>
                            <span className="font-bold bg-background border px-1.5 py-0.5 rounded shadow-sm">{goal.target}</span>
                         </div>
                       ))
                     ) : (
                       <p className="text-xs text-muted-foreground italic col-span-2">No active goals set.</p>
                     )}
                   </div>
                </div>

                <div className="space-y-2">
                   <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Members</h4>
                   <div className="space-y-2">
                      {members.map(member => (
                        <div key={member.id} className="flex items-center gap-3">
                           <Avatar className="w-6 h-6">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback>{member.name[0]}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{member.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{member.role}</span>
                          {user?.role === Role.ADMIN && (
                            <Dialog open={reassigningMember === member.id} onOpenChange={(open) => setReassigningMember(open ? member.id : null)}>
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 ml-2 text-muted-foreground hover:text-primary">
                                  <Settings2 className="w-3 h-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Reassign {member.name}</DialogTitle>
                                  <DialogDescription>Move this member to a different team.</DialogDescription>
                                </DialogHeader>
                                <div className="py-4">
                                  <Label>Select New Team</Label>
                                  <Select
                                    onValueChange={(val) => {
                                      reassignMemberMutation.mutate(
                                        { userId: member.id, newTeamId: val },
                                        {
                                          onSuccess: () => {
                                            toast({ title: "Member Reassigned", description: `${member.name} has been moved successfully.` });
                                            setReassigningMember(null);
                                          },
                                          onError: () => {
                                            toast({ title: "Error", description: "Failed to reassign member.", variant: "destructive" });
                                          },
                                        },
                                      );
                                    }}
                                  >
                                    <SelectTrigger><SelectValue placeholder="Select Team" /></SelectTrigger>
                                    <SelectContent>
                                      {teams.map(t => (
                                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      ))}
                   </div>
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Follow-up Plans
                  </h4>
                  {teamPlansList.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No plans assigned to this team.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {teamPlansList.map((plan) => (
                        <Badge key={plan.id} variant="outline" className="text-xs gap-1">
                          {plan.name}
                          {!plan.isActive && (
                            <span className="text-muted-foreground">(paused)</span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
