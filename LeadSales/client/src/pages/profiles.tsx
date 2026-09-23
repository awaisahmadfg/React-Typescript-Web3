import { useAuth } from "@/hooks/use-auth";
import { Role, User, Team } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Linkedin, User2, Users, Mail, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
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

// Validation helpers
const isValidLinkedInUrl = (url: string): boolean => {
  if (!url) return false;
  const pattern = /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_]+(\/)?$/;
  return pattern.test(url);
};

const normalizeLinkedInUrl = (url: string): string => {
  let normalized = url.trim().toLowerCase();
  normalized = normalized.replace(/\/$/, '');
  return normalized;
};

const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  const pattern = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
  return pattern.test(email);
};

const normalizeEmail = (email: string): string => {
  return email.trim().toLowerCase();
};

export default function ProfilesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form states
  const [newLinkedin, setNewLinkedin] = useState({ name: "", url: "" });
  const [newEmail, setNewEmail] = useState({ address: "", provider: "Google" });
  const [activeTabByUser, setActiveTabByUser] = useState<Record<string, string>>({});

  // Dialog control
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedDialogTab, setSelectedDialogTab] = useState<"add-linkedin" | "add-email">("add-linkedin");

  // Edit states
  const [editingProfile, setEditingProfile] = useState<LinkedinProfile | null>(null);
  const [editingEmail, setEditingEmail] = useState<EmailAccount | null>(null);
  const [editLinkedinData, setEditLinkedinData] = useState({ name: "", url: "" });
  const [editEmailData, setEditEmailData] = useState({ address: "", provider: "" });

  // Delete states
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [deletingEmailId, setDeletingEmailId] = useState<string | null>(null);

  // Data fetching
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

  // ========== Derived validation states (no useEffect) ==========
  
  // Add LinkedIn validation
  const linkedinNameError = useMemo(() => 
    newLinkedin.name.trim() === "" ? "Profile name is required" : "",
    [newLinkedin.name]
  );
  
  const linkedinUrlError = useMemo(() => {
    if (newLinkedin.url.trim() === "") return "LinkedIn URL is required";
    if (!isValidLinkedInUrl(newLinkedin.url)) return "Enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/username)";
    return "";
  }, [newLinkedin.url]);
  
  const duplicateUrlError = useMemo(() => {
    if (!isValidLinkedInUrl(newLinkedin.url)) return "";
    const normalizedInput = normalizeLinkedInUrl(newLinkedin.url);
    const exists = profiles.some(p => normalizeLinkedInUrl(p.url) === normalizedInput);
    return exists ? "This LinkedIn URL already exists in the system." : "";
  }, [newLinkedin.url, profiles]);
  
  // Add Email validation
  const emailAddressError = useMemo(() => {
    if (newEmail.address.trim() === "") return "Email address is required";
    if (!isValidEmail(newEmail.address)) return "Enter a valid email address (e.g., name@company.com)";
    return "";
  }, [newEmail.address]);
  
  const duplicateEmailError = useMemo(() => {
    if (!isValidEmail(newEmail.address)) return "";
    const normalizedInput = normalizeEmail(newEmail.address);
    const exists = emails.some(e => normalizeEmail(e.address) === normalizedInput);
    return exists ? "This email address already exists in the system." : "";
  }, [newEmail.address, emails]);
  
  // Edit LinkedIn validation
  const editLinkedinNameError = useMemo(() => 
    editLinkedinData.name.trim() === "" ? "Profile name is required" : "",
    [editLinkedinData.name]
  );
  
  const editLinkedinUrlError = useMemo(() => {
    if (editLinkedinData.url.trim() === "") return "LinkedIn URL is required";
    if (!isValidLinkedInUrl(editLinkedinData.url)) return "Enter a valid LinkedIn profile URL";
    return "";
  }, [editLinkedinData.url]);
  
  const editDuplicateUrlError = useMemo(() => {
    if (!isValidLinkedInUrl(editLinkedinData.url)) return "";
    const currentId = editingProfile?.id;
    const normalizedInput = normalizeLinkedInUrl(editLinkedinData.url);
    const exists = profiles.some(p => 
      p.id !== currentId && normalizeLinkedInUrl(p.url) === normalizedInput
    );
    return exists ? "This LinkedIn URL already exists in the system." : "";
  }, [editLinkedinData.url, profiles, editingProfile?.id]);
  
  // Edit Email validation
  const editEmailAddressError = useMemo(() => {
    if (editEmailData.address.trim() === "") return "Email address is required";
    if (!isValidEmail(editEmailData.address)) return "Enter a valid email address";
    return "";
  }, [editEmailData.address]);
  
  const editDuplicateEmailError = useMemo(() => {
    if (!isValidEmail(editEmailData.address)) return "";
    const currentId = editingEmail?.id;
    const normalizedInput = normalizeEmail(editEmailData.address);
    const exists = emails.some(e => 
      e.id !== currentId && normalizeEmail(e.address) === normalizedInput
    );
    return exists ? "This email address already exists in the system." : "";
  }, [editEmailData.address, emails, editingEmail?.id]);

  // Form validity booleans
  const isAddLinkedinValid = newLinkedin.name.trim() !== "" && isValidLinkedInUrl(newLinkedin.url) && duplicateUrlError === "";
  const isAddEmailValid = isValidEmail(newEmail.address) && duplicateEmailError === "";
  const isEditLinkedinValid = editLinkedinData.name.trim() !== "" && isValidLinkedInUrl(editLinkedinData.url) && editDuplicateUrlError === "";
  const isEditEmailValid = isValidEmail(editEmailData.address) && editDuplicateEmailError === "";

  // ========== Mutations (unchanged) ==========
  const assignLinkedinMutation = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const res = await apiRequest("PATCH", `/api/linkedin-profiles/${id}`, { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-profiles"] });
      toast({ title: "Assigned", description: "LinkedIn profile reassigned successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addLinkedinMutation = useMutation({
    mutationFn: async (data: { userId: string; name: string; url: string }) => {
      const res = await apiRequest("POST", "/api/linkedin-profiles", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-profiles"] });
      toast({ title: "Added", description: "New LinkedIn profile created." });
      setNewLinkedin({ name: "", url: "" });
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add profile", variant: "destructive" });
    },
  });

  const updateLinkedinMutation = useMutation({
    mutationFn: async ({ id, name, url }: { id: string; name: string; url: string }) => {
      const res = await apiRequest("PATCH", `/api/linkedin-profiles/${id}`, { name, url });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-profiles"] });
      toast({ title: "Updated", description: "LinkedIn profile updated." });
      setEditingProfile(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteLinkedinMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/linkedin-profiles/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/linkedin-profiles"] });
      toast({ title: "Deleted", description: "LinkedIn profile removed." });
      setDeletingProfileId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const assignEmailMutation = useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const res = await apiRequest("PATCH", `/api/email-accounts/${id}`, { userId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-accounts"] });
      toast({ title: "Assigned", description: "Email account reassigned." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addEmailMutation = useMutation({
    mutationFn: async (data: { userId: string; address: string; provider: string }) => {
      const res = await apiRequest("POST", "/api/email-accounts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-accounts"] });
      toast({ title: "Added", description: "New email account added." });
      setNewEmail({ address: "", provider: "Google" });
      setIsAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add email account", variant: "destructive" });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, address, provider }: { id: string; address: string; provider: string }) => {
      const res = await apiRequest("PATCH", `/api/email-accounts/${id}`, { address, provider });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-accounts"] });
      toast({ title: "Updated", description: "Email account updated." });
      setEditingEmail(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/email-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-accounts"] });
      toast({ title: "Deleted", description: "Email account removed." });
      setDeletingEmailId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ========== Helper Functions ==========
  const getTeamNames = (u: User): string => {
    const teamIds = u.teamIds?.length ? u.teamIds : u.teamId ? [u.teamId] : [];
    return teamIds.map((tid) => teams.find((t) => t.id === tid)?.name).filter(Boolean).join(", ");
  };

  // ========== Compute manageable users based on role & team ==========
  let manageableUserIds: Set<string>;
  if (user!.role === Role.ADMIN) {
    manageableUserIds = new Set(allUsers.map(u => u.id));
  } else if (user!.role === Role.TEAM_LEAD) {
    const ledTeamIds = teams.filter(t => t.leadId === user!.id).map(t => t.id);
    const memberIds = allUsers
      .filter(u => {
        const userTeamIds = u.teamIds?.length ? u.teamIds : (u.teamId ? [u.teamId] : []);
        return userTeamIds.some(tid => ledTeamIds.includes(tid));
      })
      .map(u => u.id);
    manageableUserIds = new Set([user!.id, ...memberIds]);
  } else {
    manageableUserIds = new Set([user!.id]);
  }

  const filteredUsers = allUsers.filter((u) => manageableUserIds.has(u.id));

  const getProfilesForUser = (userId: string) => profiles.filter((p) => p.userId === userId);
  const getEmailsForUser = (userId: string) => emails.filter((e) => e.userId === userId);

  const canManageUser = (targetUserId: string) => {
    if (user!.role === Role.ADMIN) return true;
    return manageableUserIds.has(targetUserId);
  };

  const canAddNew = user?.role === Role.ADMIN || user?.role === Role.TEAM_LEAD;

  if (!user) return null;
  if (profilesLoading || emailsLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

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
          const currentActiveTab = activeTabByUser[u.id] || "linkedin";
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
                        {getTeamNames(u) && (
                          <span className="flex items-center gap-1 text-xs">
                            <Users className="w-3 h-3" />
                            {getTeamNames(u)}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-sm font-bold text-primary">{getProfilesForUser(u.id).length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Profiles</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-primary">{getEmailsForUser(u.id).length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Emails</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <Tabs
                  value={currentActiveTab}
                  onValueChange={(val) => setActiveTabByUser(prev => ({ ...prev, [u.id]: val }))}
                >
                  <div className="flex justify-between items-center mb-4">
                    <TabsList>
                      <TabsTrigger value="linkedin" className="gap-2">
                        <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                      </TabsTrigger>
                      <TabsTrigger value="email" className="gap-2">
                        <Mail className="w-3.5 h-3.5" /> Emails
                      </TabsTrigger>
                    </TabsList>

                    {canAddNew && canManageUser(u.id) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setSelectedDialogTab(currentActiveTab === "linkedin" ? "add-linkedin" : "add-email");
                          setIsAddDialogOpen(true);
                        }}
                      >
                        <Plus className="w-4 h-4" /> Add New
                      </Button>
                    )}
                  </div>

                  {/* LinkedIn Profiles Tab Content */}
                  <TabsContent value="linkedin" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getProfilesForUser(u.id).map((profile) => (
                      <div key={profile.id} className="flex flex-col p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors gap-3">
                        <div className="flex items-center justify-between min-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded bg-[#0077b5]/10 text-[#0077b5]">
                              <Linkedin className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{profile.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{profile.url}</p>
                            </div>
                          </div>
                          {/* Only ADMIN or TEAM_LEAD can edit/delete */}
                          {canAddNew && canManageUser(u.id) && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingProfile(profile);
                                  setEditLinkedinData({ name: profile.name, url: profile.url });
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeletingProfileId(profile.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {/* Reassign dropdown also only for ADMIN/TEAM_LEAD */}
                        <div className={!(canAddNew && canManageUser(u.id)) ? "hidden" : "pt-2 border-t mt-auto"}>
                          <Select
                            onValueChange={(val) => assignLinkedinMutation.mutate({ id: profile.id, userId: val })}
                            defaultValue={profile.userId}
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
                    {getProfilesForUser(u.id).length === 0 && (
                      <div className="col-span-full py-6 text-center text-xs text-muted-foreground">No LinkedIn profiles</div>
                    )}
                  </TabsContent>

                  {/* Email Accounts Tab Content */}
                  <TabsContent value="email" className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getEmailsForUser(u.id).map((account) => (
                      <div key={account.id} className="flex flex-col p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors gap-3">
                        <div className="flex items-center justify-between min-w-0">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2 rounded bg-primary/10 text-primary">
                              <Mail className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{account.address}</p>
                              <p className="text-[10px] text-muted-foreground">{account.provider}</p>
                            </div>
                          </div>
                          {/* Only ADMIN or TEAM_LEAD can edit/delete */}
                          {canAddNew && canManageUser(u.id) && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => {
                                  setEditingEmail(account);
                                  setEditEmailData({ address: account.address, provider: account.provider });
                                }}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeletingEmailId(account.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {/* Reassign dropdown only for ADMIN/TEAM_LEAD */}
                        <div className={!(canAddNew && canManageUser(u.id)) ? "hidden" : "pt-2 border-t mt-auto"}>
                          <Select
                            onValueChange={(val) => assignEmailMutation.mutate({ id: account.id, userId: val })}
                            defaultValue={account.userId}
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
                    {getEmailsForUser(u.id).length === 0 && (
                      <div className="col-span-full py-6 text-center text-xs text-muted-foreground">No email accounts</div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add New Dialog - Single controlled instance */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <Tabs
            value={selectedDialogTab}
            onValueChange={(val) => setSelectedDialogTab(val as "add-linkedin" | "add-email")}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add-linkedin">LinkedIn</TabsTrigger>
              <TabsTrigger value="add-email">Email</TabsTrigger>
            </TabsList>

            <TabsContent value="add-linkedin" className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Profile Name</Label>
                <Input
                  placeholder="e.g. Mike Persona 1"
                  value={newLinkedin.name}
                  onChange={(e) => setNewLinkedin({ ...newLinkedin, name: e.target.value })}
                />
                {linkedinNameError && <p className="text-xs text-destructive">{linkedinNameError}</p>}
              </div>
              <div className="space-y-2">
                <Label>LinkedIn URL</Label>
                <Input
                  placeholder="https://linkedin.com/in/username"
                  value={newLinkedin.url}
                  onChange={(e) => setNewLinkedin({ ...newLinkedin, url: e.target.value })}
                />
                {linkedinUrlError && <p className="text-xs text-destructive">{linkedinUrlError}</p>}
                {duplicateUrlError && <p className="text-xs text-destructive">{duplicateUrlError}</p>}
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (selectedUserId && isAddLinkedinValid) {
                    addLinkedinMutation.mutate({
                      userId: selectedUserId,
                      name: newLinkedin.name,
                      url: newLinkedin.url,
                    });
                  }
                }}
                disabled={addLinkedinMutation.isPending || !isAddLinkedinValid}
              >
                {addLinkedinMutation.isPending ? "Creating..." : "Create LinkedIn Profile"}
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
                {emailAddressError && <p className="text-xs text-destructive">{emailAddressError}</p>}
                {duplicateEmailError && <p className="text-xs text-destructive">{duplicateEmailError}</p>}
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
                  if (selectedUserId && isAddEmailValid) {
                    addEmailMutation.mutate({
                      userId: selectedUserId,
                      address: newEmail.address,
                      provider: newEmail.provider,
                    });
                  }
                }}
                disabled={addEmailMutation.isPending || !isAddEmailValid}
              >
                {addEmailMutation.isPending ? "Adding..." : "Add Email Account"}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit LinkedIn Profile Dialog */}
      <Dialog open={!!editingProfile} onOpenChange={() => setEditingProfile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit LinkedIn Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Profile Name</Label>
              <Input
                value={editLinkedinData.name}
                onChange={(e) => setEditLinkedinData({ ...editLinkedinData, name: e.target.value })}
              />
              {editLinkedinNameError && <p className="text-xs text-destructive">{editLinkedinNameError}</p>}
            </div>
            <div className="space-y-2">
              <Label>LinkedIn URL</Label>
              <Input
                value={editLinkedinData.url}
                onChange={(e) => setEditLinkedinData({ ...editLinkedinData, url: e.target.value })}
              />
              {editLinkedinUrlError && <p className="text-xs text-destructive">{editLinkedinUrlError}</p>}
              {editDuplicateUrlError && <p className="text-xs text-destructive">{editDuplicateUrlError}</p>}
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (editingProfile && isEditLinkedinValid) {
                  updateLinkedinMutation.mutate({
                    id: editingProfile.id,
                    name: editLinkedinData.name,
                    url: editLinkedinData.url,
                  });
                }
              }}
              disabled={updateLinkedinMutation.isPending || !isEditLinkedinValid}
            >
              {updateLinkedinMutation.isPending ? "Updating..." : "Update Profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Email Account Dialog */}
      <Dialog open={!!editingEmail} onOpenChange={() => setEditingEmail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Email Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                value={editEmailData.address}
                onChange={(e) => setEditEmailData({ ...editEmailData, address: e.target.value })}
              />
              {editEmailAddressError && <p className="text-xs text-destructive">{editEmailAddressError}</p>}
              {editDuplicateEmailError && <p className="text-xs text-destructive">{editDuplicateEmailError}</p>}
            </div>
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={editEmailData.provider}
                onValueChange={(val) => setEditEmailData({ ...editEmailData, provider: val })}
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
                if (editingEmail && isEditEmailValid) {
                  updateEmailMutation.mutate({
                    id: editingEmail.id,
                    address: editEmailData.address,
                    provider: editEmailData.provider,
                  });
                }
              }}
              disabled={updateEmailMutation.isPending || !isEditEmailValid}
            >
              {updateEmailMutation.isPending ? "Updating..." : "Update Email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialogs */}
      <Dialog open={!!deletingProfileId} onOpenChange={() => setDeletingProfileId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this LinkedIn profile? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeletingProfileId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingProfileId && deleteLinkedinMutation.mutate(deletingProfileId)}
              disabled={deleteLinkedinMutation.isPending}
            >
              {deleteLinkedinMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingEmailId} onOpenChange={() => setDeletingEmailId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this email account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeletingEmailId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletingEmailId && deleteEmailMutation.mutate(deletingEmailId)}
              disabled={deleteEmailMutation.isPending}
            >
              {deleteEmailMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}