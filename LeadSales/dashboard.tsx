import { Link } from "wouter";
import { useState } from "react";
import { ReminderDialog } from "@/components/leads/ReminderDialog";
import { useAuth } from "@/hooks/use-auth";
import { CheckSquare } from "lucide-react";
import { Role, Metric, ActivityDaily, Lead, Team, Goal, User } from "@/lib/types";
import { StatCard } from "@/components/ui/stat-card";
import { GoalCard } from "@/components/ui/goal-card";
import { ActivityChart } from "@/components/charts/activity-chart";
import { TeamBreakdown } from "@/components/dashboard/TeamBreakdown";
import { Mail, UserPlus, CheckCircle2, TrendingUp, Filter, Download, Phone, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

export default function DashboardPage() {
  const { user } = useAuth();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("ALL");

  const [selectedLead, setSelectedLead] = useState<{id: string, name: string} | null>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);

  const { data: activitiesList = [] } = useQuery<ActivityDaily[]>({
    queryKey: ["/api/activities"],
  });

  const { data: leadsList = [] } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
  });

  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: goalsList = [] } = useQuery<Goal[]>({
    queryKey: ["/api/goals"],
  });

  if (!user) return null;

  // 1. Determine Scope
  const scopeTeamId = user.role === Role.ADMIN 
    ? (selectedTeamId === "ALL" ? null : selectedTeamId)
    : (user.teamId || "team-1");

  // 2. Filter Activities
  const filteredActivities = activitiesList.filter(a => {
    // Admin sees all or selected team
    if (user.role === Role.ADMIN) {
      if (selectedTeamId !== "ALL") return a.teamId === selectedTeamId;
      return true;
    }
    
    // Lead sees only their team
    if (user.role === Role.TEAM_LEAD) {
      return a.teamId === user.teamId;
    }

    // AE/SDR sees only their own
    return a.userId === user.id;
  });

  // 3. Calculate Totals
  const totalEmails = filteredActivities.reduce((acc, curr) => acc + (curr.emailsSent || 0), 0);
  const totalConnections = filteredActivities.reduce((acc, curr) => acc + (curr.linkedinConnectionsSent || 0), 0);
  const totalInMails = filteredActivities.reduce((acc, curr) => acc + (curr.inMailsSent || 0), 0);
  const totalColdCalls = filteredActivities.reduce((acc, curr) => acc + (curr.coldCalls || 0), 0);
  const totalAccepts = filteredActivities.reduce((acc, curr) => acc + (curr.connectionAccepts || 0), 0);
  const acceptRate = totalConnections > 0 ? Math.round((totalAccepts / totalConnections) * 100) : 0;

  // 4. Find Relevant Goals
  const activeGoals = goalsList.filter(g => {
    if (scopeTeamId) return g.teamId === scopeTeamId;
    return true; 
  });

  // Helper to get goal target for a metric
  const getGoalTarget = (metric: Metric) => {
    if (activeGoals.length === 0) return 0;
    // Sum targets if multiple teams (Admin ALL view), otherwise exact match
    return activeGoals
      .filter(g => g.metric === metric)
      .reduce((acc, curr) => acc + curr.target, 0);
  };

  const emailGoal = getGoalTarget(Metric.EMAILS_SENT);
  const connectionGoal = getGoalTarget(Metric.LINKEDIN_CONNECTIONS);
  const coldCallGoal = getGoalTarget(Metric.COLD_CALLS);


  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {selectedLead && (
        <ReminderDialog
          open={isReminderOpen}
          onOpenChange={setIsReminderOpen}
          leadId={selectedLead.id}
          leadName={selectedLead.name}
          onSuccess={() => {
            setSelectedLead(null);
          }}
        />
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {user.role === Role.ADMIN && "Organization Overview"}
            {user.role === Role.TEAM_LEAD && `Team Performance: ${teamsList.find(t => t.id === user.teamId)?.name || 'My Team'}`}
            {(user.role === Role.AE || user.role === Role.SDR) && `Welcome back, ${user.name}`}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {user.role === Role.ADMIN && (
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-[180px] bg-background">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Select Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Teams</SelectItem>
                {teamsList.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* GOAL TRACKING ROW (If targets exist) */}
      {(emailGoal > 0 || connectionGoal > 0) && (
        <div className="grid gap-4 md:grid-cols-3">
           {emailGoal > 0 && <GoalCard title="Email Goal" current={totalEmails} target={emailGoal} icon={Mail} />}
           {connectionGoal > 0 && <GoalCard title="Connection Goal" current={totalConnections} target={connectionGoal} icon={UserPlus} />}
           {coldCallGoal > 0 && <GoalCard title="Cold Call Goal" current={totalColdCalls} target={coldCallGoal} icon={Phone} />}
        </div>
      )}

      {/* KPI Cards - Expanded Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Emails" 
          value={totalEmails.toLocaleString()} 
          icon={Mail}
          className="bg-card shadow-sm border-l-4 border-l-primary"
        />
        <StatCard 
          title="Connections" 
          value={totalConnections.toLocaleString()} 
          icon={UserPlus}
          className="bg-card shadow-sm border-l-4 border-l-blue-400"
        />
        <StatCard 
          title="InMails Sent" 
          value={totalInMails.toLocaleString()} 
          icon={MessageSquare}
          className="bg-card shadow-sm border-l-4 border-l-indigo-500"
        />
        <StatCard 
          title="Cold Calls" 
          value={totalColdCalls.toLocaleString()} 
          icon={Phone}
          className="bg-card shadow-sm border-l-4 border-l-orange-500"
        />
      </div>

      {/* Charts & Content */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <ActivityChart 
          data={filteredActivities} 
          title={selectedTeamId === "ALL" ? "Global Outreach Activity" : "Team Activity"}
          description="Daily activity across all channels"
        />
        
        <Card className="col-span-3 flex flex-col">
          <CardHeader>
            <CardTitle>Latest Pipeline</CardTitle>
            <CardDescription>
              {user.role === Role.ADMIN
                ? "Latest SQL and MQL leads across the pipeline"
                : "Latest leads you added to the pipeline"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-4">
              {leadsList.filter((l) => {
                const stage = String(l.stage || "").toUpperCase();
                if (user.role === Role.ADMIN) {
                  return stage === "SQL" || stage === "MQL";
                }
                return l.ownerId === user.id;
              }).slice(0, 5).map((lead) => (
                <div key={lead.id} 
                  className="flex items-center justify-between border-b border-border/50 pb-4 last:border-0 last:pb-0 hover:bg-muted/30 p-2 -mx-2 rounded transition-colors"
                >
                  <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 flex-1">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-xs ring-1 ring-primary/20">
                      {lead.firstName[0]}{lead.lastName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium hover:underline">{lead.firstName} {lead.lastName}</p>
                      <p className="text-xs text-muted-foreground">{lead.company}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                      lead.stage === "MQL" ? "bg-purple-100 text-purple-800 border-purple-200" :
                      lead.stage === "SQL" ? "bg-orange-100 text-orange-800 border-orange-200" :
                      "bg-secondary text-secondary-foreground"
                    )}>
                      {lead.stage}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedLead({ id: lead.id, name: `${lead.firstName} ${lead.lastName}` });
                        setIsReminderOpen(true);
                      }}
                    >
                      <CheckSquare className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin Specific View: Team Breakdown */}
      {user.role === Role.ADMIN && selectedTeamId === "ALL" && (
        <TeamBreakdown teams={teamsList} activities={activitiesList} users={usersList} />
      )}
    </div>
  );
}
