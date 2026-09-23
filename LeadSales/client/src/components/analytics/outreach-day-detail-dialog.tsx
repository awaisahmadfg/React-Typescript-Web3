import { useMemo } from "react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";
import {
  Mail,
  MessageSquare,
  Phone,
  Calendar as CalendarIcon,
  ClipboardList,
  Users as UsersIcon,
  Activity as ActivityIcon,
  CheckCircle2,
  ArrowUpRight,
  Inbox,
  X,
} from "lucide-react";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types";

export interface DayActivityEvent {
  id: string;
  leadId: string;
  type: string;
  channel?: string;
  subject?: string | null;
  body?: string | null;
  notes?: string | null;
  happenedAt: string;
}

export interface DayTaskEvent {
  id: string;
  leadId?: string | null;
  planId?: string | null;
  userId: string;
  type: string;
  status: string;
  priority: string;
  dueDate: string;
  notes?: string | null;
  updatedAt?: string | null;
  leadName?: string | null;
  company?: string | null;
  planName?: string | null;
  assigneeIds?: string[];
}

interface OutreachDayDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isoDate: string | null;
  activities: DayActivityEvent[];
  tasks: DayTaskEvent[];
  leadIds: string[];
  leadsById: Map<string, Lead>;
}

const formatActivityLabel = (type: string, channel?: string): { label: string; icon: typeof Mail; color: string } => {
  const t = type.toLowerCase();
  if (t === "email" || t.includes("email")) {
    return { label: "Email Sent", icon: Mail, color: "text-blue-500 bg-blue-500/10" };
  }
  if (t === "email_replied") {
    return { label: "Email Reply", icon: Mail, color: "text-blue-600 bg-blue-600/10" };
  }
  if (t === "linkedin_message") {
    if (channel === "conn") {
      return {
        label: "LinkedIn Connection Request",
        icon: MessageSquare,
        color: "text-purple-500 bg-purple-500/10",
      };
    }
    return { label: "LinkedIn Message", icon: MessageSquare, color: "text-indigo-500 bg-indigo-500/10" };
  }
  if (t === "linkedin_connection_accepted") {
    return {
      label: "LinkedIn Connection Accepted",
      icon: CheckCircle2,
      color: "text-emerald-500 bg-emerald-500/10",
    };
  }
  if (t === "call") {
    return { label: "Cold Call", icon: Phone, color: "text-orange-500 bg-orange-500/10" };
  }
  if (t === "meeting") {
    return { label: "Meeting", icon: CalendarIcon, color: "text-emerald-600 bg-emerald-600/10" };
  }
  if (t === "task_completed") {
    return { label: "Task Completed", icon: CheckCircle2, color: "text-green-500 bg-green-500/10" };
  }
  if (t === "status_change") {
    return { label: "Stage Change", icon: ArrowUpRight, color: "text-fuchsia-500 bg-fuchsia-500/10" };
  }
  if (t === "note") {
    return { label: "Note", icon: ClipboardList, color: "text-slate-500 bg-slate-500/10" };
  }
  return { label: type.replace(/_/g, " "), icon: ActivityIcon, color: "text-muted-foreground bg-muted" };
};

const taskTypeIcon = (type: string) => {
  const t = type.toLowerCase();
  if (t.includes("email")) return Mail;
  if (t.includes("linkedin")) return MessageSquare;
  if (t.includes("call") || t.includes("phone")) return Phone;
  return ClipboardList;
};

