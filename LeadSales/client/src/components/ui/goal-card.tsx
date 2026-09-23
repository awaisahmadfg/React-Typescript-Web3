import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface GoalCardProps {
  title: string;
  current: number;
  target: number;
  icon?: LucideIcon;
  className?: string;
}

export function GoalCard({ title, current, target, icon: Icon, className }: GoalCardProps) {
  const percentage = Math.min(Math.round((current / target) * 100), 100);
  
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between mb-2">
          <div className="text-2xl font-bold">{current.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mb-1">Target: {target.toLocaleString()}</div>
        </div>
        <Progress value={percentage} className="h-2" />
        <p className="text-xs text-muted-foreground mt-2 text-right">{percentage}% Complete</p>
      </CardContent>
    </Card>
  );
}
