import { useAuth } from "@/hooks/use-auth";
import { userBelongsToTeam } from "@/lib/team-utils";
import { Role, User, Team } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Linkedin, User2, Users, Mail, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";

interface LinkedinProfile {
  id: string;
  userId: string;
  name: string;
  url: string;
  status: string;
}

interface EmailAccount {
  id: string;
  userId: string;
  address: string;
  provider: string;
  status: string;
}

export default function ProfilesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newProfile, setNewProfile] = useState({ name: "", url: "" });
  const [newEmail, setNewEmail] = useState({ address: "", provider: "Google" });
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  // Fetch real data
  const { data: profiles = [], isLoading: profilesLoading } = useQuery<LinkedinProfile[]>({
    queryKey: ["/api/linkedin-profiles"],
  });
  const { data: emails = [], isLoading: emailsLoading } = useQuery<EmailAccount[]>({
    queryKey: ["/api/email-accounts"],
  });
  
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });
  
  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const res = await apiRequest("PATCH", `/api/linkedin-profiles/${id}`, { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-profiles"] });
      toast({ title: "Profile Assigned", description: "LinkedIn profile reassigned successfully." });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const res = await apiRequest("PATCH", `/api/email-accounts/${id}`, { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-accounts"] });
      toast({ title: "Email Assigned", description: "Email account reassigned successfully." });
    },
  });

  const createProfileMutation = useMutation({
    mutationFn: async (data: { userId: string; name: string; url: string }) => {
      const res = await apiRequest("POST", "/api/linkedin-profiles", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-profiles"] });
      toast({ title: "Profile Added", description: "New LinkedIn profile created." });
    },
  });

  const createEmailMutation = useMutation({
    mutationFn: async (data: { userId: string; address: string; provider: string }) => {
      const res = await apiRequest("POST", "/api/email-accounts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-accounts"] });
      toast({ title: "Email Added", description: "New email account added." });
    },
  });

  if (!user) return null;
  if (profilesLoading || emailsLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  const visibleUserIds = new Set<string>([  user.id,  ...profiles.map((p) => p.userId),  ...emails.map((e) => e.userId),]);

  // Show only users that the current user is allowed to see (based on roles)
  const filteredUsers = allUsers.filter((u) => {
    if (user.role === Role.ADMIN) return true;            // admins see everyone
    return visibleUserIds.has(u.id);                      // others see themselves + server-scoped users
  });


  const getProfilesForUser = (userId: string) => profiles.filter((p) => p.userId === userId);
  const getEmailsForUser = (userId: string) => emails.filter((e) => e.userId === userId);

const canManageUser = (targetUserId: string) => {
  if (user.role === Role.ADMIN) return true;
  return visibleUserIds.has(targetUserId); // server determines/manageability
};


  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profiles & Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage LinkedIn pseudo profiles and email accounts</p>
        </div>
      </div>

      <div className="grid gap-6">
        {filteredUsers.map((u) => {
          const userProfiles = getProfilesForUser(u.id);
          const userEmails = getEmailsForUser(u.id);

          return (
            <Card key={u.id} className="overflow-hidden">
              <CardHeader className="bg-muted/30 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <User2 className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{u.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase">{u.role}</Badge>
                        {(u.teamIds?.length ? u.teamIds : u.teamId ? [u.teamId] : []).length > 0 && (
                          <span className="flex items-center gap-1 text-xs">
                            <Users className="w-3 h-3" />
                            {(u.teamIds?.length ? u.teamIds : u.teamId ? [u.teamId] : [])
                              .map((tid) => teams.find((t) => t.id === tid)?.name)
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-sm font-bold text-primary">{userProfiles.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Profiles</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-primary">{userEmails.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Emails</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Tabs defaultValue="linkedin">
                  <div className="flex justify-between items-center mb-4">
                    <TabsList>
                      <TabsTrigger value="linkedin" className="gap-2">
                        <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                      </TabsTrigger>
                      <TabsTrigger value="email" className="gap-2">
                        <Mail className="w-3.5 h-3.5" /> Emails
                      </TabsTrigger>
                    </TabsList>

                    {canManageUser(u.id) && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-2" onClick={() => setActiveUserId(u.id)}>
                            <Plus className="w-4 h-4" /> Add New
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <Tabs defaultValue="add-linkedin">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="add-linkedin">LinkedIn</TabsTrigger>
                              <TabsTrigger value="add-email">Email</TabsTrigger>
                            </TabsList>
                            <TabsContent value="add-linkedin" className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Profile Name</Label>
                                <Input
                                  placeholder="e.g. Mike Persona 1"
                                  value={newProfile.name}
                                  onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>LinkedIn URL</Label>
                                <Input
                                  placeholder="https://linkedin.com/in/..."
                                  value={newProfile.url}
                                  onChange={(e) => setNewProfile({ ...newProfile, url: e.target.value })}
                                />
                              </div>
                              <Button
                                className="w-full"
                                onClick={() => {
                                  if (activeUserId && newProfile.name && newProfile.url) {
                                    createProfileMutation.mutate({
                                      userId: activeUserId,
                                      name: newProfile.name,
                                      url: newProfile.url,
                                    });
                                    setNewProfile({ name: "", url: "" });
                                  }
                                }}
                              >
                                Create LinkedIn Profile
                              </Button>
                            </TabsContent>
                            <TabsContent value="add-email" className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input
                                  placeholder="user@company.com"
                                  value={newEmail.address}
                                  onChange={(e) => setNewEmail({ ...newEmail, address: e.target.value })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Provider</Label>
                                <Select
                                  value={newEmail.provider}
                                  onValueChange={(val) => setNewEmail({ ...newEmail, provider: val })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Google">Google Workspace</SelectItem>
                                    <SelectItem value="Outlook">Office 365</SelectItem>
                                    <SelectItem value="SMTP">Custom SMTP</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                className="w-full"
                                onClick={() => {
                                  if (activeUserId && newEmail.address) {
                                    createEmailMutation.mutate({
                                      userId: activeUserId,
                                      address: newEmail.address,
                                      provider: newEmail.provider,
                                    });
                                    setNewEmail({ address: "", provider: "Google" });
                                  }
                                }}
                              >
                                Add Email Account
                              </Button>
                            </TabsContent>
                          </Tabs>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>

                  {/* LinkedIn Profiles Tab */}
                  <TabsContent value="linkedin" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {userProfiles.map((p) => (
                      <div key={p.id} className="flex flex-col p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors gap-3">
                        <div className="flex items-center justify-between min-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded bg-[#0077b5]/10 text-[#0077b5]">
                              <Linkedin className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{p.url}</p>
                            </div>
                          </div>
                        </div>
                        {/* FIX: Always render Select, hide when not allowed */}
                        <div className={!canManageUser(u.id) ? "hidden" : "pt-2 border-t mt-auto"}>
                          <Select
                            onValueChange={(val) => updateProfileMutation.mutate({ id: p.id, userId: val })}
                            defaultValue={p.userId}
                          >
                            <SelectTrigger className="h-8 text-[10px]">
                              <SelectValue placeholder="Reassign" />
                            </SelectTrigger>
                            <SelectContent>
                              {allUsers
                                .filter((au) => canManageUser(au.id))
                                .map((au) => (
                                  <SelectItem key={au.id} value={au.id}>
                                    {au.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {userProfiles.length === 0 && (
                      <div className="col-span-full py-6 text-center text-xs text-muted-foreground">No LinkedIn profiles</div>
                    )}
                  </TabsContent>

                  {/* Email Accounts Tab */}
                  <TabsContent value="email" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {userEmails.map((e) => (
                      <div key={e.id} className="flex flex-col p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors gap-3">
                        <div className="flex items-center justify-between min-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded bg-primary/10 text-primary">
                              <Mail className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{e.address}</p>
                              <p className="text-[10px] text-muted-foreground">{e.provider}</p>
                            </div>
                          </div>
                        </div>
                        {/* FIX: Always render Select, hide when not allowed */}
                        <div className={!canManageUser(u.id) ? "hidden" : "pt-2 border-t mt-auto"}>
                          <Select
                            onValueChange={(val) => updateEmailMutation.mutate({ id: e.id, userId: val })}
                            defaultValue={e.userId}
                          >
                            <SelectTrigger className="h-8 text-[10px]">
                              <SelectValue placeholder="Reassign" />
                            </SelectTrigger>
                            <SelectContent>
                              {allUsers
                                .filter((au) => canManageUser(au.id))
                                .map((au) => (
                                  <SelectItem key={au.id} value={au.id}>
                                    {au.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {userEmails.length === 0 && (
                      <div className="col-span-full py-6 text-center text-xs text-muted-foreground">No email accounts</div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
