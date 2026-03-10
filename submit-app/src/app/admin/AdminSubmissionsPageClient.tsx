"use client";

import Link from "next/link";
import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  Download,
  Eye,
  FileQuestion,
  FileText,
  Globe2,
  Image as ImageIcon,
  Link2,
  Loader2,
  MapPinned,
  Search,
  Shield,
  Tag,
} from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  previews: {
    title: string;
    shortDescription: string;
    body: string;
    quiz: string;
    shipping: string;
    audienceAmplifier: string;
  };
};

type DetailPayload = {
  role: string;
  permissions: {
    canUpdateEditorial: boolean;
    canUpdatePublication: boolean;
    canUpdatePayment: boolean;
    canUpdateNotes: boolean;
  };
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

function statusClass(group: "payment" | "editorial" | "publication", status: string): string {
  if (group === "editorial") {
    if (status === "SUBMITTED") return "bg-slate-100 text-slate-700 border-slate-200";
    if (status === "UNDER_REVIEW") return "bg-blue-100 text-blue-800 border-blue-200";
    if (status === "CHANGES_REQUESTED") return "bg-amber-100 text-amber-800 border-amber-200";
    if (status === "APPROVED") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (group === "publication") {
    if (status === "NOT_SCHEDULED") return "bg-slate-100 text-slate-700 border-slate-200";
    if (status === "SCHEDULED") return "bg-violet-100 text-violet-800 border-violet-200";
    if (status === "PUBLISHED") return "bg-emerald-100 text-emerald-800 border-emerald-200";
    return "bg-transparent text-slate-600 border-slate-300";
  }
  if (status === "PAID") return "bg-emerald-700 text-white border-emerald-700";
  if (status === "PENDING") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "FAILED") return "bg-red-100 text-red-800 border-red-200";
  return "bg-transparent text-slate-600 border-slate-300";
}

function statusPill(group: "payment" | "editorial" | "publication", status: string) {
  return <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${statusClass(group, status)}`}>{status}</span>;
}

function getString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  return typeof value === "string" && value.trim() ? value.trim() : "-";
}

function getStringList(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function summarizeAudienceAmplifier(formData: Record<string, unknown>): string {
  const raw = formData.audience_amplifier_actions;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "Not configured";
  const actionMap = raw as Record<string, unknown>;
  const labels: string[] = [];
  for (const [key, value] of Object.entries(actionMap)) {
    if (typeof value === "string" && value.trim()) {
      labels.push(`${key}: ${value}`);
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => typeof nestedValue === "string" && nestedValue.trim().length > 0)
        .map(([nestedKey, nestedValue]) => `${key}.${nestedKey}: ${nestedValue as string}`);
      labels.push(...nested);
    }
  }
  return labels.length ? labels.join("\n") : "Not configured";
}

function PreviewHint({ label, text, Icon }: { label: string; text: string; Icon: ComponentType<{ className?: string }> }) {
  return (
    <span className="inline-flex items-center rounded border px-1.5 py-1 text-[11px] text-muted-foreground" title={`${label}: ${text || "-"}`}>
      <Icon className="h-3 w-3" />
    </span>
  );
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
      if (response.status === 401) setUnauthorized(true);
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
  }, [query, productType, editorialStatus, publicationStatus, paymentStatus, company, contactEmail, orderNumber, reviewer, hasAssets, createdFrom, createdTo, reservedFrom, reservedTo]);

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
  }, [token, adminFetch, queryString]);

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

  const roleCanEdit = useMemo(() => {
    const isSuper = role === "SUPER_ADMIN";
    const isContent = role === "CONTENT_ADMIN";
    const isOps = role === "OPS_ADMIN";
    return {
      canUpdatePayment: isSuper,
      canUpdateEditorial: isSuper || isContent,
      canUpdatePublication: isSuper || isOps,
      canUpdateNotes: isSuper || isContent || isOps,
      canSeeInternalNotes: role !== "PUBLISHER" && role !== "CLIENT_PRO",
    };
  }, [role]);

  const detailPermissions = detail?.permissions ?? {
    canUpdatePayment: roleCanEdit.canUpdatePayment,
    canUpdateEditorial: roleCanEdit.canUpdateEditorial,
    canUpdatePublication: roleCanEdit.canUpdatePublication,
    canUpdateNotes: roleCanEdit.canUpdateNotes,
  };

  const formData = detail?.submission.formData ?? {};
  const shipping = getStringList(formData, "shipping_countries");
  const quizFields = [
    ["Question", getString(formData, "giveaway_question")],
    ["Correct", getString(formData, "answer_correct")],
    ["Wrong #1", getString(formData, "answer_wrong_1")],
    ["Wrong #2", getString(formData, "answer_wrong_2")],
    ["Wrong #3", getString(formData, "answer_wrong_3")],
    ["Wrong #4", getString(formData, "answer_wrong_4")],
  ] as const;

  return (
    <main className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-6 py-4">
          <BrandHeader title="Admin Back Office" subtitle="Submission operations center (one row = one purchased submission)." />
          <div className="flex items-center gap-2">
            <Input type="password" placeholder="Admin token" value={token} onChange={(event) => updateToken(event.target.value)} className="w-64" />
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
            <div className="flex min-h-[220px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
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
                      <TableCell className="font-mono text-xs">{compactText(row.submissionId, 20)}</TableCell>
                      <TableCell><Badge variant="outline">{row.productType.toUpperCase()}</Badge></TableCell>
                      <TableCell>{row.orderNumber !== "-" ? row.orderNumber : row.linkedOrderId}</TableCell>
                      <TableCell title={row.company}>{compactText(row.company)}</TableCell>
                      <TableCell title={row.contactEmail}>{compactText(row.contactEmail, 24)}</TableCell>
                      <TableCell title={row.reservedSlot}>{compactText(row.reservedSlot, 20)}</TableCell>
                      <TableCell>{iso(row.createdAt)}</TableCell>
                      <TableCell>{iso(row.updatedAt)}</TableCell>
                      <TableCell>{statusPill("payment", row.paymentStatus)}</TableCell>
                      <TableCell>{statusPill("editorial", row.editorialStatus)}</TableCell>
                      <TableCell>{statusPill("publication", row.publicationStatus)}</TableCell>
                      <TableCell title={row.reviewerAssignee}>{compactText(row.reviewerAssignee, 14)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground" title={row.purchasedOptionsSummary}>
                            <FileText className="h-3.5 w-3.5" />
                            {compactText(row.purchasedOptionsSummary, 28)}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <PreviewHint label="Title" text={row.previews.title} Icon={Tag} />
                            <PreviewHint label="Short description" text={row.previews.shortDescription} Icon={FileText} />
                            <PreviewHint label="Body" text={row.previews.body} Icon={AlignLeft} />
                            <PreviewHint label="Quiz" text={row.previews.quiz} Icon={FileQuestion} />
                            <PreviewHint label="Shipping" text={row.previews.shipping} Icon={MapPinned} />
                            <PreviewHint label="Audience Amplifier" text={row.previews.audienceAmplifier} Icon={Link2} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground" title={row.assetsSummary}>
                          <ImageIcon className="h-3.5 w-3.5" />
                          {row.assetsSummary}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => void openDetail(row.id)} title="View detail" aria-label="View detail">
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">View</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => download(`/api/admin/submissions/${row.id}/assets?mode=zip`)} title="Download assets ZIP" aria-label="Download assets ZIP">
                            <Download className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">Assets</span>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => download(`/api/admin/submissions/${row.id}/export?format=package`)} title="Export submission package" aria-label="Export submission package">
                            <Globe2 className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">Package</span>
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
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader>
            <SheetTitle>Submission detail</SheetTitle>
            <SheetDescription>Order/customer info, workflow, client submission data, and audit history.</SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="mt-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
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
                  {detailPermissions.canUpdatePayment ? (
                    <div>
                      <Label className="mb-1 block text-xs">ORDER/PAYMENT STATUS</Label>
                      <select className="h-10 w-full rounded-md border px-3 text-sm" value={workflow.orderPaymentStatus} onChange={(event) => setWorkflow((prev) => ({ ...prev, orderPaymentStatus: event.target.value }))}>
                        <option>PAID</option><option>PENDING</option><option>FAILED</option><option>REFUNDED</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <Label className="mb-1 block text-xs">ORDER/PAYMENT STATUS</Label>
                      <div>{statusPill("payment", workflow.orderPaymentStatus)}</div>
                    </div>
                  )}

                  {detailPermissions.canUpdateEditorial ? (
                    <div>
                      <Label className="mb-1 block text-xs">EDITORIAL STATUS</Label>
                      <select className="h-10 w-full rounded-md border px-3 text-sm" value={workflow.editorialStatus} onChange={(event) => setWorkflow((prev) => ({ ...prev, editorialStatus: event.target.value }))}>
                        <option>SUBMITTED</option><option>UNDER_REVIEW</option><option>CHANGES_REQUESTED</option><option>APPROVED</option><option>REJECTED</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <Label className="mb-1 block text-xs">EDITORIAL STATUS</Label>
                      <div>{statusPill("editorial", workflow.editorialStatus)}</div>
                    </div>
                  )}

                  {detailPermissions.canUpdatePublication ? (
                    <div>
                      <Label className="mb-1 block text-xs">PUBLICATION STATUS</Label>
                      <select className="h-10 w-full rounded-md border px-3 text-sm" value={workflow.publicationStatus} onChange={(event) => setWorkflow((prev) => ({ ...prev, publicationStatus: event.target.value }))}>
                        <option>NOT_SCHEDULED</option><option>SCHEDULED</option><option>PUBLISHED</option><option>ARCHIVED</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <Label className="mb-1 block text-xs">PUBLICATION STATUS</Label>
                      <div>{statusPill("publication", workflow.publicationStatus)}</div>
                    </div>
                  )}

                  <div>
                    <Label className="mb-1 block text-xs">REVIEWER / ASSIGNEE</Label>
                    <Input disabled={!detailPermissions.canUpdateNotes} value={workflow.reviewerAssignee} onChange={(event) => setWorkflow((prev) => ({ ...prev, reviewerAssignee: event.target.value }))} />
                  </div>

                  <div className="md:col-span-2">
                    <Label className="mb-1 block text-xs">CLIENT-VISIBLE NOTES / FEEDBACK</Label>
                    <textarea disabled={!detailPermissions.canUpdateNotes} className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={workflow.clientVisibleNote} onChange={(event) => setWorkflow((prev) => ({ ...prev, clientVisibleNote: event.target.value }))} />
                  </div>

                  {roleCanEdit.canSeeInternalNotes ? (
                    <div className="md:col-span-2">
                      <Label className="mb-1 block text-xs">INTERNAL NOTES</Label>
                      <textarea disabled={!detailPermissions.canUpdateNotes} className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={workflow.internalNote} onChange={(event) => setWorkflow((prev) => ({ ...prev, internalNote: event.target.value }))} />
                    </div>
                  ) : null}

                  {detailPermissions.canUpdateNotes || detailPermissions.canUpdateEditorial || detailPermissions.canUpdatePublication || detailPermissions.canUpdatePayment ? (
                    <div className="md:col-span-2">
                      <Label className="mb-1 block text-xs">AUDIT COMMENT (OPTIONAL)</Label>
                      <Input value={workflow.comment} onChange={(event) => setWorkflow((prev) => ({ ...prev, comment: event.target.value }))} />
                    </div>
                  ) : null}
                </div>
                {detailPermissions.canUpdateNotes || detailPermissions.canUpdateEditorial || detailPermissions.canUpdatePublication || detailPermissions.canUpdatePayment ? (
                  <div className="mt-3 flex justify-end">
                    <Button onClick={() => void saveWorkflow()} disabled={savingDetail}>{savingDetail ? "Saving..." : "Save workflow"}</Button>
                  </div>
                ) : null}
              </section>

              <section className="rounded-md border p-4">
                <h3 className="text-sm font-semibold uppercase">Client submission data</h3>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="rounded border p-3">
                    <p className="text-xs uppercase text-muted-foreground">Title</p>
                    <p>{getString(formData, "title")}</p>
                  </div>
                  <div className="rounded border p-3">
                    <p className="text-xs uppercase text-muted-foreground">Short product description</p>
                    <p className="whitespace-pre-wrap">{getString(formData, "short_product_description")}</p>
                  </div>
                  <div className="rounded border p-3">
                    <p className="text-xs uppercase text-muted-foreground">Body</p>
                    <p className="whitespace-pre-wrap">{getString(formData, "body")}</p>
                  </div>
                  <div className="rounded border p-3">
                    <p className="text-xs uppercase text-muted-foreground">Notes to admin</p>
                    <p className="whitespace-pre-wrap">{getString(formData, "notes")}</p>
                  </div>

                  {detail.submission.productType === "giveaway" ? (
                    <>
                      <div className="rounded border p-3">
                        <p className="text-xs uppercase text-muted-foreground">Giveaway details</p>
                        <div className="grid gap-1 md:grid-cols-2">
                          <p>Prize: {getString(formData, "prize_name")}</p>
                          <p>Category: {getString(formData, "giveaway_category")}</p>
                          <p>Units: {getString(formData, "prize_units_count")}</p>
                          <p>Unit value (USD): {getString(formData, "prize_unit_value_usd")}</p>
                        </div>
                      </div>
                      <div className="rounded border p-3">
                        <p className="text-xs uppercase text-muted-foreground">Quiz question and answers</p>
                        <div className="grid gap-1">
                          {quizFields.map(([label, value]) => (
                            <p key={label}><span className="text-muted-foreground">{label}:</span> {value}</p>
                          ))}
                        </div>
                      </div>
                      <div className="rounded border p-3">
                        <p className="text-xs uppercase text-muted-foreground">Shipping configuration</p>
                        <p>{shipping.length ? shipping.join(", ") : "-"}</p>
                      </div>
                      <div className="rounded border p-3">
                        <p className="text-xs uppercase text-muted-foreground">Audience Amplifier configuration</p>
                        <pre className="whitespace-pre-wrap text-xs">{summarizeAudienceAmplifier(formData)}</pre>
                      </div>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="rounded-md border p-4">
                <h3 className="text-sm font-semibold uppercase">Audit history</h3>
                <div className="mt-3 space-y-2 text-xs">
                  {detail.audit.length === 0 ? (
                    <p className="text-muted-foreground">No events yet.</p>
                  ) : (
                    detail.audit.map((event) => (
                      <div key={event.id} className="rounded border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{event.eventType}{event.fieldName ? ` • ${event.fieldName}` : ""}</p>
                          <p className="text-muted-foreground">{iso(event.createdAt)}</p>
                        </div>
                        <p className="text-muted-foreground">Actor: {event.actorRole} ({event.actorIdentifier || "-"})</p>
                        <p className="text-muted-foreground">Change: {event.fromValue || "-"} → {event.toValue || "-"}</p>
                        {event.comment ? <p className="mt-1">Comment: {event.comment}</p> : null}
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
