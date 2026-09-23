import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/hooks/use-auth";
import { reminders } from "@/lib/mock-data";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Mock Reminder Logic
  useEffect(() => {
    if (!user) return;

    // Check for any reminders due now/recently
    const userReminders = reminders.filter(r => r.userId === user.id && !r.completed);
    
    // Simulate checking every 30 seconds (mock implementation just runs once on mount for demo)
    const checkReminders = () => {
      const dueReminders = userReminders.filter(r => {
        const reminderDate = parseISO(r.date);
        return isPast(reminderDate); // Simple "is past" check for demo
      });

      if (dueReminders.length > 0) {
        dueReminders.forEach(r => {
          toast({
             title: "Reminder Due!",
             description: (
               <div className="flex flex-col gap-1">
                 <span className="font-medium">{r.note}</span>
                 <span className="text-xs opacity-90">{format(parseISO(r.date), "h:mm a")}</span>
               </div>
             ),
             action: <Bell className="h-4 w-4 text-primary" />
          });
        });
      }
    };

    const timer = setTimeout(checkReminders, 2000); // 2 seconds after load
    return () => clearTimeout(timer);
  }, [user, toast]);

  return (
    <div className="min-h-screen bg-background font-sans">
      <Sidebar />
      <main className="pl-64 min-h-screen">
        <div className="container mx-auto p-8 max-w-7xl">
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
