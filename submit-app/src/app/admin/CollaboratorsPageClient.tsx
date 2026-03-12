"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Trash2 } from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SubmissionDetailSheet, type SubmissionDetailPayload, type SubmissionWorkflowForm } from "@/components/admin/SubmissionDetailSheet";

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

type SubmissionDetail = SubmissionDetailPayload;

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

function editorialBadgeClass(status: string): string {
  if (status === "RESUBMITTED") return "bg-red-100 text-red-800 border-red-200";
  if (status === "SUBMITTED") return "bg-slate-100 text-slate-700 border-slate-200";
  if (status === "UNDER_REVIEW") return "bg-blue-100 text-blue-800 border-blue-200";
  if (status === "CHANGES_REQUESTED") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "APPROVED") return "bg-emerald-100 text-emerald-800 border-emerald-200";
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

function compactText(value: string, max = 25): string {
  if (!value) return "-";
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}

export default function CollaboratorsPageClient() {
  const [token, setToken] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [items, setItems] = useState<Collaborator[]>([]);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [tokenFeedback, setTokenFeedback] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CollaboratorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Collaborator | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<SubmissionDetail | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [savingSubmission, setSavingSubmission] = useState(false);
  const [submissionWorkflow, setSubmissionWorkflow] = useState<SubmissionWorkflowForm>({
    orderPaymentStatus: "PAID",
    editorialStatus: "SUBMITTED",
    publicationStatus: "NOT_SCHEDULED",
    reviewerAssignee: "",
    reviewerCollaboratorId: "",
    clientVisibleNote: "",
    internalNote: "",
    clientMessage: "",
    requestClientChanges: false,
  });

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
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      setError(payload.message || payload.code || "Unable to load collaborators.");
      return;
    }
    const payload = (await response.json()) as { items: Collaborator[]; role?: string };
    setItems(payload.items || []);
    setViewerRole(payload.role || "");
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

  const openSubmissionDetail = async (submissionId: string) => {
    setSelectedSubmissionId(submissionId);
    setSubmissionDetail(null);
    setSubmissionLoading(true);
    const response = await fetch(`/api/admin/submissions/${submissionId}`, { headers: authHeaders });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      setError(payload.message || payload.code || "Unable to load submission detail.");
      setSubmissionLoading(false);
      return;
    }
    const payload = (await response.json()) as SubmissionDetail;
    setSubmissionDetail(payload);
    setSubmissionWorkflow({
      orderPaymentStatus: payload.workflow.orderPaymentStatus,
      editorialStatus: payload.workflow.editorialStatus,
      publicationStatus: payload.workflow.publicationStatus,
      reviewerAssignee: payload.workflow.reviewerAssignee || "",
      reviewerCollaboratorId: payload.workflow.reviewerCollaboratorId || "",
      clientVisibleNote: payload.workflow.clientVisibleNote || "",
      internalNote: payload.workflow.internalNote || "",
      clientMessage: "",
      requestClientChanges: false,
    });
    setSubmissionLoading(false);
  };

  const saveSubmissionWorkflow = async () => {
    if (!selectedSubmissionId) return;
    setSavingSubmission(true);
    try {
      const response = await fetch(`/api/admin/submissions/${selectedSubmissionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(submissionWorkflow),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
        setError(payload.message || payload.code || "Unable to save submission workflow.");
        return;
      }
      await openSubmissionDetail(selectedSubmissionId);
      if (selectedId) {
        await openDetail(selectedId);
      }
    } finally {
      setSavingSubmission(false);
    }
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
      return null;
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

  const deleteCollaborator = async () => {
    if (!deleteTarget || deleteConfirmText !== "DELETE") return;
    setDeleteLoading(true);
    try {
      const response = await fetch(`/api/admin/collaborators/${deleteTarget.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string; code?: string };
      if (!response.ok) {
        setError(payload.message || payload.code || "Delete collaborator failed.");
        return;
      }
      setError(null);
      setTokenFeedback(`Collaborator deleted: ${deleteTarget.displayName}`);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
        setDetail(null);
      }
      setDeleteTarget(null);
      setDeleteConfirmText("");
      await refresh();
    } finally {
      setDeleteLoading(false);
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
                <TableHead className="w-10">View</TableHead>
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
                  <TableCell className="align-middle">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title="View collaborator detail"
                      aria-label="View collaborator detail"
                      onClick={() => void openDetail(item.id)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
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
                      <Button variant="outline" size="sm" title="Regenerate and copy token" aria-label="Regenerate and copy token" onClick={() => void regenerateAndCopyToken(item.id)}>Regenerate + Copy token</Button>
                      {viewerRole === "SUPER_ADMIN" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-700"
                          title="Delete collaborator"
                          aria-label="Delete collaborator"
                          onClick={() => {
                            setDeleteTarget(item);
                            setDeleteConfirmText("");
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => (!open ? setSelectedId(null) : undefined)}>
        <SheetContent side="right" className="w-full overflow-y-auto border-emerald-200 bg-emerald-50 sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Collaborator detail</SheetTitle>
            <SheetDescription>Profile, permissions and assigned submissions.</SheetDescription>
          </SheetHeader>

          {detailLoading ? <div className="mt-8 text-sm text-muted-foreground">Loading...</div> : null}

          {detail ? (
            <div className="mt-6 space-y-4">
              <section className="rounded-md border border-slate-300 bg-white p-4 text-sm shadow-sm">
                <p><span className="text-muted-foreground">Display:</span> {detail.collaborator.displayName}</p>
                <p><span className="text-muted-foreground">Name:</span> {detail.collaborator.firstName} {detail.collaborator.lastName}</p>
                <p><span className="text-muted-foreground">Email:</span> {detail.collaborator.email}</p>
                <p><span className="text-muted-foreground">Role:</span> {detail.collaborator.role}</p>
                <p><span className="text-muted-foreground">Last login:</span> {iso(detail.collaborator.lastLoginAt)}</p>
              </section>

              <section className="rounded-md border border-slate-300 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-semibold uppercase">Assigned submissions</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>View</TableHead>
                        <TableHead>Urgency</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="whitespace-nowrap">Company</TableHead>
                        <TableHead>Editorial</TableHead>
                        <TableHead>Publication</TableHead>
                        <TableHead className="whitespace-nowrap">Pending action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.assignments.map((row) => (
                        <TableRow key={row.submissionId}>
                          <TableCell>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Open submission detail"
                              aria-label="Open submission detail"
                              onClick={() => void openSubmissionDetail(row.submissionId)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Badge className={`border ${urgencyBadge(row.urgency.bucket)}`} variant="outline">{row.urgency.label}</Badge>
                          </TableCell>
                          <TableCell>{row.orderNumber}</TableCell>
                          <TableCell>{productLabel(row.productType)}</TableCell>
                          <TableCell className="max-w-[260px] whitespace-nowrap" title={row.company}>{compactText(row.company, 25)}</TableCell>
                          <TableCell>
                            <Badge className={`border ${editorialBadgeClass(row.editorialStatus)}`} variant="outline">
                              {row.editorialStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>{row.publicationStatus}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <div
                              className="text-sm leading-5"
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                              title={`${row.pendingAction.label} (${row.pendingAction.owner})`}
                            >
                              {row.pendingAction.label} ({row.pendingAction.owner})
                            </div>
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

      <SubmissionDetailSheet
        open={Boolean(selectedSubmissionId)}
        onOpenChange={(open) => (!open ? setSelectedSubmissionId(null) : undefined)}
        loading={submissionLoading}
        detail={submissionDetail}
        workflow={submissionWorkflow}
        setWorkflow={setSubmissionWorkflow}
        saving={savingSubmission}
        onSave={() => void saveSubmissionWorkflow()}
        canSeeInternalNotes={viewerRole !== "PUBLISHER" && viewerRole !== "CLIENT_PRO"}
        contextSubtitle={`Opened from collaborator: ${detail?.collaborator.displayName ?? "-"}`}
        themeVariant="submissions"
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete collaborator</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this collaborator? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Collaborator: <span className="font-semibold">{deleteTarget?.displayName ?? "-"}</span>
            </p>
            <div>
              <Label className="mb-1 block">Type DELETE to confirm</Label>
              <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" disabled={deleteConfirmText !== "DELETE" || deleteLoading} onClick={() => void deleteCollaborator()}>
              {deleteLoading ? "Deleting..." : "Delete collaborator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
