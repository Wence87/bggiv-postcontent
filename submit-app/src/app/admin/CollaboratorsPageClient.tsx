"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ADMIN_TOKEN_KEY = "adminToken";

type Collaborator = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  role: "SUPER_ADMIN" | "CONTENT_ADMIN" | "OPS_ADMIN" | "PUBLISHER" | "CLIENT_PRO";
  isActive: boolean;
  companyScope: string | null;
  _count?: { assignedSubmissionOps: number };
};

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  role: "CONTENT_ADMIN",
  companyScope: "",
};

export default function CollaboratorsPageClient() {
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Collaborator[]>([]);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const stored = window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    setToken(stored);
  }, []);

  const canCreate = useMemo(
    () => Boolean(form.firstName.trim() && form.lastName.trim() && form.displayName.trim() && form.email.trim()),
    [form]
  );

  const authHeaders = token ? ({ "x-admin-token": token } as Record<string, string>) : ({} as Record<string, string>);

  const refresh = async () => {
    const response = await fetch("/api/admin/collaborators?active=0", { headers: authHeaders });
    if (!response.ok) return;
    const payload = (await response.json()) as { items: Collaborator[] };
    setItems(payload.items || []);
  };

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token]);

  const createCollaborator = async () => {
    if (!canCreate) return;
    const response = await fetch("/api/admin/collaborators", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(form),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { plainToken?: string };
    setPlainToken(payload.plainToken ?? null);
    setForm(EMPTY_FORM);
    await refresh();
  };

  const updateCollaborator = async (id: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/admin/collaborators/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { plainToken?: string };
    if (payload.plainToken) setPlainToken(payload.plainToken);
    await refresh();
  };

  return (
    <AdminShell
      title="Collaborators"
      subtitle="Manage collaborators, roles, assignment ownership and access tokens."
      themeClassName="bg-emerald-50"
      headerBorderClassName="border-emerald-100"
      headerRight={
        <Input
          type="password"
          placeholder="Admin token"
          value={token}
          onChange={(event) => {
            const value = event.target.value;
            setToken(value);
            window.localStorage.setItem(ADMIN_TOKEN_KEY, value);
          }}
          className="w-64"
        />
      }
      contentClassName="space-y-4"
    >
        {plainToken ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
            Generated collaborator token (show once): <span className="font-mono">{plainToken}</span>
          </div>
        ) : null}

        <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase">Create collaborator</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label className="mb-1 block">First name</Label><Input value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} /></div>
            <div><Label className="mb-1 block">Last name</Label><Input value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} /></div>
            <div><Label className="mb-1 block">Display name</Label><Input value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} /></div>
            <div><Label className="mb-1 block">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} /></div>
            <div>
              <Label className="mb-1 block">Role</Label>
              <select className="h-10 w-full rounded border px-2" value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}>
                <option>SUPER_ADMIN</option>
                <option>CONTENT_ADMIN</option>
                <option>OPS_ADMIN</option>
                <option>PUBLISHER</option>
                <option>CLIENT_PRO</option>
              </select>
            </div>
            <div><Label className="mb-1 block">Company scope (optional)</Label><Input value={form.companyScope} onChange={(e) => setForm((prev) => ({ ...prev, companyScope: e.target.value }))} /></div>
          </div>
          <div className="mt-3 flex justify-end"><Button disabled={!canCreate} onClick={() => void createCollaborator()}>Create collaborator</Button></div>
        </section>

        <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase">Collaborators</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="grid gap-2 rounded border p-3 md:grid-cols-[1fr_180px_140px_120px_220px] md:items-center">
                <div>
                  <p className="font-medium">{item.displayName} ({item.firstName} {item.lastName})</p>
                  <p className="text-sm text-muted-foreground">
                    {item.email}
                    {item.companyScope ? ` • scope: ${item.companyScope}` : ""}
                    {" • "}
                    <span className="font-medium">Assigned:</span> {item._count?.assignedSubmissionOps ?? 0}
                  </p>
                </div>
                <select className="h-9 rounded border px-2" value={item.role} onChange={(e) => void updateCollaborator(item.id, { role: e.target.value })}>
                  <option>SUPER_ADMIN</option>
                  <option>CONTENT_ADMIN</option>
                  <option>OPS_ADMIN</option>
                  <option>PUBLISHER</option>
                  <option>CLIENT_PRO</option>
                </select>
                <select className="h-9 rounded border px-2" value={item.isActive ? "active" : "inactive"} onChange={(e) => void updateCollaborator(item.id, { isActive: e.target.value === "active" })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <Button variant="outline" onClick={() => void updateCollaborator(item.id, { regenerateToken: true })}>Regenerate token</Button>
                <Input value={item.companyScope ?? ""} placeholder="Company scope" onChange={(e) => void updateCollaborator(item.id, { companyScope: e.target.value })} />
              </div>
            ))}
          </div>
        </section>
    </AdminShell>
  );
}
