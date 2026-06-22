import { useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { login, signup, type AuthUser } from "@/lib/auth";
import { Button, Card, Input, Label } from "@/components/ui/primitives";

export function AuthScreen({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) return toast.error("Email and password required");
    if (mode === "signup" && password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      const user = mode === "login"
        ? await login(email.trim(), password)
        : await signup(email.trim(), password);
      toast.success(mode === "login" ? "Signed in" : "Account created");
      onAuthed(user);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6 py-16">
      <Card className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 border-b border-border bg-ink px-8 py-8 text-cream">
          <Lock className="h-6 w-6" />
          <div className="text-xs uppercase tracking-[0.2em]">OpenInference</div>
        </div>
        <div className="p-8">
          <div className="mb-6 flex gap-1 border-b border-border">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  "px-4 py-2 text-xs uppercase tracking-[0.12em] transition cursor-pointer " +
                  (mode === m ? "border-b-2 border-flame-red text-ink" : "text-muted-foreground hover:text-ink")
                }
              >
                {m === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>
          <div className="mb-3">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
          </div>
          <div className="mb-5">
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          <Button className="w-full" onClick={submit} disabled={busy}>
            {busy ? "…" : mode === "login" ? "Sign in →" : "Create account →"}
          </Button>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            {mode === "login" ? "New here? Switch to Sign up." : "Signing up creates your own workspace on the free plan."}
          </p>
        </div>
      </Card>
    </div>
  );
}
