import { useAuth } from "@/hooks/use-auth";
import { Role, User, Team } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User2, Plus, Trash2, UserCog, ShieldCheck, Mail, UserMinus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

export default function UsersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createUserErrors, setCreateUserErrors] = useState<Record<string, string>>({});

  const { data: users = [], isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const [newUser, setNewUser] = useState<{ name: string; email: string; role: Role; teamId?: string; password?: string; sendEmail: boolean }>({
    name: "",
    email: "",
    role: Role.SDR,
    teamId: undefined,
    password: "",
    sendEmail: true,
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; role: Role; teamId?: string; password?: string; sendEmail?: boolean }) => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to create user");
      }
      return res.json() as Promise<User>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (payload: { id: string; updates: Partial<User> }) => {
      const res = await fetch(`/api/users/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.updates),
      });
      if (!res.ok) {
        throw new Error("Failed to update user");
      }
      return res.json() as Promise<User>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete user");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  if (!user || user.role !== Role.ADMIN) return <div className="p-8 text-center">Access Denied</div>;

  if (isLoadingUsers) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  const activeUsers = users.filter(u => u.isActive);
  const inactiveUsers = users.filter(u => !u.isActive);

  const handleCreateUser = () => {
    const errors: Record<string, string> = {};
    if (!newUser.name.trim()) errors.name = "Full name is required.";
    if (!newUser.email.trim()) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    if (newUser.password && newUser.password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }
    if (Object.keys(errors).length > 0) {
      setCreateUserErrors(errors);
      return;
    }
    setCreateUserErrors({});

    createUserMutation.mutate(
      {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        teamId: newUser.teamId,
        password: newUser.password,
        sendEmail: newUser.sendEmail,
      },
      {
        onSuccess: (created) => {
          toast({ title: "User Created", description: `${created.name} has been added as ${created.role}.` });
          setNewUser({ name: "", email: "", role: Role.SDR, teamId: undefined, password: "", sendEmail: true });
          setCreateUserErrors({});
          setIsCreateOpen(false);
        },
        onError: (error: any) => {
          toast({
            title: "Unable to create user",
            description: error?.message || "Failed to create user.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleToggleStatus = (userId: string, currentIsActive: boolean) => {
    const newIsActive = !currentIsActive;
    updateUserMutation.mutate(
      { id: userId, updates: { isActive: newIsActive } },
      {
        onSuccess: () => {
          toast({
            title: `User ${newIsActive ? "Restored" : "Deactivated"}`,
            description: `User status updated successfully.`,
          });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update user.", variant: "destructive" });
        },
      },
    );
  };

  const handleDeleteUser = (userId: string) => {
    deleteUserMutation.mutate(userId, {
      onSuccess: () => {
        toast({ title: "User Deleted", description: "User record removed permanently.", variant: "destructive" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete user.", variant: "destructive" });
      },
    });
  };

  const UserList = ({ list, isInactive = false }: { list: any[], isInactive?: boolean }) => (
    <div className="grid gap-4">
      {list.map(u => (
        <Card key={u.id} className={cn("overflow-hidden", isInactive && "opacity-60")}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <User2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold">{u.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" /> {u.email}
                  <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <UserCog className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update User Role</DialogTitle>
                    <DialogDescription>Change the permission level for {u.name}.</DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        defaultValue={u.role}
                        onValueChange={(val) =>
                          updateUserMutation.mutate({ id: u.id, updates: { role: val as Role } })
                        }
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                          <SelectItem value={Role.TEAM_LEAD}>Team Lead</SelectItem>
                          <SelectItem value={Role.AE}>Account Executive</SelectItem>
                          <SelectItem value={Role.SDR}>Sales Development Rep</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-muted-foreground"
                onClick={() => handleToggleStatus(u.id, u.isActive)}
              >
                {isInactive ? <UserCheck className="h-4 w-4 text-emerald-600" /> : <UserMinus className="h-4 w-4 text-amber-600" />}
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive"
                onClick={() => handleDeleteUser(u.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {list.length === 0 && (
        <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
          No users found.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">Create, assign roles, and manage user access</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setCreateUserErrors({}); }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Create User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new team member to SalesPulse.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="John Doe"
                  value={newUser.name}
                  onChange={e => { setNewUser({...newUser, name: e.target.value}); if (createUserErrors.name) setCreateUserErrors(p => ({...p, name: ""})); }}
                  className={createUserErrors.name ? "border-destructive" : ""}
                />
                {createUserErrors.name && <p className="text-xs text-destructive">{createUserErrors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Email Address <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={newUser.email}
                  onChange={e => { setNewUser({...newUser, email: e.target.value}); if (createUserErrors.email) setCreateUserErrors(p => ({...p, email: ""})); }}
                  className={createUserErrors.email ? "border-destructive" : ""}
                />
                {createUserErrors.email && <p className="text-xs text-destructive">{createUserErrors.email}</p>}
              </div>
              <div className="space-y-2">
                <Label>Initial Password <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  type="text"
                  placeholder="Leave blank to auto-generate"
                  value={newUser.password}
                  onChange={e => { setNewUser({ ...newUser, password: e.target.value }); if (createUserErrors.password) setCreateUserErrors(p => ({...p, password: ""})); }}
                  className={createUserErrors.password ? "border-destructive" : ""}
                />
                {createUserErrors.password && <p className="text-xs text-destructive">{createUserErrors.password}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={newUser.role} onValueChange={val => setNewUser({...newUser, role: val as Role})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Role.ADMIN}>Admin</SelectItem>
                      <SelectItem value={Role.TEAM_LEAD}>Team Lead</SelectItem>
                      <SelectItem value={Role.AE}>Account Executive</SelectItem>
                      <SelectItem value={Role.SDR}>Sales Development Rep</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Team</Label>
                  <Select value={newUser.teamId} onValueChange={val => setNewUser({...newUser, teamId: val})}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={teams.length === 0 ? "No teams available yet" : "Select team (optional)"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.length === 0 ? (
                        <SelectItem value="__no_teams__" disabled>
                          No teams have been created yet
                        </SelectItem>
                      ) : (
                        teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="space-y-0.5">
                  <Label>Email credentials to user</Label>
                  <p className="text-xs text-muted-foreground">
                    Sends an email with their login email and initial password.
                  </p>
                </div>
                <Switch
                  checked={newUser.sendEmail}
                  onCheckedChange={(checked) => setNewUser({ ...newUser, sendEmail: checked })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Adding..." : "Add User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="active" className="space-y-6">
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <ShieldCheck className="w-4 h-4" /> Active Users
          </TabsTrigger>
          <TabsTrigger value="inactive" className="gap-2">
            <UserMinus className="w-4 h-4" /> Inactive Users
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="active">
          <UserList list={activeUsers} />
        </TabsContent>
        
        <TabsContent value="inactive">
          <UserList list={inactiveUsers} isInactive />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
