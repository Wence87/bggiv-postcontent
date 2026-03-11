"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildAdminSectionHref } from "@/lib/adminRoutes";

const ADMIN_TOKEN_KEY = "adminToken";

type Collaborator = {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  role: "SUPER_ADMIN" | "CONTENT_ADMIN" | "OPS_ADMIN";
  isActive: boolean;
  lastLoginAt: string | null;
  metrics: {
    assigned: number;
    untouched: number;
    inProgress: number;
    publishedClosed: number;
    urgency: { green: number; yellow: number; orange: number; red: number };
  };
};

type CollaboratorDetail = {
  collaborator: {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    email: string;
    role: "SUPER_ADMIN" | "CONTENT_ADMIN" | "OPS_ADMIN";
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  metrics: Collaborator["metrics"];
  assignments: Array<{
    submissionId: string;
    orderNumber: string;
    productType: string;
    company: string;
    editorialStatus: string;
    publicationStatus: string;
    pendingAction: { label: string; owner: "ADMIN" | "CLIENT" | "OPS" };
    urgency: { label: string; bucket: "green" | "yellow" | "orange" | "red"; minutes: number };
    createdAt: string;
    updatedAt: string;
  }>;
};

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  role: "CONTENT_ADMIN",
};

function iso(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function urgencyBadge(bucket: "green" | "yellow" | "orange" | "red") {
  if (bucket === "green") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (bucket === "yellow") return "bg-amber-100 text-amber-800 border-amber-200";
  if (bucket === "orange") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function productLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "promo") return "Promodeal";
  if (normalized === "giveaway") return "Giveaway";
  if (normalized === "news") return "News";
  if (normalized === "ads") return "Ads";
  if (normalized === "sponsorship") return "Sponsorship";
  return value.toUpperCase();
}

