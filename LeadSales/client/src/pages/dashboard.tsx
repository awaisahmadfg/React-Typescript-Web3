import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { ReminderDialog } from "@/components/leads/ReminderDialog";
import { useAuth } from "@/hooks/use-auth";
import { Role, Metric, ActivityDaily, Lead, Team, Goal, User } from "@/lib/types";
import { StatCard } from "@/components/ui/stat-card";
import { GoalCard } from "@/components/ui/goal-card";
import { ActivityChart } from "@/components/charts/activity-chart";
import {
  OutreachDayDetailDialog,
  type DayActivityEvent,
  type DayTaskEvent,
} from "@/components/analytics/outreach-day-detail-dialog";
import { TeamBreakdown } from "@/components/dashboard/TeamBreakdown";
import { Mail, UserPlus, Filter, Download, Phone, MessageSquare, Linkedin, User2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";

export default function DashboardPage() {
  const { user } = useAuth();
  const [selectedTeamId, setSelectedTeamId] = useState<string>("ALL");
  const [tlViewMode, setTlViewMode] = useState<"team" | "mine">("mine");
  const [dayBuckets, setDayBuckets] = useState<{
    activities: Record<string, DayActivityEvent[]>;
    leadIds: Record<string, string[]>;
  }>({ activities: {}, leadIds: {} });
  const [dialogState, setDialogState] = useState<{ open: boolean; isoDate: string | null }>({
    open: false,
    isoDate: null,
  });

  const [selectedLead, setSelectedLead] = useState<{id: string, name: string} | null>(null);
  const [isReminderOpen, setIsReminderOpen] = useState(false);

  const { data: activitiesList = [], isLoading: isLoadingActivities } = useQuery<ActivityDaily[]>({
    queryKey: ["/api/activities"],
    refetchOnMount: "always",
  });

  const { data: leadsList = [] } = useQuery<Lead[]>({
    queryKey: ["/api/leads"],
    refetchOnMount: "always",
  });

  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    refetchOnMount: "always",
  });

  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    refetchOnMount: "always",
  });

  const { data: goalsList = [] } = useQuery<Goal[]>({
    queryKey: ["/api/goals"],
    refetchOnMount: "always",
  });
  const { data: tasksList = [] } = useQuery<DayTaskEvent[]>({
    queryKey: ["/api/tasks", "dashboard", user?.id, user?.role, selectedTeamId, tlViewMode],
    enabled: !!user,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await fetch("/api/tasks", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const json = await res.json();
      return Array.isArray(json) ? (json as DayTaskEvent[]) : [];
    },
  });

  // Teams headed by this user (team.leadId === user.id), not just membership.
  const headedTeamIds = useMemo(
    () => new Set(teamsList.filter((t) => !!user && t.leadId === user.id).map((t) => t.id)),
    [teamsList, user],
  );

  // 2. Filter Activities
  const filteredActivities = useMemo(
    () =>
      activitiesList.filter((a) => {
        if (!user) return false;
        // Admin sees all or selected team
        if (user.role === Role.ADMIN) {
          if (selectedTeamId !== "ALL") return a.teamId === selectedTeamId;
          return true;
        }

        // TL: "Mine" = own activities only; "Team" = all headed-team activities
        if (user.role === Role.TEAM_LEAD) {
          if (tlViewMode === "mine") return a.userId === user.id;
          return a.teamId != null && headedTeamIds.has(a.teamId);
        }

        // AE/SDR sees only their own
        return a.userId === user.id;
      }),
    [activitiesList, user, selectedTeamId, tlViewMode, headedTeamIds],
  );

  const visibleLeads = useMemo(() => {
    if (!user) return [];
    return leadsList.filter((lead) => {
      if (user.role === Role.ADMIN) {
        if (selectedTeamId !== "ALL") return lead.teamId === selectedTeamId;
        return true;
      }
      if (user.role === Role.TEAM_LEAD) {
        if (tlViewMode === "mine") return lead.ownerId === user.id;
        return lead.teamId != null && headedTeamIds.has(lead.teamId);
      }
      return lead.ownerId === user.id;
    });
  }, [leadsList, user, selectedTeamId, tlViewMode, headedTeamIds]);

  const visibleLeadIdsList = useMemo(
    () => visibleLeads.map((lead) => lead.id).sort(),
    [visibleLeads],
  );
  const visibleLeadIdsKey = useMemo(
    () => visibleLeadIdsList.join(","),
    [visibleLeadIdsList],
  );

  useEffect(() => {
    let isCancelled = false;
    const leadIds = visibleLeadIdsKey ? visibleLeadIdsKey.split(",") : [];

    const buildDayBuckets = async () => {
      try {
        if (leadIds.length === 0) {
          if (!isCancelled) {
            setDayBuckets((prev) =>
              Object.keys(prev.activities).length === 0 && Object.keys(prev.leadIds).length === 0
                ? prev
                : { activities: {}, leadIds: {} },
            );
          }
          return;
        }

        const batchRes = await fetch("/api/activity-timeline/batch", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds }),
        });
        if (!batchRes.ok) {
          if (!isCancelled) {
            setDayBuckets((prev) =>
              Object.keys(prev.activities).length === 0 && Object.keys(prev.leadIds).length === 0
                ? prev
                : { activities: {}, leadIds: {} },
            );
          }
          return;
        }
        const json = await batchRes.json();
        const allEvents = Array.isArray(json) ? (json as Array<Record<string, unknown>>) : [];

        const activitiesByDate: Record<string, DayActivityEvent[]> = {};
        const leadIdsByDate: Record<string, string[]> = {};
        const leadIdSetByDate: Record<string, Set<string>> = {};
        const toIsoDateKey = (date: Date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, "0");
          const d = String(date.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        };

        for (const rawEvent of allEvents) {
          const eventType = String(rawEvent.type ?? "");
          const happenedAtStr = String(rawEvent.happenedAt ?? "");
          const happenedAt = new Date(happenedAtStr);
          if (Number.isNaN(happenedAt.getTime())) continue;
          const evtLeadId = String(rawEvent.leadId ?? "");
          const dateKey = toIsoDateKey(happenedAt);
          const evt: DayActivityEvent = {
            id: String(rawEvent.id ?? `${evtLeadId}-${happenedAtStr}-${eventType}`),
            leadId: evtLeadId,
            type: eventType,
            channel: (rawEvent as { channel?: string }).channel,
            subject: (rawEvent as { subject?: string | null }).subject ?? null,
            body: (rawEvent as { body?: string | null }).body ?? null,
            notes: (rawEvent as { notes?: string | null }).notes ?? null,
            happenedAt: happenedAtStr,
          };
          if (!activitiesByDate[dateKey]) activitiesByDate[dateKey] = [];
          activitiesByDate[dateKey].push(evt);

          const isOutreachTouchType =
            eventType === "email" ||
            eventType === "linkedin_message" ||
            eventType === "call" ||
            eventType === "meeting";
          if (isOutreachTouchType && evtLeadId) {
            if (!leadIdSetByDate[dateKey]) leadIdSetByDate[dateKey] = new Set();
            if (!leadIdSetByDate[dateKey].has(evtLeadId)) {
              leadIdSetByDate[dateKey].add(evtLeadId);
              if (!leadIdsByDate[dateKey]) leadIdsByDate[dateKey] = [];
              leadIdsByDate[dateKey].push(evtLeadId);
            }
          }
        }

        if (!isCancelled) {
          setDayBuckets((prev) => {
            const prevKeys = Object.keys(prev.activities).length + Object.keys(prev.leadIds).length;
            const nextKeys = Object.keys(activitiesByDate).length + Object.keys(leadIdsByDate).length;
            if (prevKeys === 0 && nextKeys === 0) return prev;
            return { activities: activitiesByDate, leadIds: leadIdsByDate };
          });
        }
      } catch {
        if (!isCancelled) {
          setDayBuckets((prev) =>
            Object.keys(prev.activities).length === 0 && Object.keys(prev.leadIds).length === 0
              ? prev
              : { activities: {}, leadIds: {} },
          );
        }
      }
    };

    buildDayBuckets();
    return () => {
      isCancelled = true;
    };
  }, [visibleLeadIdsKey]);

  // 3. Calculate Totals
  const totalEmails = filteredActivities.reduce((acc, curr) => acc + (curr.emailsSent || 0), 0);
  const totalConnections = filteredActivities.reduce((acc, curr) => acc + (curr.linkedinConnectionsSent || 0), 0);
  const totalInMails = filteredActivities.reduce((acc, curr) => acc + (curr.inMailsSent || 0), 0);
  const totalDirectMessages = filteredActivities.reduce((acc, curr) => acc + (curr.personalizedEmailsSent || 0), 0);
  const totalColdCalls = filteredActivities.reduce((acc, curr) => acc + (curr.coldCalls || 0), 0);
  const visibleLeadIdSet = useMemo(() => new Set(visibleLeads.map((l) => l.id)), [visibleLeads]);
  const filteredTasks = useMemo(
    () => tasksList.filter((task) => !!task.leadId && visibleLeadIdSet.has(task.leadId)),
    [tasksList, visibleLeadIdSet],
  );
  const toIsoDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  const tasksCompletedByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const task of filteredTasks) {
      if ((task.status ?? "OPEN").toUpperCase() !== "COMPLETED") continue;
      const ts = task.updatedAt ? new Date(task.updatedAt) : null;
      if (!ts || Number.isNaN(ts.getTime())) continue;
      const key = toIsoDateKey(ts);
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [filteredTasks]);
  const tasksByDate = useMemo(() => {
    const map: Record<string, DayTaskEvent[]> = {};
    for (const task of filteredTasks) {
      if ((task.status ?? "OPEN").toUpperCase() !== "COMPLETED") continue;
      const ts = task.updatedAt ? new Date(task.updatedAt) : null;
      if (!ts || Number.isNaN(ts.getTime())) continue;
      const key = toIsoDateKey(ts);
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    return map;
  }, [filteredTasks]);
  const leadsTouchedCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [key, ids] of Object.entries(dayBuckets.leadIds)) map[key] = ids.length;
    return map;
  }, [dayBuckets.leadIds]);
  const leadsById = useMemo(() => {
    const m = new Map<string, Lead>();
    for (const lead of leadsList) m.set(lead.id, lead);
    return m;
  }, [leadsList]);
  const handleDayClick = (isoDate: string) => setDialogState({ open: true, isoDate });
  const dialogIsoDate = dialogState.isoDate;
  const dialogActivities = dialogIsoDate ? dayBuckets.activities[dialogIsoDate] ?? [] : [];
  const dialogTasks = dialogIsoDate ? tasksByDate[dialogIsoDate] ?? [] : [];
  const dialogLeadIds = dialogIsoDate ? dayBuckets.leadIds[dialogIsoDate] ?? [] : [];

  if (!user) return null;
  if (isLoadingActivities) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  // 1. Determine Scope
  const scopeTeamId = user.role === Role.ADMIN
    ? (selectedTeamId === "ALL" ? null : selectedTeamId)
    : (user.teamIds?.[0] || user.teamId || "");

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
            {user.role === Role.TEAM_LEAD && (
              tlViewMode === "mine"
                ? `My Personal Stats — ${user.name}`
                : headedTeamIds.size > 1
                  ? "Team Performance: All My Teams"
                  : `Team Performance: ${teamsList.find(t => headedTeamIds.has(t.id))?.name || 'My Team'}`
            )}
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
          {user.role === Role.TEAM_LEAD && (
            <div className="inline-flex items-center gap-1 rounded-full border bg-muted/40 p-1">
              <button
                onClick={() => setTlViewMode("mine")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  tlViewMode === "mine"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <User2 className="w-3.5 h-3.5" />
                My Stats
              </button>
              <button
                onClick={() => setTlViewMode("team")}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  tlViewMode === "team"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Team Stats
              </button>
            </div>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard 
          title="Total Emails" 
          value={totalEmails.toLocaleString()} 
          icon={Mail}
          className="bg-card shadow-sm border-l-4 border-l-primary"
        />
        <StatCard 
          title="Connection Requests" 
          value={totalConnections.toLocaleString()} 
          icon={UserPlus}
          className="bg-card shadow-sm border-l-4 border-l-blue-400"
        />
        <StatCard 
          title="Direct Messages" 
          value={totalDirectMessages.toLocaleString()} 
          icon={Linkedin}
          className="bg-card shadow-sm border-l-4 border-l-cyan-500"
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
          title={
            user.role === Role.TEAM_LEAD && tlViewMode === "mine"
              ? "My Outreach Activity"
              : selectedTeamId === "ALL" ? "Global Outreach Activity" : "Team Activity"
          }
          description="Daily activity across all channels — click any point for the day's details"
          tasksCompletedByDate={tasksCompletedByDate}
          leadsTouchedByDate={leadsTouchedCountByDate}
          onDayClick={handleDayClick}
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

      <OutreachDayDetailDialog
        open={dialogState.open}
        onOpenChange={(open) => setDialogState((prev) => ({ open, isoDate: open ? prev.isoDate : null }))}
        isoDate={dialogIsoDate}
        activities={dialogActivities}
        tasks={dialogTasks}
        leadIds={dialogLeadIds}
        leadsById={leadsById}
      />
    </div>
  );
}
