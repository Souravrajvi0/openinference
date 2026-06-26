import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, type OrgRole } from "@/lib/auth";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";

type Member = { id: string; email: string; role: OrgRole; created_at: string };
type Invite = { id: string; email: string; role: OrgRole; expires_at: string; created_at: string };

export function Members() {
  const { user, loading, canManage, activeOrg, orgRole, refresh } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [lastLink, setLastLink] = useState<string | null>(null);

  const tenantId = activeOrg?.id;

  const load = () => {
    if (!tenantId) return;
    api<{ data: Member[] }>(`/v1/orgs/${tenantId}/members`).then((r) => setMembers(r.data)).catch((e) => toast.error(e.message));
    api<{ data: Invite[] }>(`/v1/orgs/${tenantId}/invites`).then((r) => setInvites(r.data)).catch((e) => toast.error(e.message));
  };

  useEffect(() => {
    if (canManage && tenantId) load();
  }, [canManage, tenantId]);

  if (loading) {
    return <div className="px-6 py-20 text-center text-sm text-muted-foreground">Checking session…</div>;
  }

  if (!user) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="mb-4 text-sm text-muted-foreground">Sign in to manage workspace members.</p>
        <Link to="/admin" className="text-sm text-flame-red underline">Sign in</Link>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-6 py-20 text-center text-sm text-muted-foreground">
        Only workspace owners and admins can manage members.
      </div>
    );
  }

  async function createInvite() {
    if (!tenantId || !email.trim()) return toast.error("Email required");
    try {
      const r = await api<{ accept_url: string }>(`/v1/orgs/${tenantId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setLastLink(r.accept_url);
      setInviting(false);
      setEmail("");
      setRole("member");
      toast.success("Invite created — copy the link");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create invite");
    }
  }

  async function changeRole(userId: string, newRole: OrgRole) {
    if (!tenantId || orgRole !== "owner") return;
    try {
      await api(`/v1/orgs/${tenantId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      toast.success("Role updated");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    }
  }

  async function removeMember(userId: string) {
    if (!tenantId || !window.confirm("Remove this member from the workspace?")) return;
    try {
      await api(`/v1/orgs/${tenantId}/members/${userId}`, { method: "DELETE" });
      toast.success("Member removed");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!tenantId) return;
    try {
      await api(`/v1/orgs/${tenantId}/invites/${inviteId}`, { method: "DELETE" });
      toast.success("Invite revoked");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke invite");
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium">Members</h1>
          <p className="text-sm text-muted-foreground">{activeOrg?.name ?? "Workspace"}</p>
        </div>
        <Button onClick={() => setInviting(true)}><UserPlus className="h-3 w-3" /> Invite</Button>
      </div>

      {lastLink && (
        <div className="mb-4 border border-flame-red/40 bg-flame-red/5 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.15em] text-flame-red">Invite link — copy and send manually</div>
          <div className="flex items-center gap-2">
            <code className="mono min-w-0 flex-1 break-all border border-flame-red/30 bg-surface px-2 py-1 text-xs">{lastLink}</code>
            <Button onClick={() => { navigator.clipboard?.writeText(lastLink); toast.success("Copied"); }}><Copy className="h-3 w-3" /></Button>
          </div>
        </div>
      )}

      <Card className="mb-6 p-5">
        <h3 className="mb-4 text-sm font-medium">Team members</h3>
        {!members ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : members.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No members yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  <th className="py-2 pr-3 font-normal">Email</th>
                  <th className="py-2 pr-3 font-normal">Role</th>
                  <th className="py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3">{m.email}</td>
                    <td className="py-2 pr-3">
                      {orgRole === "owner" && m.id !== user.id ? (
                        <Select
                          className="text-xs"
                          value={m.role}
                          onChange={(e) => changeRole(m.id, e.target.value as OrgRole)}
                        >
                          <option value="member">member</option>
                          <option value="admin">admin</option>
                          <option value="owner">owner</option>
                        </Select>
                      ) : (
                        <Badge>{m.role}</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {m.id !== user.id && (
                        <Button variant="danger" onClick={() => removeMember(m.id)}><Trash2 className="h-3 w-3" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 text-sm font-medium">Pending invites</h3>
        {!invites ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : invites.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No pending invites.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between border border-border p-3">
                <span>
                  {i.email} <Badge className="ml-2">{i.role}</Badge>
                </span>
                <Button variant="outline" onClick={() => revokeInvite(i.id)}>Revoke</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={inviting} onClose={() => setInviting(false)} title="Invite member">
        <div className="mb-3">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@company.com" />
        </div>
        <div className="mb-5">
          <Label>Role</Label>
          <Select className="w-full" value={role} onChange={(e) => setRole(e.target.value as OrgRole)}>
            <option value="member">Member — use playground, read traces</option>
            <option value="admin">Admin — manage keys, docs, members</option>
            {orgRole === "owner" && <option value="owner">Owner — billing & full control</option>}
          </Select>
        </div>
        <Button className="w-full" onClick={createInvite}>Create invite link</Button>
      </Modal>
    </div>
  );
}
