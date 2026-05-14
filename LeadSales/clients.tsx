import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { userBelongsToTeam } from "@/lib/team-utils";
import { Role, type Client, type User, type Team } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Search, FileText, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Link } from "wouter";

export default function ClientsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: clients = [], isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });


  const createClientMutation = useMutation({
    mutationFn: async (payload: Omit<Client, "id" | "createdAt">) => {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to create client");
      }
      return (await res.json()) as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (payload: { id: string; updates: Partial<Client> }) => {
      const res = await fetch(`/api/clients/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.updates),
      });
      if (!res.ok) {
        throw new Error("Failed to update client");
      }
      return (await res.json()) as Client;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/clients/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete client");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },
  });


  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      // Role-based access
      const hasAccess =
        user?.role === Role.ADMIN ||
        (user?.role === Role.TEAM_LEAD && userBelongsToTeam(user, client.teamId)) ||
        (client.ownerId === user?.id);

      if (!hasAccess) return false;

      // Admin Filters
      if (user?.role === Role.ADMIN) {
        if (teamFilter !== "ALL" && client.teamId !== teamFilter) return false;
        if (ownerFilter !== "ALL" && client.ownerId !== ownerFilter) return false;
      }

      // Search filter
      const searchLower = searchTerm.toLowerCase();
      return (
        client.projectName.toLowerCase().includes(searchLower) ||
        client.company.toLowerCase().includes(searchLower) ||
        client.clientPOC.toLowerCase().includes(searchLower)
      );
    });
  }, [user, searchTerm, teamFilter, ownerFilter, clients]);

  const canEditClient = (client: Client) => {
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;
    if (user.role === Role.TEAM_LEAD) return userBelongsToTeam(user, client.teamId);
    return client.ownerId === user.id;
  };

  const canDeleteClient = () => user?.role === Role.ADMIN;

  const validateClientForm = (c: Client | null): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!c?.projectName?.trim()) errors.projectName = "Project name is required.";
    if (!c?.company?.trim()) errors.company = "Company is required.";
    if (!c?.clientPOC?.trim()) errors.clientPOC = "Client POC is required.";
    if (!c?.ticketSize || c.ticketSize <= 0) errors.ticketSize = "Ticket size must be greater than 0.";
    return errors;
  };

  if (isLoadingClients) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Client Ledger</h1>
          <p className="text-muted-foreground mt-1">Manage won leads and active projects</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Upload CSV
          </Button>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Export Ledger
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setClientErrors({}); }}>
            <DialogTrigger asChild>
              <Button>
                Create Client
              </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Client Ledger Entry</DialogTitle>
                  <DialogDescription>Add a new active client/project to the ledger.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-start gap-2">
                    <Label className="text-right mt-2">Project <span className="text-destructive">*</span></Label>
                    <div className="col-span-3">
                      <Input
                        value={editingClient?.projectName ?? ""}
                        onChange={(e) => {
                          if (clientErrors.projectName) setClientErrors(p => ({...p, projectName: ""}));
                          setEditingClient((prev) =>
                            prev
                              ? { ...prev, projectName: e.target.value }
                              : {
                                  id: "",
                                  projectName: e.target.value,
                                  company: "",
                                  startDate: null,
                                  ticketSize: 0,
                                  paymentTerms: "",
                                  billingFrequency: "MONTHLY",
                                  hourlyRate: 0,
                                  resourceCount: 0,
                                  invoiceNumber: "",
                                  invoiceAmount: 0,
                                  paymentStatus: "UNPAID",
                                  deltaAmount: 0,
                                  googleSheetLink: "",
                                  clientPOC: "",
                                  ownerId: user?.id ?? "",
                                  teamId: user?.teamIds?.[0] || user?.teamId || "",
                                },
                          );
                        }}
                        className={clientErrors.projectName ? "border-destructive" : ""}
                      />
                      {clientErrors.projectName && <p className="text-xs text-destructive mt-1">{clientErrors.projectName}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label className="text-right">Start Date</Label>
                    <Input
                      type="date"
                      className="col-span-3"
                      value={editingClient?.startDate ?? ""}
                      onChange={(e) =>
                        setEditingClient((prev) => prev ? { ...prev, startDate: e.target.value || null } : prev)
                      }
                    />
                  </div>
                  <div className="grid grid-cols-4 items-start gap-2">
                    <Label className="text-right mt-2">Company <span className="text-destructive">*</span></Label>
                    <div className="col-span-3">
                      <Input
                        value={editingClient?.company ?? ""}
                        onChange={(e) => { if (clientErrors.company) setClientErrors(p => ({...p, company: ""})); setEditingClient((prev) => prev ? { ...prev, company: e.target.value } : prev); }}
                        className={clientErrors.company ? "border-destructive" : ""}
                      />
                      {clientErrors.company && <p className="text-xs text-destructive mt-1">{clientErrors.company}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-start gap-2">
                    <Label className="text-right mt-2">Client POC <span className="text-destructive">*</span></Label>
                    <div className="col-span-3">
                      <Input
                        value={editingClient?.clientPOC ?? ""}
                        onChange={(e) => { if (clientErrors.clientPOC) setClientErrors(p => ({...p, clientPOC: ""})); setEditingClient((prev) => prev ? { ...prev, clientPOC: e.target.value } : prev); }}
                        className={clientErrors.clientPOC ? "border-destructive" : ""}
                      />
                      {clientErrors.clientPOC && <p className="text-xs text-destructive mt-1">{clientErrors.clientPOC}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-start gap-2">
                    <Label className="text-right mt-2">Ticket Size <span className="text-destructive">*</span></Label>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={0}
                        value={editingClient?.ticketSize ?? 0}
                        onChange={(e) => { if (clientErrors.ticketSize) setClientErrors(p => ({...p, ticketSize: ""})); setEditingClient((prev) => prev ? { ...prev, ticketSize: Number(e.target.value || 0) } : prev); }}
                        className={clientErrors.ticketSize ? "border-destructive" : ""}
                      />
                      {clientErrors.ticketSize && <p className="text-xs text-destructive mt-1">{clientErrors.ticketSize}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label className="text-right">Billing</Label>
                    <Select
                      value={editingClient?.billingFrequency ?? "MONTHLY"}
                      onValueChange={(val) =>
                        setEditingClient((prev) => prev ? { ...prev, billingFrequency: val as Client["billingFrequency"] } : prev)
                      }
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MONTHLY">Monthly</SelectItem>
                        <SelectItem value="FIXED">Fixed</SelectItem>
                        <SelectItem value="BI_WEEKLY">Bi-weekly</SelectItem>
                        <SelectItem value="WEEKLY">Weekly</SelectItem>
                        <SelectItem value="SUPPORT">Support</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label className="text-right">Hourly Rate</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={editingClient?.hourlyRate ?? 0}
                      onChange={(e) =>
                        setEditingClient((prev) =>
                          prev ? { ...prev, hourlyRate: Number(e.target.value || 0) } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label className="text-right">Resources</Label>
                    <Input
                      type="number"
                      className="col-span-3"
                      value={editingClient?.resourceCount ?? 0}
                      onChange={(e) =>
                        setEditingClient((prev) =>
                          prev ? { ...prev, resourceCount: Number(e.target.value || 0) } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label className="text-right">Payment Status</Label>
                    <Select
                      value={editingClient?.paymentStatus ?? "UNPAID"}
                      onValueChange={(val) =>
                        setEditingClient((prev) =>
                          prev ? { ...prev, paymentStatus: val as Client["paymentStatus"] } : prev,
                        )
                      }
                    >
                      <SelectTrigger className="col-span-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PAID">Paid</SelectItem>
                        <SelectItem value="UNPAID">Unpaid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-2">
                    <Label className="text-right">Google Sheet</Label>
                    <Input
                      className="col-span-3"
                      value={editingClient?.googleSheetLink ?? ""}
                      onChange={(e) =>
                        setEditingClient((prev) => prev ? { ...prev, googleSheetLink: e.target.value } : prev)
                      }
                    />
                  </div>
                  {user?.role === Role.ADMIN && (
                    <>
                      <div className="grid grid-cols-4 items-center gap-2">
                        <Label className="text-right">Owner</Label>
                        <Select
                          value={editingClient?.ownerId ?? user?.id}
                          onValueChange={(val) =>
                            setEditingClient((prev) => prev ? { ...prev, ownerId: val } : prev)
                          }
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select owner" />
                          </SelectTrigger>
                          <SelectContent>
                            {users
                              .filter((u) => u.role === Role.AE || u.role === Role.SDR || u.role === Role.TEAM_LEAD)
                              .map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-4 items-center gap-2">
                        <Label className="text-right">Team</Label>
                        <Select
                          value={editingClient?.teamId ?? user?.teamIds?.[0] ?? user?.teamId}
                          onValueChange={(val) =>
                            setEditingClient((prev) => prev ? { ...prev, teamId: val } : prev)
                          }
                        >
                          <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select team" />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {user?.role !== Role.ADMIN && (user?.teamIds?.length ?? 0) > 1 && (
                    <div className="grid grid-cols-4 items-center gap-2">
                      <Label className="text-right">Team</Label>
                      <Select
                        value={editingClient?.teamId ?? user?.teamIds?.[0] ?? user?.teamId}
                        onValueChange={(val) =>
                          setEditingClient((prev) => prev ? { ...prev, teamId: val } : prev)
                        }
                      >
                        <SelectTrigger className="col-span-3">
                          <SelectValue placeholder="Select team" />
                        </SelectTrigger>
                        <SelectContent>
                          {teams
                            .filter((t) => user?.teamIds?.includes(t.id))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Button
                  className="w-full"
                  disabled={createClientMutation.isPending}
                  onClick={() => {
                    const errors = validateClientForm(editingClient);
                    if (Object.keys(errors).length > 0) { setClientErrors(errors); return; }
                    setClientErrors({});
                    if (!editingClient) return;
                    const payload = {
                      projectName: editingClient.projectName,
                      company: editingClient.company,
                      ticketSize: editingClient.ticketSize,
                      paymentTerms: editingClient.paymentTerms || "Net 30",
                      billingFrequency: editingClient.billingFrequency,
                      hourlyRate: editingClient.hourlyRate,
                      resourceCount: editingClient.resourceCount,
                      startDate: editingClient.startDate ?? null,
                      invoiceNumber: null,
                      invoiceAmount: 0,
                      paymentStatus: editingClient.paymentStatus ?? "UNPAID",
                      deltaAmount: editingClient.deltaAmount ?? 0,
                      googleSheetLink: editingClient.googleSheetLink ?? null,
                      clientPOC: editingClient.clientPOC,
                      ownerId: user?.role === Role.ADMIN ? (editingClient.ownerId || (user?.id ?? "")) : (user?.id ?? ""),
                      teamId: editingClient.teamId || user?.teamIds?.[0] || user?.teamId || "",
                    };
                    createClientMutation.mutate(payload, {
                      onSuccess: () => {
                        toast({
                          title: "Client Added",
                          description: "Client has been added to the ledger.",
                        });
                        setIsCreateOpen(false);
                        setEditingClient(null);
                      },
                      onError: () => {
                        toast({
                          title: "Error",
                          description: "Failed to create client.",
                          variant: "destructive",
                        });
                      },
                    });
                  }}
                >
                  {createClientMutation.isPending ? "Saving..." : "Save Client"}
                </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Active Projects</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {user?.role === Role.ADMIN && (
                <>
                  <Select value={teamFilter} onValueChange={setTeamFilter}>
                    <SelectTrigger className="w-[150px] h-9">
                      <SelectValue placeholder="Team" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Teams</SelectItem>
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger className="w-[150px] h-9">
                      <SelectValue placeholder="Owner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Owners</SelectItem>
                      {users.filter(u => u.role === Role.AE || u.role === Role.SDR).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              <div className="relative w-full md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  className="pl-9 h-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project Name</TableHead>
                  <TableHead>Client / POC</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>Ticket Size</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead>Payment / Delta</TableHead>
                  <TableHead className="w-[90px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      <Link href={`/clients/${client.id}`}>
                        <div className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors">
                          <FileText className="w-4 h-4 text-primary" />
                          {client.projectName}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{client.company}</div>
                      <div className="text-xs text-muted-foreground">{client.clientPOC}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {client.startDate || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-semibold">${client.ticketSize.toLocaleString()}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">{client.paymentTerms}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {client.billingFrequency}
                      </Badge>
                      <div className="text-xs mt-1 font-medium">${client.hourlyRate}/hr</div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {client.resourceCount}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.paymentStatus === "PAID" ? "default" : "secondary"} className="text-[10px] mb-1">
                        {client.paymentStatus}
                      </Badge>
                      <div className={client.deltaAmount > 0 ? "text-red-500 font-bold" : "text-green-600 font-medium"}>
                        {client.deltaAmount > 0 ? `-$${client.deltaAmount.toLocaleString()}` : "Up to date"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEditClient(client) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingClient(client)}
                            aria-label="Edit client"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canDeleteClient() && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                aria-label="Delete client"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Client</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{client.projectName}" for {client.company}? This action
                                  cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() =>
                                    deleteClientMutation.mutate(client.id, {
                                      onSuccess: () => {
                                        toast({
                                          title: "Client Deleted",
                                          description: "Client ledger entry has been removed.",
                                        });
                                      },
                                      onError: () => {
                                        toast({
                                          title: "Error",
                                          description: "Failed to delete client.",
                                          variant: "destructive",
                                        });
                                      },
                                    })
                                  }
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredClients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No active clients found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingClient && !isCreateOpen} onOpenChange={(open) => { if (!open) { setEditingClient(null); setClientErrors({}); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update this client ledger entry.</DialogDescription>
          </DialogHeader>
          {editingClient && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Project</Label>
                <Input
                  className="col-span-3"
                  value={editingClient.projectName}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, projectName: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Company</Label>
                <Input
                  className="col-span-3"
                  value={editingClient.company}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, company: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Start Date</Label>
                <Input
                  type="date"
                  className="col-span-3"
                  value={editingClient.startDate ?? ""}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, startDate: e.target.value || null })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Client POC</Label>
                <Input
                  className="col-span-3"
                  value={editingClient.clientPOC}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, clientPOC: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Ticket Size</Label>
                <Input
                  type="number"
                  className="col-span-3"
                  value={editingClient.ticketSize}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      ticketSize: Number(e.target.value || 0),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Payment Terms</Label>
                <Input
                  className="col-span-3"
                  value={editingClient.paymentTerms}
                  onChange={(e) =>
                    setEditingClient({ ...editingClient, paymentTerms: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Billing</Label>
                <Select
                  value={editingClient.billingFrequency}
                  onValueChange={(val) =>
                    setEditingClient({
                      ...editingClient,
                      billingFrequency: val as Client["billingFrequency"],
                    })
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="FIXED">Fixed</SelectItem>
                    <SelectItem value="BI_WEEKLY">Bi-weekly</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="SUPPORT">Support</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Hourly Rate</Label>
                <Input
                  type="number"
                  className="col-span-3"
                  value={editingClient.hourlyRate}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      hourlyRate: Number(e.target.value || 0),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Resources</Label>
                <Input
                  type="number"
                  className="col-span-3"
                  value={editingClient.resourceCount}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      resourceCount: Number(e.target.value || 0),
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Payment Status</Label>
                <Select
                  value={editingClient.paymentStatus ?? "UNPAID"}
                  onValueChange={(val) =>
                    setEditingClient({
                      ...editingClient,
                      paymentStatus: val as Client["paymentStatus"],
                    })
                  }
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="UNPAID">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-2">
                <Label className="text-right">Google Sheet</Label>
                <Input
                  className="col-span-3"
                  value={editingClient.googleSheetLink ?? ""}
                  onChange={(e) =>
                    setEditingClient({
                      ...editingClient,
                      googleSheetLink: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          )}
          <Button
            className="w-full"
            disabled={updateClientMutation.isPending}
            onClick={() => {
              const errors = validateClientForm(editingClient);
              if (Object.keys(errors).length > 0) { setClientErrors(errors); return; }
              setClientErrors({});
              if (!editingClient) return;
              updateClientMutation.mutate(
                {
                  id: editingClient.id,
                  updates: {
                    projectName: editingClient.projectName,
                    company: editingClient.company,
                    ticketSize: editingClient.ticketSize,
                    paymentTerms: editingClient.paymentTerms,
                    billingFrequency: editingClient.billingFrequency,
                    hourlyRate: editingClient.hourlyRate,
                    resourceCount: editingClient.resourceCount,
                    startDate: editingClient.startDate ?? null,
                    paymentStatus: editingClient.paymentStatus ?? "UNPAID",
                    googleSheetLink: editingClient.googleSheetLink ?? null,
                    clientPOC: editingClient.clientPOC,
                  },
                },
                {
                  onSuccess: () => {
                    toast({
                      title: "Client Updated",
                      description: "Client ledger entry has been updated.",
                    });
                    setEditingClient(null);
                  },
                  onError: () => {
                    toast({
                      title: "Error",
                      description: "Failed to update client.",
                      variant: "destructive",
                    });
                  },
                },
              );
            }}
          >
            {updateClientMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
