import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ReminderDialogProps {
  leadId: string;
  leadName: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (data?: { date: string, notes: string }) => void;
}

export function ReminderDialog({ leadId: _leadId, leadName, trigger, open, onOpenChange, onSuccess }: ReminderDialogProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState("09:00");
  const [note, setNote] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const { toast } = useToast();

  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange !== undefined ? onOpenChange : setInternalOpen;

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!date) {
      toast({ title: "Error", description: "Please select a date", variant: "destructive" });
      return;
    }
    
    onSuccess?.({
      date: format(date, "yyyy-MM-dd"),
      notes: note
    });
    setIsOpen(false);
  };

  const handleSkip = () => {
    if (window.confirm("No follow up set for this lead. Are you sure you want to mark it as complete?")) {
      onSuccess?.();
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Bell className="w-4 h-4" />
            Set Reminder
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Set Cadence Reminder</DialogTitle>
          <DialogDescription>
            Schedule a follow-up for {leadName}. We'll notify you when it's time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="date" className="text-right">
              Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-[280px] justify-start text-left font-normal col-span-3",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="time" className="text-right">
              Time
            </Label>
            <div className="col-span-3 relative">
               <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
               <Input 
                 id="time" 
                 type="time" 
                 value={time} 
                 onChange={(e) => setTime(e.target.value)} 
                 className="pl-9" 
               />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="note" className="text-right">
              Note
            </Label>
            <Textarea 
              id="note" 
              value={note} 
              onChange={(e) => setNote(e.target.value)} 
              placeholder="e.g. Send 2nd touchpoint email"
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between w-full">
          <Button type="button" variant="ghost" onClick={handleSkip} className="w-full sm:w-auto">
            No Follow-up
          </Button>
          <Button onClick={() => handleSubmit()}>Save Reminder</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