export default function CollaboratorsPageClient() {
  const pathname = usePathname();
  const [token, setToken] = useState("");
  const [items, setItems] = useState<Collaborator[]>([]);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [tokenFeedback, setTokenFeedback] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CollaboratorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    setToken(stored);
  }, []);

  const canCreate = useMemo(
    () => Boolean(form.firstName.trim() && form.lastName.trim() && form.displayName.trim() && form.email.trim()),
    [form]
  );

  const authHeaders = token ? ({ "x-admin-token": token } as Record<string, string>) : ({} as Record<string, string>);

  const submissionsHref = useMemo(() => buildAdminSectionHref(pathname, "submissions"), [pathname]);

  const refresh = async () => {
    const response = await fetch("/api/admin/collaborators?active=0", { headers: authHeaders });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      setError(payload.message || payload.code || "Unable to load collaborators.");
      return;
    }
    const payload = (await response.json()) as { items: Collaborator[] };
    setItems(payload.items || []);
    setError(null);
  };

  useEffect(() => {
    if (!token) return;
    void refresh();
  }, [token]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    const response = await fetch(`/api/admin/collaborators/${id}`, { headers: authHeaders });
    if (!response.ok) {
      setDetailLoading(false);
      return;
    }
    const payload = (await response.json()) as CollaboratorDetail;
    setDetail(payload);
    setDetailLoading(false);
  };

  const createCollaborator = async () => {
    if (!canCreate) return;
    const response = await fetch("/api/admin/collaborators", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      setError(payload.message || payload.code || "Create collaborator failed.");
      return;
    }
    const payload = (await response.json()) as { plainToken?: string };
    setPlainToken(payload.plainToken ?? null);
    setTokenFeedback(null);
    setForm(EMPTY_FORM);
    setError(null);
    await refresh();
  };

  const updateCollaborator = async (id: string, patch: Record<string, unknown>) => {
    const response = await fetch(`/api/admin/collaborators/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      setError(payload.message || payload.code || "Update collaborator failed.");
      return;
    }
    const payload = (await response.json()) as { plainToken?: string };
    setError(null);
    await refresh();
    if (selectedId === id) {
      await openDetail(id);
    }
    return payload.plainToken ?? null;
  };

  const regenerateAndCopyToken = async (id: string) => {
    const tokenValue = await updateCollaborator(id, { regenerateToken: true });
    if (!tokenValue) {
      setTokenFeedback("Token regeneration failed.");
      return;
    }
    try {
      await navigator.clipboard.writeText(tokenValue);
      setTokenFeedback("Token regenerated and copied.");
    } catch {
      setTokenFeedback("Token regenerated. Copy to clipboard failed.");
      setPlainToken(tokenValue);
    }
  };

  return (
    <AdminShell
      title="Collaborators"
      subtitle="Internal team module for assignment, workload and urgency tracking."
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

      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {tokenFeedback ? <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-700">{tokenFeedback}</div> : null}

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
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end"><Button disabled={!canCreate} onClick={() => void createCollaborator()}>Create collaborator</Button></div>
      </section>

      <section className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase">Collaborators</h2>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display</TableHead>
                <TableHead>First</TableHead>
                <TableHead>Last</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Untouched</TableHead>
                <TableHead>In progress</TableHead>
                <TableHead>Published/closed</TableHead>
                <TableHead>Urgency</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.displayName}</TableCell>
                  <TableCell>{item.firstName}</TableCell>
                  <TableCell>{item.lastName}</TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>
                    <select className="h-8 rounded border px-2 text-xs" value={item.role} onChange={(e) => void updateCollaborator(item.id, { role: e.target.value })}>
                      <option>SUPER_ADMIN</option>
                      <option>CONTENT_ADMIN</option>
                      <option>OPS_ADMIN</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <select className="h-8 rounded border px-2 text-xs" value={item.isActive ? "active" : "inactive"} onChange={(e) => void updateCollaborator(item.id, { isActive: e.target.value === "active" })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </TableCell>
                  <TableCell>{iso(item.lastLoginAt)}</TableCell>
                  <TableCell>{item.metrics.assigned}</TableCell>
                  <TableCell>{item.metrics.untouched}</TableCell>
                  <TableCell>{item.metrics.inProgress}</TableCell>
                  <TableCell>{item.metrics.publishedClosed}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 text-[11px]">
                      <span className="rounded border border-emerald-200 bg-emerald-50 px-1">G {item.metrics.urgency.green}</span>
                      <span className="rounded border border-amber-200 bg-amber-50 px-1">Y {item.metrics.urgency.yellow}</span>
                      <span className="rounded border border-orange-200 bg-orange-50 px-1">O {item.metrics.urgency.orange}</span>
                      <span className="rounded border border-red-200 bg-red-50 px-1">R {item.metrics.urgency.red}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void openDetail(item.id)}>View</Button>
                      <Button variant="outline" size="sm" onClick={() => void regenerateAndCopyToken(item.id)}>Regenerate + Copy token</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => (!open ? setSelectedId(null) : undefined)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Collaborator detail</SheetTitle>
            <SheetDescription>Profile, permissions and assigned submissions.</SheetDescription>
          </SheetHeader>

          {detailLoading ? <div className="mt-8 text-sm text-muted-foreground">Loading...</div> : null}

          {detail ? (
            <div className="mt-6 space-y-4">
              <section className="rounded-md border p-4 text-sm">
                <p><span className="text-muted-foreground">Display:</span> {detail.collaborator.displayName}</p>
                <p><span className="text-muted-foreground">Name:</span> {detail.collaborator.firstName} {detail.collaborator.lastName}</p>
                <p><span className="text-muted-foreground">Email:</span> {detail.collaborator.email}</p>
                <p><span className="text-muted-foreground">Role:</span> {detail.collaborator.role}</p>
                <p><span className="text-muted-foreground">Last login:</span> {iso(detail.collaborator.lastLoginAt)}</p>
              </section>

              <section className="rounded-md border p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase">Assigned submissions</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Submission</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Editorial</TableHead>
                        <TableHead>Publication</TableHead>
                        <TableHead>Pending action</TableHead>
                        <TableHead>Urgency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.assignments.map((row) => (
                        <TableRow key={row.submissionId}>
                          <TableCell>
                            {submissionsHref ? (
                              <Link href={`${submissionsHref}?openSubmissionId=${encodeURIComponent(row.submissionId)}`} className="text-blue-700 hover:underline">
                                {row.submissionId.slice(0, 8)}...
                              </Link>
                            ) : (
                              `${row.submissionId.slice(0, 8)}...`
                            )}
                          </TableCell>
                          <TableCell>{row.orderNumber}</TableCell>
                          <TableCell>{productLabel(row.productType)}</TableCell>
                          <TableCell>{row.company}</TableCell>
                          <TableCell>{row.editorialStatus}</TableCell>
                          <TableCell>{row.publicationStatus}</TableCell>
                          <TableCell>{row.pendingAction.label} ({row.pendingAction.owner})</TableCell>
                          <TableCell>
                            <Badge className={`border ${urgencyBadge(row.urgency.bucket)}`} variant="outline">{row.urgency.label}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}
