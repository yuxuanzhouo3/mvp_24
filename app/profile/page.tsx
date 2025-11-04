"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Save, User, Mail, Crown } from "lucide-react";
import { Header } from "@/components/header";
import { useApp } from "@/components/app-context";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { language, activeView, setActiveView } = useApp();

  const userInitial = useMemo(() => {
    const takeInitial = (value?: string | null) => {
      if (!value) return "";
      const trimmed = value.trim();
      return trimmed ? trimmed.charAt(0).toUpperCase() : "";
    };
    if (!user) return "U";
    return takeInitial(user.full_name) || takeInitial(user.email) || "U";
  }, [user]);

  const router = useRouter();
  const currentDebugParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("debug") : null;
  const buildUrl = (path: string) => currentDebugParam ? `${path}?debug=${currentDebugParam}` : path;

  useEffect(() => {
    const initializeProfile = async () => {
      try {
        setLoading(true);
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { router.push(buildUrl("/auth")); return; }
        const { data: profile, error } = await supabase.from("user_profiles").select("*").eq("id", authUser.id).single();
        if (error) { console.error("Load error:", error); setError("Load failed"); return; }
        setUser(profile);
      } catch (error) {
        console.error("Init error:", error);
        setError("Load failed");
      } finally {
        setLoading(false);
      }
    };
    initializeProfile();
  }, [router]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updates = { id: user.id, email: user.email, full_name: user.full_name?.trim() || "", avatar_url: user.avatar_url?.trim() || "", subscription_plan: user.subscription_plan, subscription_status: user.subscription_status };
      const { data, error } = await supabase.from("user_profiles").upsert(updates, { onConflict: "id" }).select().single();
      if (error) { setError(error.message || "Save failed"); return; }
      setUser(data);
      setSuccess("Saved");
    } catch (err) {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: string, value: string) => { setUser((prev: any) => ({ ...prev, [field]: value })); };

  if (loading) return (<div className="min-h-screen bg-gray-50"><Header activeView={activeView} setActiveView={setActiveView} /><div className="flex items-center justify-center py-20"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div><p className="mt-4 text-gray-600">Loading...</p></div></div></div>);
  if (!user) return (<div className="min-h-screen bg-gray-50"><Header activeView={activeView} setActiveView={setActiveView} /><div className="flex items-center justify-center py-20"><div className="text-center"><p className="text-gray-600">Please login</p><Button onClick={() => router.push(buildUrl("/auth"))} className="mt-4">Login</Button></div></div></div>);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header activeView={activeView} setActiveView={setActiveView} />
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-6"><Button variant="ghost" onClick={() => router.back()} className="flex items-center space-x-2"><ArrowLeft className="w-4 h-4" /><span>Back</span></Button></div>
        <Card>
          <CardHeader><CardTitle className="flex items-center space-x-2"><User className="w-5 h-5" /><span>Profile</span></CardTitle><CardDescription>Manage your account</CardDescription></CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center space-x-4">
              <Avatar className="w-20 h-20"><AvatarImage src={user.avatar_url} alt={user.full_name} /><AvatarFallback className="text-lg">{userInitial}</AvatarFallback></Avatar>
              <div className="space-y-2"><h3 className="text-lg font-semibold">{user.full_name}</h3><div className="flex items-center space-x-2 text-gray-600"><Mail className="w-4 h-4" /><span>{user.email}</span></div></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2"><Label htmlFor="full_name">Name</Label><Input id="full_name" value={user.full_name} onChange={(e) => handleInputChange("full_name", e.target.value)} placeholder="Name" /></div>
              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={user.email} disabled /></div>
              <div className="space-y-2"><Label htmlFor="avatar_url">Avatar URL</Label><Input id="avatar_url" value={user.avatar_url} onChange={(e) => handleInputChange("avatar_url", e.target.value)} placeholder="URL" /></div>
              <div className="space-y-2"><Label>Membership</Label><div className="flex items-center space-x-2"><span className="text-sm">{user.membership_expires_at ? new Date(user.membership_expires_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "No membership"}</span><Button variant="outline" size="sm" onClick={() => router.push(buildUrl("/payment"))}>{user.membership_expires_at ? "Renew" : "Subscribe"}</Button></div></div>
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription className="text-green-600">{success}</AlertDescription></Alert>}
            <div className="flex justify-end"><Button onClick={handleSave} disabled={saving}>{saving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Saving...</>) : (<><Save className="w-4 h-4 mr-2" />Save</>)}</Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
