import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Check } from "lucide-react";
import { api } from "@/lib/api";
import { acceptInvite, useAuth } from "@/lib/auth";
import { AuthScreen } from "@/components/AuthScreen";
import { Badge, Button, Card } from "@/components/ui/primitives";

type InvitePreview = {
  email: string;
  role: string;
  org: { name: string; slug: string };
};

export function InviteAccept() {
  const { user, loading, refresh } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    setToken(t);
    if (!t) {
      setPreviewError("Missing invite token");
      return;
    }
    api<InvitePreview>(`/v1/invites/${t}`)
      .then(setPreview)
      .catch((e) => setPreviewError(e.message));
  }, []);

  async function handleAccept() {
    if (!token) return;
    setAccepting(true);
    try {
      await acceptInvite(token);
      await refresh();
      toast.success("You've joined the workspace");
      window.location.href = "/playground";
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to accept invite");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <Card className="p-8">
        <div className="mb-6 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center bg-ink text-cream">
            <Building2 className="h-6 w-6" />
          </div>
        </div>

        {previewError ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-bad">{previewError}</p>
            <Link to="/admin" className="text-sm text-flame-red underline">Go to sign in</Link>
          </div>
        ) : !preview ? (
          <div className="text-center text-sm text-muted-foreground">Loading invite…</div>
        ) : (
          <>
            <h1 className="mb-2 text-center text-lg font-medium">Join workspace</h1>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              You've been invited to <strong>{preview.org.name}</strong> as{" "}
              <Badge>{preview.role}</Badge>
            </p>
            <p className="mb-6 text-center text-xs text-muted-foreground">
              Invite for <span className="font-mono">{preview.email}</span>
            </p>

            {!user ? (
              <div>
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  Sign in or create an account with <strong>{preview.email}</strong> to accept.
                </p>
                <AuthScreen onAuthed={() => refresh()} />
              </div>
            ) : user.email.toLowerCase() !== preview.email.toLowerCase() ? (
              <div className="text-center text-sm text-bad">
                You're signed in as {user.email}, but this invite is for {preview.email}.
                <div className="mt-4">
                  <Link to="/admin" className="text-flame-red underline">Switch account</Link>
                </div>
              </div>
            ) : (
              <Button className="w-full" onClick={handleAccept} disabled={accepting}>
                <Check className="h-3 w-3" /> {accepting ? "Joining…" : "Accept invite"}
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
