import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { LeadStage, ConnectionStatus, Lead } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Filter, MoreHorizontal, Linkedin, Upload, CheckSquare, Plus } from "lucide-react";
import { format, parseISO, addDays } from "date-fns";
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
import { availableStages, users } from "@/lib/mock-data";

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
  const [newLead, setNewLead] = useState({
    firstName: "",
    lastName: "",
    company: "",
    title: "",
    email: "",
    linkedinUrl: "",
    phone: "",
    ownerId: user?.id || "1",
    stage: "NEW"
  });

  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  useEffect(() => {
    fetchLeads();
  }, [user]);

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

  const canEdit = (lead: any) => {
    if (user?.role === "ADMIN" || user?.role === "TEAM_LEAD") return true;
    return lead.ownerId === user?.id;
  };

  const handleCreateLead = async () => {
    if (!newLead.firstName || !newLead.lastName || !newLead.company) {
      toast({ title: "Error", description: "First Name, Last Name, and Company are required", variant: "destructive" });
      return;
    }
    
    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newLead,
          teamId: user?.teamId || "team-1"
        })
      });
      
      toast({ title: "Lead Added", description: "Successfully created new lead." });
      setIsAddLeadOpen(false);
      setNewLead({
        firstName: "",
        lastName: "",
        company: "",
        title: "",
        email: "",
        linkedinUrl: "",
        phone: "",
        ownerId: user?.id || "1",
        stage: "NEW"
      });
      fetchLeads();
    } catch (error) {
      toast({ title: "Error", description: "Failed to create lead", variant: "destructive" });
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
        <div className="flex gap-2">
          {selectedLeadIds.length > 0 && (
            <div className="flex items-center gap-2 mr-4 bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 animate-in fade-in slide-in-from-right-4">
              <span className="text-sm font-medium text-primary">{selectedLeadIds.length} selected</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">Bulk Action</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Change Status</DropdownMenuLabel>
                  {availableStages.map(stage => (
                    <DropdownMenuItem key={stage} onClick={() => handleBulkStatusChange(stage)}>
                      Move to {stage}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
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
                  <Input 
                    placeholder="+1 (555) 000-0000" 
                    value={newLead.phone} 
                    onChange={(e) => setNewLead(prev => ({ ...prev, phone: e.target.value }))} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input 
                    placeholder="Acme Corp" 
                    value={newLead.company} 
                    onChange={(e) => setNewLead(prev => ({ ...prev, company: e.target.value }))} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input 
                    placeholder="Sales Director" 
                    value={newLead.title} 
                    onChange={(e) => setNewLead(prev => ({ ...prev, title: e.target.value }))} 
                  />
                </div>
              </div>
              <DialogFooter>
                <Button className="w-full" onClick={handleCreateLead}>Create Lead</Button>
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
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filter by Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Stages</SelectItem>
                    {availableStages.map(stage => (
                      <SelectItem key={stage} value={stage}>{stage}</SelectItem>
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
                <TableHead>Title</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead) => {
                const isOwner = lead.ownerId === user?.id;
                const editable = canEdit(lead);
                
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
                    <TableCell>{lead.title || "-"}</TableCell>
                    <TableCell>
                      {isOwner ? (
                        <span className="text-xs font-medium text-primary">You</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {(lead as any).ownerName || users.find(u => u.id === lead.ownerId)?.name || "Unknown"}
                        </span>
                      )}
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
                      }>{lead.stage}</Badge>
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
                              <DropdownMenuItem asChild>
                                <Link href={`/leads/${lead.id}`}>View Profile</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem>Edit Details</DropdownMenuItem>
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
