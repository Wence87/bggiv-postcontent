"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, FileText, Globe2, Image as ImageIcon, Loader2, Search, Shield } from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";

const ADMIN_TOKEN_KEY = "adminToken";

type ListRow = {
  id: string;
  submissionId: string;
  productType: string;
  orderNumber: string;
  linkedOrderId: string;
  company: string;
  contactEmail: string;
  reservedSlot: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: string;
  editorialStatus: string;
  publicationStatus: string;
  reviewerAssignee: string;
  purchasedOptionsSummary: string;
  assetsSummary: string;
  hasAssets: boolean;
};

type DetailPayload = {
  role: string;
  submission: {
    id: string;
    productType: string;
    productKey: string;
    companyName: string;
    contactEmail: string;
    linkedOrderId: string | null;
    orderNumber: string | null;
    reservationMonthKey: string | null;
    reservationWeekKey: string | null;
    reservationStartsAt: string | null;
    createdAt: string;
    updatedAt: string;
    purchasedOptionsSummary: string;
    assets: { summary: string; count: number; hasAssets: boolean };
    bannerImageName: string;
    bannerImageMimeType: string;
    bannerImageSize: number;
    formData: Record<string, unknown>;
    orderContext: Record<string, unknown>;
  };
  workflow: {
    orderPaymentStatus: string;
    editorialStatus: string;
    publicationStatus: string;
    reviewerAssignee: string;
    clientVisibleNote: string;
    internalNote: string;
  };
  audit: Array<{
    id: string;
    actorRole: string;
    actorIdentifier: string | null;
    eventType: string;
    fieldName: string | null;
    fromValue: string | null;
    toValue: string | null;
    comment: string | null;
    createdAt: string;
  }>;
};

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "REJECTED" || status === "FAILED") return "destructive";
  if (status === "PUBLISHED" || status === "APPROVED" || status === "PAID") return "default";
  if (status === "CHANGES_REQUESTED" || status === "REFUNDED" || status === "ARCHIVED") return "outline";
  return "secondary";
}

