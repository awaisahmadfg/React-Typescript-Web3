import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Mail, Linkedin, MoreHorizontal, User2, Users } from "lucide-react";
import { Lead, Role, Team, User } from "@/lib/types";
import { userBelongsToTeam } from "@/lib/team-utils";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";

export default function PipelinePage() {
  const { user } = useAuth();
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");

  if (!user) return null;

  const { data: leads = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const filteredLeads = leads.filter(l => {
    // 1. RBAC Team Scoping
    if (user.role === Role.ADMIN) {
      // Admin sees all
    } else if (user.role === Role.TEAM_LEAD) {
      if (!userBelongsToTeam(user, l.teamId)) return false;
    } else {
      // AE/SDR sees only their own
      if (l.ownerId !== user.id) return false;
    }

    // 2. UI Filters
    if (teamFilter !== "ALL" && l.teamId !== teamFilter) return false;
    if (ownerFilter !== "ALL" && l.ownerId !== ownerFilter) return false;

    return true;
  });

  const mqlLeads = filteredLeads.filter(l => l.stage === "MQL");
  const sqlLeads = filteredLeads.filter(l => l.stage === "SQL");

  const availableOwners = Array.from(new Set(leads.map(l => l.ownerId)))
    .map(id => users.find(u => u.id === id))
    .filter((u): u is User => Boolean(u));

  if (isLoadingLeads) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MQL / SQL Pipeline</h1>
          <p className="text-muted-foreground mt-1">Manage high-intent prospects and conversions</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {user.role === Role.ADMIN && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[160px] bg-background">
                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Teams</SelectItem>
                {teams.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(user.role === Role.ADMIN || user.role === Role.TEAM_LEAD) && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[160px] bg-background">
                <User2 className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Owners</SelectItem>
                {availableOwners.map(o => (
                  <SelectItem key={o!.id} value={o!.id}>{o!.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* MQL Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">MQL</Badge>
              Marketing Qualified
            </h2>
            <span className="text-sm text-muted-foreground font-medium">{mqlLeads.length} leads</span>
          </div>
          <div className="space-y-3">
            {mqlLeads.map(lead => (
              <PipelineCard key={lead.id} lead={lead} />
            ))}
          </div>
        </div>

        {/* SQL Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">SQL</Badge>
              Sales Qualified
            </h2>
            <span className="text-sm text-muted-foreground font-medium">{sqlLeads.length} leads</span>
          </div>
          <div className="space-y-3">
            {sqlLeads.map(lead => (
              <PipelineCard key={lead.id} lead={lead} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PipelineCard({ lead }: any) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <Link href={`/leads/${lead.id}`} className="font-semibold hover:underline block cursor-pointer">
              {lead.firstName} {lead.lastName}
            </Link>
            <p className="text-sm text-muted-foreground">{lead.company}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/leads/${lead.id}`}>View Details</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>Log Activity</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <Mail className="w-3.5 h-3.5" />
            {lead.email}
          </div>
          <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="text-[#0077b5] hover:opacity-80">
            <Linkedin className="w-3.5 h-3.5" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
