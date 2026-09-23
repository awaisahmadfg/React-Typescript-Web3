import { useAuth } from "@/hooks/use-auth";
import { userBelongsToTeam } from "@/lib/team-utils";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";
import { Role } from "@/lib/types";
import type { Lead, User } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRoute, Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LeadsByStagePage() {
  const { user } = useAuth();
  const [, params] = useRoute("/analytics/leads/:stage");
  const stage = params?.stage?.toUpperCase();

  const { data: leads = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  if (!user) return null;

  if (isLoadingLeads) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  const stageLeads = leads.filter(l => {
    const isAuthorized = user.role === Role.ADMIN || (user.role === Role.TEAM_LEAD && userBelongsToTeam(user, l.teamId)) || l.ownerId === user.id;
    if (!isAuthorized) return false;
    
    // Map funnel names to stages
    if (stage === "OUTREACH") return true; // Show all for outreach
    if (stage === "CONNECTED") return l.connectionStatus === "ACCEPTED";
    return String(l.stage ?? "").trim().toUpperCase() === stage;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/analytics">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{stage} Leads</h1>
          <p className="text-muted-foreground mt-1">Viewing all prospects currently in {stage} phase</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stageLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No leads found in this stage.
                  </TableCell>
                </TableRow>
              ) : (
                stageLeads.map((lead) => {
                  const owner = users.find(u => u.id === lead.ownerId);
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                            {lead.firstName} {lead.lastName}
                          </Link>
                          <span className="text-xs text-muted-foreground">{lead.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>{lead.company}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={owner?.avatarUrl || owner?.avatar || undefined} />
                            <AvatarFallback>{owner?.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{owner?.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{lead.stage}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