function compactText(text: string, max = 44): string {
  const value = text || "-";
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function iso(value: string): string {
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

export default function AdminSubmissionsPageClient() {
  const [token, setToken] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ListRow[]>([]);
  const [role, setRole] = useState<string>("-");

  const [query, setQuery] = useState("");
  const [productType, setProductType] = useState("");
  const [editorialStatus, setEditorialStatus] = useState("");
  const [publicationStatus, setPublicationStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [company, setCompany] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [hasAssets, setHasAssets] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [reservedFrom, setReservedFrom] = useState("");
  const [reservedTo, setReservedTo] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);

  const [workflow, setWorkflow] = useState({
    orderPaymentStatus: "PAID",
    editorialStatus: "SUBMITTED",
    publicationStatus: "NOT_SCHEDULED",
    reviewerAssignee: "",
    clientVisibleNote: "",
    internalNote: "",
    comment: "",
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
    setToken(stored);
  }, []);

  const updateToken = (value: string) => {
    setToken(value);
    window.localStorage.setItem(ADMIN_TOKEN_KEY, value);
    setUnauthorized(false);
  };

  const clearToken = () => {
    setToken("");
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    setUnauthorized(false);
  };

  const adminFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const response = await fetch(url, {
        ...init,
        headers: {
          "x-admin-token": token,
          ...(init?.headers ?? {}),
        },
      });
      if (response.status === 401) {
        setUnauthorized(true);
      }
      return response;
    },
    [token]
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (productType) params.set("productType", productType);
    if (editorialStatus) params.set("editorialStatus", editorialStatus);
    if (publicationStatus) params.set("publicationStatus", publicationStatus);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (company.trim()) params.set("company", company.trim());
    if (contactEmail.trim()) params.set("contactEmail", contactEmail.trim());
    if (orderNumber.trim()) params.set("orderNumber", orderNumber.trim());
    if (reviewer.trim()) params.set("reviewer", reviewer.trim());
    if (hasAssets) params.set("hasAssets", hasAssets);
    if (createdFrom) params.set("createdFrom", createdFrom);
    if (createdTo) params.set("createdTo", createdTo);
    if (reservedFrom) params.set("reservedFrom", reservedFrom);
    if (reservedTo) params.set("reservedTo", reservedTo);
    params.set("limit", "120");
    return params.toString();
  }, [company, contactEmail, createdFrom, createdTo, editorialStatus, hasAssets, orderNumber, paymentStatus, productType, publicationStatus, query, reservedFrom, reservedTo, reviewer]);

  const refresh = useCallback(async () => {
    if (!token.trim()) return;
    setLoading(true);
    try {
      const response = await adminFetch(`/api/admin/submissions?${queryString}`);
      if (!response.ok) {
        setRows([]);
        return;
      }
      const payload = (await response.json()) as { items: ListRow[]; role: string };
      setRows(Array.isArray(payload.items) ? payload.items : []);
      setRole(payload.role || "-");
      setUnauthorized(false);
    } finally {
      setLoading(false);
    }
  }, [adminFetch, queryString, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await adminFetch(`/api/admin/submissions/${id}`);
      if (!response.ok) return;
      const payload = (await response.json()) as DetailPayload;
      setDetail(payload);
      setWorkflow({
        orderPaymentStatus: payload.workflow.orderPaymentStatus,
        editorialStatus: payload.workflow.editorialStatus,
        publicationStatus: payload.workflow.publicationStatus,
        reviewerAssignee: payload.workflow.reviewerAssignee || "",
        clientVisibleNote: payload.workflow.clientVisibleNote || "",
        internalNote: payload.workflow.internalNote || "",
        comment: "",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const saveWorkflow = async () => {
    if (!selectedId) return;
    setSavingDetail(true);
    try {
      const response = await adminFetch(`/api/admin/submissions/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflow),
      });
      if (!response.ok) return;
      await openDetail(selectedId);
      await refresh();
    } finally {
      setSavingDetail(false);
    }
  };

  const download = (path: string) => {
    if (!token) return;
    const url = `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-4">
          <BrandHeader title="Admin Back Office" subtitle="Submission operations center (one row = one purchased submission)." />
          <div className="flex items-center gap-2">
            <Input
              type="password"
              placeholder="Admin token"
              value={token}
              onChange={(event) => updateToken(event.target.value)}
              className="w-64"
            />
            <Button type="button" variant="outline" onClick={clearToken}>Clear</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            Role: <span className="font-semibold text-foreground">{role}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => download(`/api/admin/submissions/export?${queryString}`)}>
              <Download className="mr-2 h-4 w-4" />
              Export filtered CSV
            </Button>
            <Link href="./booking-tools" className={buttonVariants({ variant: "secondary" })}>
              Open legacy booking tools
            </Link>
          </div>
        </div>

        {unauthorized ? (
          <Alert variant="destructive">
            <AlertTitle>Unauthorized</AlertTitle>
            <AlertDescription>Admin token is missing or invalid.</AlertDescription>
          </Alert>
        ) : null}

        <section className="rounded-lg border bg-background p-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <Label className="mb-1 block text-xs uppercase">Quick search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Order, company, email, title" />
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Product type</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={productType} onChange={(event) => setProductType(event.target.value)}>
                <option value="">All</option>
                <option value="giveaway">Giveaway</option>
                <option value="promo">Promo</option>
                <option value="news">News</option>
                <option value="ads">Ads</option>
                <option value="sponsorship">Sponsorship</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Editorial</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={editorialStatus} onChange={(event) => setEditorialStatus(event.target.value)}>
                <option value="">All</option>
                <option value="SUBMITTED">SUBMITTED</option>
                <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                <option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Publication</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={publicationStatus} onChange={(event) => setPublicationStatus(event.target.value)}>
                <option value="">All</option>
                <option value="NOT_SCHEDULED">NOT_SCHEDULED</option>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="PUBLISHED">PUBLISHED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Payment</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
                <option value="">All</option>
                <option value="PAID">PAID</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Order #</Label>
              <Input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} placeholder="100234" />
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Company</Label>
              <Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Studio" />
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Email</Label>
              <Input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="contact@" />
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Reviewer</Label>
              <Input value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="assignee" />
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Assets</Label>
              <select className="h-10 w-full rounded-md border px-3 text-sm" value={hasAssets} onChange={(event) => setHasAssets(event.target.value)}>
                <option value="">All</option>
                <option value="true">Has assets</option>
                <option value="false">Missing assets</option>
              </select>
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Reserved from</Label>
              <Input type="date" value={reservedFrom} onChange={(event) => setReservedFrom(event.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Reserved to</Label>
              <Input type="date" value={reservedTo} onChange={(event) => setReservedTo(event.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Created from</Label>
              <Input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} />
            </div>
            <div>
              <Label className="mb-1 block text-xs uppercase">Created to</Label>
              <Input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={() => void refresh()}>Apply filters</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setProductType("");
                  setEditorialStatus("");
                  setPublicationStatus("");
                  setPaymentStatus("");
                  setCompany("");
                  setContactEmail("");
                  setOrderNumber("");
                  setReviewer("");
                  setHasAssets("");
                  setReservedFrom("");
                  setReservedTo("");
                  setCreatedFrom("");
                  setCreatedTo("");
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-background">
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submission ID</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Order #</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Reserved slot</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Editorial</TableHead>
                    <TableHead>Publication</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Purchased options</TableHead>
                    <TableHead>Assets</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{row.submissionId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.productType.toUpperCase()}</Badge>
                      </TableCell>
                      <TableCell>{row.orderNumber !== "-" ? row.orderNumber : row.linkedOrderId}</TableCell>
                      <TableCell title={row.company}>{compactText(row.company)}</TableCell>
                      <TableCell title={row.contactEmail}>{compactText(row.contactEmail, 28)}</TableCell>
                      <TableCell title={row.reservedSlot}>{compactText(row.reservedSlot, 24)}</TableCell>
                      <TableCell>{iso(row.createdAt)}</TableCell>
                      <TableCell>{iso(row.updatedAt)}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.paymentStatus)}>{row.paymentStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.editorialStatus)}>{row.editorialStatus}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.publicationStatus)}>{row.publicationStatus}</Badge>
                      </TableCell>
                      <TableCell title={row.reviewerAssignee}>{compactText(row.reviewerAssignee, 16)}</TableCell>
                      <TableCell title={row.purchasedOptionsSummary}>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          {compactText(row.purchasedOptionsSummary, 30)}
                        </div>
                      </TableCell>
                      <TableCell title={row.assetsSummary}>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ImageIcon className="h-3.5 w-3.5" />
                          {row.assetsSummary}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => void openDetail(row.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => download(`/api/admin/submissions/${row.id}/assets?mode=zip`)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => download(`/api/admin/submissions/${row.id}/export?format=package`)}>
                            <Globe2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      </div>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => (!open ? setSelectedId(null) : undefined)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Submission detail</SheetTitle>
            <SheetDescription>Order/customer info, content payload, workflow, notes, and audit trail.</SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="mt-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : null}

          {detail ? (
            <div className="mt-6 space-y-6">
              <section className="rounded-md border p-4">
                <h3 className="text-sm font-semibold uppercase">Order / customer info</h3>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <p><span className="text-muted-foreground">Order:</span> {detail.submission.orderNumber || detail.submission.linkedOrderId || "-"}</p>
                  <p><span className="text-muted-foreground">Product:</span> {detail.submission.productType.toUpperCase()}</p>
                  <p><span className="text-muted-foreground">Company:</span> {detail.submission.companyName}</p>
                  <p><span className="text-muted-foreground">Contact:</span> {detail.submission.contactEmail}</p>
                  <p><span className="text-muted-foreground">Reserved:</span> {detail.submission.reservationStartsAt || detail.submission.reservationWeekKey || detail.submission.reservationMonthKey || "-"}</p>
                  <p><span className="text-muted-foreground">Assets:</span> {detail.submission.assets.summary}</p>
                </div>
              </section>

              <section className="rounded-md border p-4">
                <h3 className="text-sm font-semibold uppercase">Workflow</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs">ORDER/PAYMENT STATUS</Label>
                    <select className="h-10 w-full rounded-md border px-3 text-sm" value={workflow.orderPaymentStatus} onChange={(event) => setWorkflow((prev) => ({ ...prev, orderPaymentStatus: event.target.value }))}>
                      <option>PAID</option>
                      <option>PENDING</option>
                      <option>FAILED</option>
                      <option>REFUNDED</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">EDITORIAL STATUS</Label>
                    <select className="h-10 w-full rounded-md border px-3 text-sm" value={workflow.editorialStatus} onChange={(event) => setWorkflow((prev) => ({ ...prev, editorialStatus: event.target.value }))}>
                      <option>SUBMITTED</option>
                      <option>UNDER_REVIEW</option>
                      <option>CHANGES_REQUESTED</option>
                      <option>APPROVED</option>
                      <option>REJECTED</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">PUBLICATION STATUS</Label>
                    <select className="h-10 w-full rounded-md border px-3 text-sm" value={workflow.publicationStatus} onChange={(event) => setWorkflow((prev) => ({ ...prev, publicationStatus: event.target.value }))}>
                      <option>NOT_SCHEDULED</option>
                      <option>SCHEDULED</option>
                      <option>PUBLISHED</option>
                      <option>ARCHIVED</option>
                    </select>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">REVIEWER / ASSIGNEE</Label>
                    <Input value={workflow.reviewerAssignee} onChange={(event) => setWorkflow((prev) => ({ ...prev, reviewerAssignee: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="mb-1 block text-xs">CLIENT-VISIBLE NOTES / FEEDBACK</Label>
                    <textarea className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={workflow.clientVisibleNote} onChange={(event) => setWorkflow((prev) => ({ ...prev, clientVisibleNote: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="mb-1 block text-xs">INTERNAL NOTES</Label>
                    <textarea className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={workflow.internalNote} onChange={(event) => setWorkflow((prev) => ({ ...prev, internalNote: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="mb-1 block text-xs">AUDIT COMMENT (OPTIONAL)</Label>
                    <Input value={workflow.comment} onChange={(event) => setWorkflow((prev) => ({ ...prev, comment: event.target.value }))} />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button onClick={() => void saveWorkflow()} disabled={savingDetail}>
                    {savingDetail ? "Saving..." : "Save workflow"}
                  </Button>
                </div>
              </section>

              <section className="rounded-md border p-4">
                <h3 className="text-sm font-semibold uppercase">Main content preview</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4" /> <span>{compactText(String(detail.submission.formData.title || "-"), 160)}</span></p>
                  <p className="flex items-start gap-2"><FileText className="mt-0.5 h-4 w-4" /> <span>{compactText(String(detail.submission.formData.body || "-"), 220)}</span></p>
                  <p className="flex items-start gap-2"><Globe2 className="mt-0.5 h-4 w-4" /> <span>{compactText(String(detail.submission.formData.short_product_description || "-"), 180)}</span></p>
                </div>
              </section>

              <section className="rounded-md border p-4">
                <h3 className="text-sm font-semibold uppercase">Audit history</h3>
                <div className="mt-3 space-y-2 text-xs">
                  {detail.audit.length === 0 ? (
                    <p className="text-muted-foreground">No events yet.</p>
                  ) : (
                    detail.audit.map((event) => (
                      <div key={event.id} className="rounded border p-2">
                        <p className="font-medium">{event.eventType} {event.fieldName ? `• ${event.fieldName}` : ""}</p>
                        <p className="text-muted-foreground">{iso(event.createdAt)} • {event.actorRole} ({event.actorIdentifier || "-"})</p>
                        {(event.fromValue || event.toValue) ? (
                          <p className="text-muted-foreground">{event.fromValue || "-"} → {event.toValue || "-"}</p>
                        ) : null}
                        {event.comment ? <p>{event.comment}</p> : null}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </main>
  );
}
