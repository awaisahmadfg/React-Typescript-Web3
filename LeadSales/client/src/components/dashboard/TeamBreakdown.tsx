import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ActivityDaily, Team, User } from "@/lib/types";
import { TrendingUp, Users } from "lucide-react";

interface TeamBreakdownProps {
  teams: Team[];
  activities: ActivityDaily[];
  users: User[];
}

export function TeamBreakdown({ teams, activities, users }: TeamBreakdownProps) {
  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Team Performance Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team Name</TableHead>
              <TableHead>Members</TableHead>
              <TableHead className="text-right">Emails Sent</TableHead>
              <TableHead className="text-right">Connection Requests</TableHead>
              <TableHead className="text-right">Acceptance Rate</TableHead>
              <TableHead className="text-right">Efficiency Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team) => {
              const teamActivities = activities.filter(a => a.teamId === team.id);
              const totalEmails = teamActivities.reduce((acc, curr) => acc + curr.emailsSent, 0);
              const totalConnections = teamActivities.reduce((acc, curr) => acc + curr.linkedinConnectionsSent, 0);
              const totalInMails = teamActivities.reduce((acc, curr) => acc + (curr.inMailsSent || 0), 0);
              const totalDirectMessages = teamActivities.reduce((acc, curr) => acc + (curr.personalizedEmailsSent || 0), 0);
              const totalCalls = teamActivities.reduce((acc, curr) => acc + (curr.coldCalls || 0), 0);
              const totalAccepts = teamActivities.reduce((acc, curr) => acc + curr.connectionAccepts, 0);
              const acceptRate = totalConnections > 0 ? Math.round((totalAccepts / totalConnections) * 100) : null;
              const liveMemberCount = users.filter((u) => u.teamIds?.includes(team.id) && u.isActive).length;

              // Replaced Abdulllah Mock Efficiency Score formula with a more realistic efficiency score that considers both volume and outcomes.
              const outreachVolume =
                totalEmails + totalConnections + totalInMails + totalDirectMessages + totalCalls;
              const weightedOutcome = outreachVolume + totalAccepts * 2;
              const efficiency =
                outreachVolume > 0
                  ? Number((weightedOutcome / Math.max(liveMemberCount, 1)).toFixed(1))
                  : null;

              return (
                <TableRow key={team.id} className="group hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                       <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                         {team.name.charAt(0)}
                       </span>
                       {team.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {liveMemberCount}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{totalEmails}</TableCell>
                  <TableCell className="text-right font-mono">{totalConnections}</TableCell>
                  <TableCell className="text-right">
                    {acceptRate === null ? (
                      <Badge variant="outline">N/A</Badge>
                    ) : (
                      <Badge variant={acceptRate > 20 ? "default" : "secondary"} className={acceptRate > 20 ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                        {acceptRate}%
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 text-xs font-medium">
                       <TrendingUp className="w-3 h-3 text-emerald-500" />
                       {efficiency === null ? "-" : efficiency}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
