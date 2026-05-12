import { useAuth } from "@/hooks/use-auth";
import { Role, Lead, ActivityDaily, Team, User, ConnectionStatus } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ActivityChart } from "@/components/charts/activity-chart";
import {
  OutreachDayDetailDialog,
  type DayActivityEvent,
  type DayTaskEvent,
} from "@/components/analytics/outreach-day-detail-dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";
import { Mail, MessageSquare, Phone, Target, Zap, TrendingUp, Users, Calendar, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/ui/spinner";

const getPeriodStart = (period: "daily" | "weekly" | "monthly" | "quarterly") => {
  const now = new Date();
  const start = new Date(now);
  if (period === "daily") start.setDate(now.getDate());
  if (period === "weekly") start.setDate(now.getDate() - 7);
  if (period === "monthly") start.setDate(now.getDate() - 30);
  if (period === "quarterly") start.setDate(now.getDate() - 90);
  start.setHours(0, 0, 0, 0);
  return start;
};

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [timePeriod, setTimePeriod] = useState<"daily" | "weekly" | "monthly" | "quarterly">("monthly");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
  const [tlViewMode, setTlViewMode] = useState<"mine" | "team">("mine");
  const [timelineChannelCounts, setTimelineChannelCounts] = useState({
    emailsSent: 0,
    emailReplies: 0,
    linkedinSent: 0,
    linkedinAccepts: 0,
    coldCalls: 0,
    coldCallMeetings: 0,
  });
  const [dayBuckets, setDayBuckets] = useState<{
    activities: Record<string, DayActivityEvent[]>;
    leadIds: Record<string, string[]>;
  }>({ activities: {}, leadIds: {} });
  const [dialogState, setDialogState] = useState<{ open: boolean; isoDate: string | null }>({
    open: false,
    isoDate: null,
  });

  const { data: leadsList = [], isLoading: isLoadingLeads } = useQuery<Lead[]>({
    queryKey: ["/api/leads", user?.id, user?.role, user?.teamIds?.join(",")],
    enabled: !!user,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/leads", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch leads");
      }
      return res.json();
    },
  });

  const { data: activitiesList = [] } = useQuery<ActivityDaily[]>({
    queryKey: ["/api/activities", user?.id, user?.role, user?.teamIds?.join(",")],
    enabled: !!user,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/activities", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch activities");
      }
      return res.json();
    },
  });

  const { data: teamsList = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    refetchOnMount: "always",
  });

  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    refetchOnMount: "always",
  });

  const { data: tasksList = [] } = useQuery<DayTaskEvent[]>({
    queryKey: ["/api/tasks", "analytics", user?.id, user?.role, user?.teamIds?.join(",")],
    enabled: !!user,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch("/api/tasks", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch tasks");
      }
      const json = await res.json();
      return Array.isArray(json) ? (json as DayTaskEvent[]) : [];
    },
  });

  if (!user) return null;

  // Teams headed by this user (team.leadId === user.id), not just teams they're a member of.
  // TEAM_LEAD visibility is scoped to teams they HEAD, not teams they belong to as a member.
  const headedTeamIds = useMemo(
    () => new Set(teamsList.filter(t => t.leadId === user.id).map(t => t.id)),
    [teamsList, user.id],
  );

  // For TEAM_LEAD: "mine" mode pins the owner filter to themselves; "team" uses the dropdown value.
  const effectiveOwnerFilter =
    user.role === Role.TEAM_LEAD && tlViewMode === "mine" ? user.id : ownerFilter;

  // 1. Data Processing based on Filters
  const periodStart = useMemo(() => getPeriodStart(timePeriod), [timePeriod]);

  useEffect(() => {
    let isCancelled = false;

    const computeTimelineChannelCounts = async () => {
      const effectPeriodStart = getPeriodStart(timePeriod);
      const visibleLeads = leadsList.filter((lead) => {
        const roleScopePass =
          user.role === Role.ADMIN ||
          (user.role === Role.TEAM_LEAD && lead.teamId != null && headedTeamIds.has(lead.teamId)) ||
          lead.ownerId === user.id;
        if (!roleScopePass) return false;
        if (teamFilter !== "ALL" && lead.teamId !== teamFilter) return false;
        if (effectiveOwnerFilter !== "ALL" && lead.ownerId !== effectiveOwnerFilter) return false;
        return true;
      });

      try {
        // One batch request instead of N individual requests — fixes browser freeze.
        let allEvents: Array<Record<string, unknown>> = [];
        if (visibleLeads.length > 0) {
          const batchRes = await fetch("/api/activity-timeline/batch", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadIds: visibleLeads.map((l) => l.id) }),
          });
          if (batchRes.ok) {
            const json = await batchRes.json();
            allEvents = Array.isArray(json) ? json : [];
          }
        }

        const emailLeadIds = new Set<string>();
        const emailReplyLeadIds = new Set<string>();
        const linkedinRequestLeadIds = new Set<string>();
        const linkedinAcceptedLeadIds = new Set<string>();
        const coldCallLeadIds = new Set<string>();
        const coldCallMeetingLeadIds = new Set<string>();
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
          if (Number.isNaN(happenedAt.getTime()) || happenedAt < effectPeriodStart) continue;
          const evtLeadId = String(rawEvent.leadId ?? "");

          if (eventType === "email" && evtLeadId) emailLeadIds.add(evtLeadId);
          if (eventType === "email_replied" && evtLeadId) emailReplyLeadIds.add(evtLeadId);
          if (eventType === "linkedin_message") {
            const channel = (rawEvent as { channel?: string }).channel;
            if (channel === "conn" && evtLeadId) linkedinRequestLeadIds.add(evtLeadId);
          }
          if (eventType === "linkedin_connection_accepted" && evtLeadId) linkedinAcceptedLeadIds.add(evtLeadId);
          if ((eventType === "call" || eventType === "meeting") && evtLeadId) coldCallLeadIds.add(evtLeadId);
          if (eventType === "meeting" && evtLeadId) coldCallMeetingLeadIds.add(evtLeadId);

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

        const emailsSent = emailLeadIds.size;
        const emailReplies = emailReplyLeadIds.size;
        const linkedinSent = linkedinRequestLeadIds.size;
        const linkedinAccepts = linkedinAcceptedLeadIds.size;
        const coldCalls = coldCallLeadIds.size;
        const coldCallMeetings = coldCallMeetingLeadIds.size;

        if (!isCancelled) {
          setTimelineChannelCounts((prev) =>
            prev.emailsSent === emailsSent &&
            prev.emailReplies === emailReplies &&
            prev.linkedinSent === linkedinSent &&
            prev.linkedinAccepts === linkedinAccepts &&
            prev.coldCalls === coldCalls &&
            prev.coldCallMeetings === coldCallMeetings
              ? prev
              : { emailsSent, emailReplies, linkedinSent, linkedinAccepts, coldCalls, coldCallMeetings },
          );
          setDayBuckets({ activities: activitiesByDate, leadIds: leadIdsByDate });
        }
      } catch {
        if (!isCancelled) {
          setTimelineChannelCounts((prev) =>
            prev.emailsSent === 0 && prev.emailReplies === 0 && prev.linkedinSent === 0 &&
            prev.linkedinAccepts === 0 && prev.coldCalls === 0 && prev.coldCallMeetings === 0
              ? prev
              : { emailsSent: 0, emailReplies: 0, linkedinSent: 0, linkedinAccepts: 0, coldCalls: 0, coldCallMeetings: 0 },
          );
          setDayBuckets({ activities: {}, leadIds: {} });
        }
      }
    };

    computeTimelineChannelCounts();
    return () => { isCancelled = true; };
  }, [leadsList, effectiveOwnerFilter, teamFilter, timePeriod, user, headedTeamIds, tlViewMode]);

  const filteredActivities = activitiesList.filter(a => {
    // Role based scoping: TL sees only teams they HEAD (team.leadId === user.id), not just membership
    const isOwner = user.role === Role.ADMIN || (user.role === Role.TEAM_LEAD && a.teamId != null && headedTeamIds.has(a.teamId)) || a.userId === user.id;
    if (!isOwner) return false;

    // UI Filters
    if (teamFilter !== "ALL" && a.teamId !== teamFilter) return false;
    if (effectiveOwnerFilter !== "ALL" && a.userId !== effectiveOwnerFilter) return false;
    const activityDate = new Date(a.activityDate);
    if (Number.isNaN(activityDate.getTime())) return false;
    if (activityDate < periodStart) return false;

    return true;
  });

  // Build owner list from team membership. Exclude the logged-in user since
  // they have a dedicated "My Stats" button for viewing their own data.
  const availableOwners = usersList.filter(u => {
    if (u.id === user.id) return false;
    const userTeams = new Set(u.teamIds ?? (u.teamId ? [u.teamId] : []));
    if (user.role === Role.ADMIN) {
      if (teamFilter !== "ALL") return userTeams.has(teamFilter);
      return true;
    }
    if (user.role === Role.TEAM_LEAD) {
      // Must belong to at least one team this TL heads
      const inHeadedTeam = Array.from(userTeams).some(tid => headedTeamIds.has(tid));
      if (!inHeadedTeam) return false;
      if (teamFilter !== "ALL") return userTeams.has(teamFilter);
      return true;
    }
    return false;
  });

  const totals = {
    emails: timelineChannelCounts.emailsSent,
    linkedin: timelineChannelCounts.linkedinSent,
    calls: timelineChannelCounts.coldCalls,
    accepts: timelineChannelCounts.linkedinAccepts,
    emailReplies: timelineChannelCounts.emailReplies,
    coldCallMeetings: timelineChannelCounts.coldCallMeetings,
  };

  const leadInFunnelScope = (l: Lead) =>
    (user.role === Role.ADMIN ||
      (user.role === Role.TEAM_LEAD && l.teamId != null && headedTeamIds.has(l.teamId)) ||
      l.ownerId === user.id) &&
    (teamFilter === "ALL" || l.teamId === teamFilter) &&
    (effectiveOwnerFilter === "ALL" || l.ownerId === effectiveOwnerFilter);

  const leadStageUpper = (l: Lead) => String(l.stage ?? "").trim().toUpperCase();
  const isInSelectedPeriod = (value?: string | null) => {
    if (!value) return false;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed >= periodStart;
  };
  const filteredLeads = leadsList.filter((l) => {
    if (!leadInFunnelScope(l)) return false;
    return isInSelectedPeriod(l.statusChangedAt || l.updatedAt || l.createdAt);
  });
  const mqlCount = filteredLeads.filter((l) => leadStageUpper(l) === "MQL").length;
  const sqlCount = filteredLeads.filter((l) => leadStageUpper(l) === "SQL").length;
  const activeProspects = filteredLeads.filter((l) => {
    const stage = leadStageUpper(l);
    return stage !== "WON" && stage !== "LOST";
  }).length;
  const pipelineValue = mqlCount + sqlCount;
  const toPercent = (numerator: number, denominator: number) => {
    if (denominator <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
  };
  const emailReplyRate = toPercent(totals.emailReplies, totals.emails);
  const coldCallMeetingSetRate = toPercent(totals.coldCallMeetings, totals.calls);
  const visibleLeadsForStatusEfficiency = leadsList.filter((lead) => {
    const roleScopePass =
      user.role === Role.ADMIN ||
      (user.role === Role.TEAM_LEAD && lead.teamId != null && headedTeamIds.has(lead.teamId)) ||
      lead.ownerId === user.id;
    if (!roleScopePass) return false;
    if (teamFilter !== "ALL" && lead.teamId !== teamFilter) return false;
    if (effectiveOwnerFilter !== "ALL" && lead.ownerId !== effectiveOwnerFilter) return false;
    return true;
  });
  const linkedinScopedLeads = visibleLeadsForStatusEfficiency.filter((lead) =>
    (lead.contactOptions || []).includes("linkedin_connection") ||
    lead.connectionStatus === ConnectionStatus.SENT ||
    lead.connectionStatus === ConnectionStatus.ACCEPTED,
  );
  const linkedinRequestsByStatus = linkedinScopedLeads.filter(
    (lead) =>
      (lead.connectionStatus === ConnectionStatus.SENT || lead.connectionStatus === ConnectionStatus.ACCEPTED) &&
      isInSelectedPeriod(lead.connectionSentAt || lead.connectionAcceptedAt || lead.updatedAt),
  ).length;
  const linkedinAcceptedByStatus = linkedinScopedLeads.filter(
    (lead) =>
      lead.connectionStatus === ConnectionStatus.ACCEPTED &&
      isInSelectedPeriod(lead.connectionAcceptedAt || lead.updatedAt),
  ).length;
  const linkedinAcceptRateByStatus = toPercent(
    linkedinAcceptedByStatus,
    linkedinRequestsByStatus,
  );

  const toIsoDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  // Tasks scoped by current filters (team/owner/period). Group COMPLETED tasks
  // by the date their status changed (updatedAt) for the chart line.
  const filteredTasks = useMemo(() => {
    return tasksList.filter((task) => {
      const lead = task.leadId ? leadsList.find((l) => l.id === task.leadId) : undefined;
      // Scope by lead's team/owner when available; otherwise allow plan-level tasks if assignee matches.
      if (lead) {
        const roleScopePass =
          user.role === Role.ADMIN ||
          (user.role === Role.TEAM_LEAD && lead.teamId != null && headedTeamIds.has(lead.teamId)) ||
          lead.ownerId === user.id;
        if (!roleScopePass) return false;
        if (teamFilter !== "ALL" && lead.teamId !== teamFilter) return false;
        if (effectiveOwnerFilter !== "ALL" && lead.ownerId !== effectiveOwnerFilter) return false;
      } else {
        // Plan-level (no leadId): scope to the assignee filter only.
        if (effectiveOwnerFilter !== "ALL") {
          const matchesPrimary = task.userId === effectiveOwnerFilter;
          const matchesPlanAssignees = (task.assigneeIds ?? []).includes(effectiveOwnerFilter);
          if (!matchesPrimary && !matchesPlanAssignees) return false;
        }
      }
      return true;
    });
  }, [tasksList, leadsList, user, headedTeamIds, teamFilter, effectiveOwnerFilter]);

  const tasksCompletedByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const task of filteredTasks) {
      if ((task.status ?? "OPEN").toUpperCase() !== "COMPLETED") continue;
      const ts = task.updatedAt ? new Date(task.updatedAt) : null;
      if (!ts || Number.isNaN(ts.getTime())) continue;
      if (ts < periodStart) continue;
      const key = toIsoDateKey(ts);
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [filteredTasks, periodStart]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, DayTaskEvent[]> = {};
    for (const task of filteredTasks) {
      const ts = task.updatedAt ? new Date(task.updatedAt) : null;
      if (!ts || Number.isNaN(ts.getTime())) continue;
      if (ts < periodStart) continue;
      // Only show completed tasks in the day-detail (matches the chart line semantics).
      if ((task.status ?? "OPEN").toUpperCase() !== "COMPLETED") continue;
      const key = toIsoDateKey(ts);
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
    return map;
  }, [filteredTasks, periodStart]);

  const leadsTouchedCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [key, ids] of Object.entries(dayBuckets.leadIds)) {
      map[key] = ids.length;
    }
    return map;
  }, [dayBuckets.leadIds]);

  const leadsById = useMemo(() => {
    const m = new Map<string, Lead>();
    for (const lead of leadsList) m.set(lead.id, lead);
    return m;
  }, [leadsList]);

  const handleDayClick = (isoDate: string) => {
    setDialogState({ open: true, isoDate });
  };

  const dialogIsoDate = dialogState.isoDate;
  const dialogActivities = dialogIsoDate ? dayBuckets.activities[dialogIsoDate] ?? [] : [];
  const dialogTasks = dialogIsoDate ? tasksByDate[dialogIsoDate] ?? [] : [];
  const dialogLeadIds = dialogIsoDate ? dayBuckets.leadIds[dialogIsoDate] ?? [] : [];

  const funnelOutreachTotal = useMemo(() => {
    const touchedLeadIds = new Set<string>();
    Object.values(dayBuckets.leadIds).forEach((ids) => {
      ids.forEach((id) => touchedLeadIds.add(id));
    });
    return touchedLeadIds.size;
  }, [dayBuckets.leadIds]);

  const funnelData = [
    { name: "Outreach", value: funnelOutreachTotal, color: "#3b82f6" },
    { name: "Connected", value: linkedinAcceptedByStatus, color: "#8b5cf6" },
    {
      name: "MQL",
      value: mqlCount,
      color: "#d946ef",
    },
    {
      name: "SQL",
      value: sqlCount,
      color: "#f97316",
    },
  ];

  const COLORS = ['#3b82f6', '#8b5cf6', '#d946ef', '#f97316'];

  if (isLoadingLeads) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">Deep dive into outreach performance and pipeline health</p>
        </div>

        <div className="flex items-center gap-2">
          {user.role === Role.ADMIN && (
            <Select value={teamFilter} onValueChange={(val) => { setTeamFilter(val); setOwnerFilter("ALL"); }}>
              <SelectTrigger className="w-[140px] bg-background">
                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Teams</SelectItem>
                {teamsList.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {user.role === Role.TEAM_LEAD && tlViewMode === "team" && headedTeamIds.size > 1 && (
            <Select value={teamFilter} onValueChange={(val) => { setTeamFilter(val); setOwnerFilter("ALL"); }}>
              <SelectTrigger className="w-[155px] bg-background">
                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All My Teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All My Teams</SelectItem>
                {teamsList.filter(t => headedTeamIds.has(t.id)).map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(user.role === Role.ADMIN || (user.role === Role.TEAM_LEAD && tlViewMode === "team")) && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[140px] bg-background">
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

          {user.role === Role.TEAM_LEAD && (
            <div className="inline-flex items-center gap-1 rounded-full border bg-muted/40 p-1 shrink-0">
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

          <Select value={timePeriod} onValueChange={(v: any) => setTimePeriod(v)}>
            <SelectTrigger className="w-[140px] bg-background">
              <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Monthly" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Outreach" value={funnelData[0].value} icon={Zap} trend="0%" />
        <MetricCard title="Acceptance Rate" value={`${linkedinAcceptRateByStatus}%`} icon={TrendingUp} trend="0%" />
        <MetricCard title="Pipeline Value" value={pipelineValue} icon={Target} trend="0%" />
        <MetricCard title="Active Prospects" value={activeProspects} icon={Users} trend="0" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <ActivityChart
          data={filteredActivities}
          title="Outreach Trends"
          description={"Emails, connections, tasks completed, and leads touched over time \u2014 click any point for the day's details"}
          tasksCompletedByDate={tasksCompletedByDate}
          leadsTouchedByDate={leadsTouchedCountByDate}
          onDayClick={handleDayClick}
        />
        
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>Stage breakdown from outreach to SQL</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'transparent' }} />
                <Bar 
                  dataKey="value" 
                  radius={[0, 4, 4, 0]} 
                  barSize={32}
                  className="cursor-pointer"
                  onClick={(data) => {
                    if (data && data.name) {
                      setLocation(`/analytics/leads/${data.name.toLowerCase()}`);
                    }
                  }}
                >
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Channel Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Email', value: totals.emails },
                    { name: 'LinkedIn', value: totals.linkedin },
                    { name: 'Calls', value: totals.calls },
                  ]}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {COLORS.map((color, index) => (
                    <Cell key={`cell-${index}`} fill={color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-xs mt-2">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#3b82f6]" /> Email</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#8b5cf6]" /> LinkedIn</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#d946ef]" /> Calls</div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Channel Efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <EfficiencyRow 
                icon={Mail} 
                label="Email" 
                value={totals.emails} 
                rate={emailReplyRate}
                rateLabel="reply rate"
                color="bg-blue-500" 
              />
              <EfficiencyRow 
                icon={MessageSquare} 
                label="LinkedIn" 
                value={linkedinRequestsByStatus} 
                rate={linkedinAcceptRateByStatus}
                rateLabel="accept rate"
                color="bg-purple-500" 
              />
              <EfficiencyRow 
                icon={Phone} 
                label="Cold Call" 
                value={totals.calls} 
                rate={coldCallMeetingSetRate}
                rateLabel="meeting rate"
                color="bg-orange-500" 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <OutreachDayDetailDialog
        open={dialogState.open}
        onOpenChange={(open) =>
          setDialogState((prev) => ({ open, isoDate: open ? prev.isoDate : null }))
        }
        isoDate={dialogIsoDate}
        activities={dialogActivities}
        tasks={dialogTasks}
        leadIds={dialogLeadIds}
        leadsById={leadsById}
      />
    </div>
  );
}

function MetricCard({ title, value, icon: Icon }: any) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold mt-1">{value}</h3>
          </div>
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EfficiencyRow({ icon: Icon, label, value, rate, rateLabel, color }: any) {
  const normalizedRate = Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 0;
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-md text-white", color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{value.toLocaleString()} outreach items</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold">{normalizedRate}% {rateLabel}</p>
        <div className="w-24 h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
          <div className={cn("h-full", color)} style={{ width: `${normalizedRate}%` }} />
        </div>
      </div>
    </div>
  );
}