const priorityVariant = (priority: string): { className: string; label: string } => {
  const p = priority.toUpperCase();
  if (p === "HIGH") return { className: "bg-red-500/10 text-red-600 border-red-500/20", label: "High" };
  if (p === "LOW") return { className: "bg-slate-500/10 text-slate-600 border-slate-500/20", label: "Low" };
  return { className: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Medium" };
};

function EmptyState({ icon: Icon, title, description }: { icon: typeof Inbox; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
    </div>
  );
}

export function OutreachDayDetailDialog({
  open,
  onOpenChange,
  isoDate,
  activities,
  tasks,
  leadIds,
  leadsById,
}: OutreachDayDetailDialogProps) {
  const dateLabel = useMemo(() => {
    if (!isoDate) return "";
    try {
      return format(parseISO(isoDate), "EEEE, MMM d, yyyy");
    } catch {
      return isoDate;
    }
  }, [isoDate]);

  const sortedActivities = useMemo(
    () =>
      [...activities].sort(
        (a, b) => new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime(),
      ),
    [activities],
  );

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return (order[a.priority?.toUpperCase()] ?? 1) - (order[b.priority?.toUpperCase()] ?? 1);
      }),
    [tasks],
  );

  const uniqueLeads = useMemo(() => {
    const seen = new Set<string>();
    const out: Lead[] = [];
    for (const id of leadIds) {
      if (seen.has(id)) continue;
      const lead = leadsById.get(id);
      if (!lead) continue;
      seen.add(id);
      out.push(lead);
    }
    return out;
  }, [leadIds, leadsById]);

  const counts = {
    activities: sortedActivities.length,
    tasks: sortedTasks.length,
    leads: uniqueLeads.length,
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 opacity-0 transition-opacity duration-200 ease-out data-[state=open]:opacity-100" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[92vw] h-[88vh] max-w-6xl translate-x-[-50%] translate-y-[-50%] scale-[0.98] opacity-0 transition-[opacity,transform] duration-200 ease-out data-[state=open]:scale-100 data-[state=open]:opacity-100 flex flex-col gap-0 p-0 overflow-hidden border bg-background shadow-lg rounded-lg focus:outline-none">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <CalendarIcon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <DialogPrimitive.Title className="text-base font-semibold leading-none tracking-tight">
                  Day Detail
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground mt-0.5">
                  {dateLabel}
                </DialogPrimitive.Description>
              </div>
            </div>
          </div>
          {/* Close button */}
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

        <Tabs defaultValue="activities" className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 pb-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="activities" className="gap-1.5">
                <ActivityIcon className="w-3.5 h-3.5" />
                Activities
                <span className="ml-1 text-xs text-muted-foreground">({counts.activities})</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" />
                Tasks
                <span className="ml-1 text-xs text-muted-foreground">({counts.tasks})</span>
              </TabsTrigger>
              <TabsTrigger value="leads" className="gap-1.5">
                <UsersIcon className="w-3.5 h-3.5" />
                Leads
                <span className="ml-1 text-xs text-muted-foreground">({counts.leads})</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="activities" className="flex-1 min-h-0 overflow-hidden mt-0">
            <ScrollArea className="h-full px-6 pb-6">
              {sortedActivities.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No activity on this day"
                  description="Outreach events like emails, calls, and LinkedIn messages will appear here."
                />
              ) : (
                <ul className="divide-y">
                  {sortedActivities.map((evt) => {
                    const meta = formatActivityLabel(evt.type, evt.channel);
                    const Icon = meta.icon;
                    const lead = leadsById.get(evt.leadId);
                    return (
                      <li key={evt.id}>
                        <Link
                          href={lead ? `/leads/${evt.leadId}#activity-${evt.id}` : "#"}
                          onClick={() => onOpenChange(false)}
                          className="flex items-start gap-3 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
                        >
                          <div className={cn("p-2 rounded-md shrink-0", meta.color)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">{meta.label}</p>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {format(new Date(evt.happenedAt), "h:mm a")}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {lead ? `${lead.firstName} ${lead.lastName}` : "Unknown lead"}
                              {lead?.company ? ` \u2022 ${lead.company}` : ""}
                            </p>
                            {evt.subject ? (
                              <p className="text-xs text-foreground/80 mt-1 line-clamp-1">{evt.subject}</p>
                            ) : null}
                          </div>
                          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tasks" className="flex-1 min-h-0 overflow-hidden mt-0">
            <ScrollArea className="h-full px-6 pb-6">
              {sortedTasks.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No tasks for this day"
                  description="Completed and due tasks for this date will be listed here."
                />
              ) : (
                <ul className="divide-y">
                  {sortedTasks.map((task) => {
                    const Icon = taskTypeIcon(task.type);
                    const priority = priorityVariant(task.priority);
                    const isCompleted = (task.status ?? "OPEN").toUpperCase() === "COMPLETED";
                    return (
                      <li key={task.id}>
                        <Link
                          href={task.leadId ? `/leads/${task.leadId}#task-${task.id}` : "/tasks"}
                          onClick={() => onOpenChange(false)}
                          className="flex items-start gap-3 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
                        >
                          <div
                            className={cn(
                              "p-2 rounded-md shrink-0",
                              isCompleted ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{task.type}</p>
                              <Badge variant="outline" className={cn("text-[10px] py-0 h-4", priority.className)}>
                                {priority.label}
                              </Badge>
                              {isCompleted ? (
                                <Badge variant="outline" className="text-[10px] py-0 h-4 bg-green-500/10 text-green-600 border-green-500/20">
                                  Completed
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] py-0 h-4">
                                  {task.status}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {task.leadName || "Plan-level task"}
                              {task.company ? ` \u2022 ${task.company}` : ""}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Due: {format(parseISO(task.dueDate), "MMM d, yyyy")}
                              {isCompleted && task.updatedAt
                                ? ` • Completed: ${format(parseISO(task.updatedAt), "MMM d, yyyy")}`
                                : ""}
                            </p>
                            {task.notes ? (
                              <p className="text-xs text-foreground/80 mt-1 line-clamp-1">{task.notes}</p>
                            ) : null}
                          </div>
                          <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="leads" className="flex-1 min-h-0 overflow-hidden mt-0">
            <ScrollArea className="h-full px-6 pb-6">
              {uniqueLeads.length === 0 ? (
                <EmptyState
                  icon={UsersIcon}
                  title="No leads touched on this day"
                  description="Leads receiving outreach activity on this date will be shown here."
                />
              ) : (
                <ul className="divide-y">
                  {uniqueLeads.map((lead) => {
                    return (
                      <li key={lead.id}>
                        <Link
                          href={`/leads/${lead.id}`}
                          onClick={() => onOpenChange(false)}
                          className="flex items-center gap-3 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
                        >
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="text-xs">
                              {(lead.firstName?.[0] ?? "?") + (lead.lastName?.[0] ?? "")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {lead.firstName} {lead.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {lead.title ? `${lead.title} \u2022 ` : ""}
                              {lead.company ?? "\u2014"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-[10px] py-0 h-4">
                              {lead.stage}
                            </Badge>
                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
