import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Users, Database, PieChart, LogOut, Briefcase, Settings as SettingsIcon, ClipboardList, CheckSquare, Target, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Role } from "@/lib/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [isDashboardOpen, setIsDashboardOpen] = useState(true);

  const isActive = (path: string) => location === path;

  const dashboardItems = [
    {
      label: "Overview",
      icon: LayoutDashboard,
      href: "/dashboard",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
    {
      label: "Tasks",
      icon: CheckSquare,
      href: "/tasks",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
    {
      label: "Plans",
      icon: ClipboardList,
      href: "/plans",
      roles: [Role.ADMIN, Role.TEAM_LEAD],
    },
    {
      label: "Leads",
      icon: Users,
      href: "/leads",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
    {
      label: "Import Data",
      icon: Database,
      href: "/import",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
    {
      label: "Analytics",
      icon: PieChart,
      href: "/analytics",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
    {
      label: "Pipeline",
      icon: Target,
      href: "/pipeline",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
    {
      label: "LinkedIn Profiles",
      icon: Globe,
      href: "/profiles",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
  ];

  const mainItems = [
    {
      label: "Client Ledger",
      icon: Database,
      href: "/clients",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
    {
      label: "Teams",
      icon: Briefcase,
      href: "/teams",
      roles: [Role.ADMIN],
    },
    {
      label: "User Management",
      icon: Users,
      href: "/users",
      roles: [Role.ADMIN],
    },
    {
      label: "Settings",
      icon: SettingsIcon,
      href: "/settings",
      roles: [Role.ADMIN, Role.TEAM_LEAD, Role.AE, Role.SDR],
    },
  ];

  const filteredDashboardItems = dashboardItems.filter((item) => 
    user && item.roles.includes(user.role)
  );

  const filteredMainItems = mainItems.filter((item) => 
    user && item.roles.includes(user.role)
  );

  return (
    <div className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col h-screen fixed left-0 top-0 z-50 shadow-xl shadow-black/5">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar-accent/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-lg shadow-sm">
            S
          </div>
          <span className="font-bold text-lg tracking-tight">SalesPulse</span>
        </div>
      </div>

      <div className="flex-1 py-6 px-3 space-y-4 overflow-y-auto">
        <div className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
          Platform
        </div>
        
        <Collapsible open={isDashboardOpen} onOpenChange={setIsDashboardOpen} className="space-y-1">
          <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200">
            <div className="flex items-center gap-3">
              <LayoutDashboard className="w-4 h-4 text-sidebar-foreground/50" />
              <span>Dashboard</span>
            </div>
            {isDashboardOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-4 space-y-1">
            {filteredDashboardItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 group cursor-pointer",
                    isActive(item.href)
                      ? "bg-sidebar-primary/10 text-sidebar-primary shadow-sm"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-1"
                  )}
                >
                  <item.icon className={cn("w-3.5 h-3.5 transition-colors", isActive(item.href) ? "text-sidebar-primary" : "text-sidebar-foreground/40 group-hover:text-sidebar-accent-foreground")} />
                  {item.label}
                </div>
              </Link>
            ))}
          </CollapsibleContent>
        </Collapsible>

        <div className="space-y-1">
          {filteredMainItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 group cursor-pointer",
                  isActive(item.href)
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-1"
                )}
              >
                <item.icon className={cn("w-4 h-4 transition-colors", isActive(item.href) ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-accent-foreground")} />
                {item.label}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/5">
        <div className="flex items-center gap-3 mb-4 px-2 p-2 rounded-lg bg-sidebar-accent/10 border border-sidebar-border/50">
          <div className="relative">
            <Avatar className="h-9 w-9 ring-2 ring-sidebar-background">
              <AvatarImage src={user?.avatarUrl || user?.avatar || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-sidebar-primary to-purple-600 text-white text-xs font-bold">
                {user?.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-sidebar-background"></div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate capitalize">{user?.role.replace('_', ' ').toLowerCase()}</p>
          </div>
        </div>
        <button 
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
