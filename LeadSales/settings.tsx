import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { availableStages } from "@/lib/mock-data";
import { Plus, X, Save, Lock, Upload, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function SettingsPage() {
  const { user, fetchMe } = useAuth();
  const [stages, setStages] = useState<string[]>(availableStages);
  const [newStage, setNewStage] = useState("");
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl || user?.avatar || null);

  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: ""
  });

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast({ title: "Error", description: "Image must be less than 2MB", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const dataUrl = reader.result as string;
        setAvatarPreview(dataUrl);

        if (!user) {
          toast({ title: "Error", description: "You must be logged in to update your avatar.", variant: "destructive" });
          return;
        }

        try {
          const res = await fetch(`/api/users/${user.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avatarUrl: dataUrl }),
          });
          if (!res.ok) {
            throw new Error("Failed to save avatar");
          }
          await fetchMe();
          toast({ title: "Success", description: "Profile picture updated." });
        } catch (err) {
          toast({ title: "Error", description: "Failed to update profile picture.", variant: "destructive" });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const handleUpdatePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast({ title: "Error", description: "All password fields are required", variant: "destructive" });
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    setPasswordSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || "Failed to update password");
      }
      toast({ title: "Success", description: "Password updated successfully" });
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update password", variant: "destructive" });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleAddStage = () => {
    if (newStage && !stages.includes(newStage.toUpperCase())) {
      setStages([...stages, newStage.toUpperCase()]);
      setNewStage("");
      toast({
        title: "Stage Added",
        description: `${newStage} has been added to available lead stages.`,
      });
    }
  };

  const handleRemoveStage = (stageToRemove: string) => {
    setStages(stages.filter(s => s !== stageToRemove));
    toast({
      title: "Stage Removed",
      description: `${stageToRemove} has been removed.`,
    });
  };

  const handleSave = () => {
    // In a real app, this would persist to backend
    toast({
      title: "Settings Saved",
      description: "Your configuration changes have been applied.",
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage organization configurations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>Update your public avatar.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
            <Avatar className="h-24 w-24 border-2 border-sidebar-border transition-transform group-hover:scale-105">
              <AvatarImage src={avatarPreview || undefined} />
              <AvatarFallback className="text-2xl bg-sidebar-primary/10 text-sidebar-primary">
                {user?.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-lg">{user?.name}</h3>
            <p className="text-sm text-muted-foreground capitalize">{user?.role.toLowerCase().replace('_', ' ')}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={handleAvatarClick}>
              Change Picture
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account security credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current">Current Password</Label>
            <Input 
              id="current" 
              type="password" 
              value={passwords.current}
              onChange={(e) => setPasswords(prev => ({ ...prev, current: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new">New Password</Label>
              <Input 
                id="new" 
                type="password" 
                value={passwords.new}
                onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm New Password</Label>
              <Input 
                id="confirm" 
                type="password" 
                value={passwords.confirm}
                onChange={(e) => setPasswords(prev => ({ ...prev, confirm: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
        <div className="p-6 pt-0 flex justify-end">
          <Button onClick={handleUpdatePassword} disabled={passwordSubmitting}>
            <Lock className="w-4 h-4 mr-2" />
            {passwordSubmitting ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </Card>

      {user?.role === "ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle>Lead Stages</CardTitle>
            <CardDescription>Customize the stages available for your sales pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-2 items-end">
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <Label htmlFor="stage">New Stage Name</Label>
                <Input 
                  id="stage" 
                  placeholder="e.g. DISCOVERY" 
                  value={newStage}
                  onChange={(e) => setNewStage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddStage()}
                />
              </div>
              <Button onClick={handleAddStage} variant="secondary">
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-4">
              {stages.map((stage) => (
                <Badge key={stage} variant="outline" className="pl-3 pr-1 py-1 flex items-center gap-2 text-sm">
                  {stage}
                  <button 
                    onClick={() => handleRemoveStage(stage)}
                    className="hover:bg-destructive hover:text-destructive-foreground rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
          <div className="p-6 pt-0 flex justify-end">
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team Configuration</CardTitle>
          <CardDescription>General team settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Additional team settings would go here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
