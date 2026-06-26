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
    <div className="flex min-h-[calc(100vh-49px)] items-center justify-center bg-cream px-6 py-16">
      <Card className="w-full max-w-sm overflow-hidden">
        <div className="flex flex-col items-center gap-3 border-b border-border bg-muted/50 px-8 py-8">
          <Lock className="h-6 w-6 text-flame-red" />
          <div className="text-sm font-semibold">OpenInference</div>
          <p className="text-center text-sm text-muted-foreground">Sign in to access traces, agents, and governance tools.</p>
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

          <div className="relative my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <a
            href="/v1/auth/google"
            className="flex w-full items-center justify-center gap-2.5 border border-border-strong px-4 py-2.5 text-xs uppercase tracking-[0.12em] transition hover:bg-surface"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>

          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            {mode === "login" ? "New here? Switch to Sign up." : "Signing up creates your own workspace on the free plan."}
          </p>
        </div>
      </Card>
    </div>
  );
}
