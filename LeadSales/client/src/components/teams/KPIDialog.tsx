import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Metric, Period, Team, Goal } from "@/lib/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";

interface KPIDialogProps {
  team: Team;
  existingGoals: Goal[];
  trigger?: React.ReactNode;
}

export function KPIDialog({ team, existingGoals: _existingGoals, trigger }: KPIDialogProps) {
  const [metric, setMetric] = useState<Metric>(Metric.LINKEDIN_CONNECTIONS);
  const [target, setTarget] = useState<string>("100");
  const [period, setPeriod] = useState<Period>(Period.MONTH);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const saveGoalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: team.id,
          metric,
          period,
          target: Number(target),
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to save goal");
      }
      return res.json() as Promise<Goal>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
    },
  });

  const handleSave = () => {
    saveGoalMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "KPI Updated",
          description: `Target for ${metric.replace("_", " ")} set to ${target} for ${team.name}.`,
        });
        setIsOpen(false);
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to save KPI.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Settings2 className="w-4 h-4" />
            Set KPIs
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Team KPIs</DialogTitle>
          <DialogDescription>
            Configure performance targets for {team.name}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="metric" className="text-right">
              Metric
            </Label>
            <div className="col-span-3">
              <Select value={metric} onValueChange={(val) => setMetric(val as Metric)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select metric" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Metric).map((m) => (
                    <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="target" className="text-right">
              Target
            </Label>
            <div className="col-span-3">
              <Input 
                id="target" 
                type="number" 
                value={target} 
                onChange={(e) => setTarget(e.target.value)} 
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="period" className="text-right">
              Period
            </Label>
            <div className="col-span-3">
               <Select value={period} onValueChange={(val) => setPeriod(val as Period)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Period).map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save Goal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
