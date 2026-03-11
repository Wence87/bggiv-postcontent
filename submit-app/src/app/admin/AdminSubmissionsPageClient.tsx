"use client";

import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock3,
  Download,
  Eye,
  FileText,
  Funnel,
  Image as ImageIcon,
  Images,
  Loader2,
  Mail,
  Megaphone,
  Package,
  PanelRight,
  Pin,
  Search,
  Shield,
  Sparkles,
  Video,
} from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  totalPaid: string;
  vatPaid: string;
  editorialStatus: string;
  publicationStatus: string;
  reviewerAssignee: string;
  purchasedOptionsSummary: string;
  assetsSummary: string;
  hasAssets: boolean;
  orderedOptionKeys: string[];
  orderedOptionValues: Record<string, string>;
  previews: {
    title: string;
    shortDescription: string;
    body: string;
    notes: string;
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
    reviewerCollaboratorId: string;
    clientVisibleNote: string;
    internalNote: string;
  };
  collaborators: Array<{
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    email: string;
    role: string;
  }>;
  pendingAction: {
    key: string;
    label: string;
    owner: "ADMIN" | "CLIENT" | "OPS";
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

type SortKey =
  | "orderNumber"
  | "urgency"
  | "productType"
  | "company"
  | "reservedSlot"
  | "createdAt"
  | "updatedAt"
  | "paymentStatus"
  | "totalPaid"
  | "vatPaid"
  | "editorialStatus"
  | "publicationStatus"
  | "reviewerAssignee"
  | "submissionId";

type SortDir = "asc" | "desc";

type PurchasedIconKey =
  | "audience_amplifier"
  | "duration"
  | "social_boost"
  | "hero_grid"
  | "sticky_post"
  | "sidebar_spotlight"
  | "extended_text_limit"
  | "additional_images"
  | "embedded_video"
  | "weekly_newsletter_feature";

type PurchasedIconItem = {
  key: PurchasedIconKey;
  label: string;
  active: boolean;
  Icon: ComponentType<{ className?: string }>;
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

function getUrgencyMinutes(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - created) / 60000));
}

function urgencyFromCreated(createdAt: string): { label: string; className: string; minutes: number } {
  const minutes = getUrgencyMinutes(createdAt);
  const label = minutes < 60 ? `${minutes}m` : minutes < 24 * 60 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / (24 * 60))}d`;

  if (minutes <= 12 * 60) return { label, className: "bg-emerald-100 text-emerald-800 border-emerald-200", minutes };
  if (minutes <= 24 * 60) return { label, className: "bg-amber-100 text-amber-800 border-amber-200", minutes };
  if (minutes <= 36 * 60) return { label, className: "bg-orange-100 text-orange-800 border-orange-200", minutes };
  return { label, className: "bg-red-100 text-red-800 border-red-200", minutes };
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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

function formatMoney(value: string): string {
  if (!value || value === "-") return "-";
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return "-";
  return amount.toFixed(2);
}

const OPTION_KEYS_BY_PRODUCT: Record<string, PurchasedIconKey[]> = {
  giveaway: [
    "audience_amplifier",
    "duration",
    "social_boost",
    "hero_grid",
    "sticky_post",
    "sidebar_spotlight",
    "extended_text_limit",
    "additional_images",
    "embedded_video",
    "weekly_newsletter_feature",
  ],
  promo: ["social_boost", "hero_grid", "sticky_post", "sidebar_spotlight", "extended_text_limit", "additional_images", "embedded_video", "weekly_newsletter_feature"],
  news: ["social_boost", "hero_grid", "sticky_post", "sidebar_spotlight", "extended_text_limit", "additional_images", "embedded_video", "weekly_newsletter_feature"],
  ads: [],
  sponsorship: [],
};

const ICON_META: Record<PurchasedIconKey, { label: string; Icon: ComponentType<{ className?: string }> }> = {
  audience_amplifier: { label: "Audience Amplifier", Icon: Sparkles },
  duration: { label: "Duration", Icon: Clock3 },
  social_boost: { label: "Social Boost", Icon: Megaphone },
  hero_grid: { label: "Hero Grid", Icon: Package },
  sticky_post: { label: "Sticky Post", Icon: Pin },
  sidebar_spotlight: { label: "Sidebar Spotlight", Icon: PanelRight },
  extended_text_limit: { label: "Extended Text", Icon: FileText },
  additional_images: { label: "Additional Images", Icon: Images },
  embedded_video: { label: "Embedded Video", Icon: Video },
  weekly_newsletter_feature: { label: "Weekly Newsletter", Icon: Mail },
};

const OPTION_KEY_CANONICAL_MAP: Record<string, PurchasedIconKey> = {
  audienceamplifier: "audience_amplifier",
  multiactionentry: "audience_amplifier",
  giveawayduration: "duration",
  duration: "duration",
  socialboost: "social_boost",
  featuredspotherogrid: "hero_grid",
  featuredspotintheherogrid: "hero_grid",
  featuredspotintheherogrid7days: "hero_grid",
  herogrid: "hero_grid",
  stickypost: "sticky_post",
  sidebarspotlight: "sidebar_spotlight",
  extendedtextlimit: "extended_text_limit",
  additionalimages: "additional_images",
  embeddedvideo: "embedded_video",
  weeklynewsletter: "weekly_newsletter_feature",
  weeklynewsletterfeature: "weekly_newsletter_feature",
  newsletterfeature: "weekly_newsletter_feature",
};

function canonicalizePurchasedOptionKey(rawKey: string): PurchasedIconKey | null {
  const normalized = rawKey.toLowerCase().replace(/[^a-z0-9]/g, "");
  return OPTION_KEY_CANONICAL_MAP[normalized] ?? null;
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

function PurchasedOptionIcon({ item }: { item: PurchasedIconItem }) {
  const className = item.active
    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
    : "border-slate-200 bg-slate-50/60 text-slate-400";

  return (
    <span className="group relative inline-flex">
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded border ${className}`}
        title={item.label}
        aria-label={item.label}
      >
        <item.Icon className="h-3.5 w-3.5" />
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] leading-4 text-white shadow-lg group-hover:block">
        {item.label}
      </span>
    </span>
  );
}

function SortHeader({
  label,
  sortKey,
  activeSortKey,
  sortDir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDir: SortDir;
  onClick: (key: SortKey) => void;
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className="inline-flex items-center gap-1 whitespace-nowrap text-left text-xs font-medium text-muted-foreground hover:text-foreground"
      title={`Sort by ${label}`}
    >
      {label}
      {isActive ? sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3" />}
    </button>
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [pageSize, setPageSize] = useState(20);

  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingDetail, setSavingDetail] = useState(false);

  const [workflow, setWorkflow] = useState({
    orderPaymentStatus: "PAID",
    editorialStatus: "SUBMITTED",
    publicationStatus: "NOT_SCHEDULED",
    reviewerAssignee: "",
    reviewerCollaboratorId: "",
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
    params.set("limit", String(pageSize));
    return params.toString();
  }, [query, productType, editorialStatus, publicationStatus, paymentStatus, company, contactEmail, orderNumber, reviewer, hasAssets, createdFrom, createdTo, reservedFrom, reservedTo, pageSize]);

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
      const nextRows = Array.isArray(payload.items) ? payload.items : [];
      setRows(nextRows);
      setRole(payload.role || "-");
      setSelectedRowIds((prev) => prev.filter((id) => nextRows.some((row) => row.id === id)));
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
        reviewerCollaboratorId: payload.workflow.reviewerCollaboratorId || "",
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

  const updateInlineStatus = async (
    rowId: string,
    patch: Partial<Pick<ListRow, "editorialStatus" | "publicationStatus">>
  ) => {
    const response = await adminFetch(`/api/admin/submissions/${rowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return;
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
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
  const collaboratorById = useMemo(() => {
    const map = new Map<string, DetailPayload["collaborators"][number]>();
    for (const collaborator of detail?.collaborators ?? []) {
      map.set(collaborator.id, collaborator);
    }
    return map;
  }, [detail?.collaborators]);
  const shipping = getStringList(formData, "shipping_countries");
  const quizFields = [
    ["Question", getString(formData, "giveaway_question")],
    ["Correct", getString(formData, "answer_correct")],
    ["Wrong #1", getString(formData, "answer_wrong_1")],
    ["Wrong #2", getString(formData, "answer_wrong_2")],
    ["Wrong #3", getString(formData, "answer_wrong_3")],
    ["Wrong #4", getString(formData, "answer_wrong_4")],
  ] as const;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "urgency" ? "desc" : "asc");
  };

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const resolve = (row: ListRow): string | number => {
        if (sortKey === "orderNumber") return (row.orderNumber === "-" ? row.linkedOrderId : row.orderNumber).toLowerCase();
        if (sortKey === "createdAt" || sortKey === "updatedAt") return new Date(row[sortKey]).getTime();
        if (sortKey === "urgency") return getUrgencyMinutes(row.createdAt);
        if (sortKey === "totalPaid" || sortKey === "vatPaid") {
          const amount = Number.parseFloat(row[sortKey]);
          return Number.isFinite(amount) ? amount : -1;
        }
        return (row[sortKey] || "").toLowerCase();
      };
      const left = resolve(a);
      const right = resolve(b);
      if (typeof left === "number" && typeof right === "number") {
        return sortDir === "asc" ? left - right : right - left;
      }
      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const visibleRowIds = useMemo(() => sortedRows.map((row) => row.id), [sortedRows]);
  const allVisibleSelected = visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedRowIds.includes(id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedRowIds((prev) => prev.filter((id) => !visibleRowIds.includes(id)));
      return;
    }
    setSelectedRowIds((prev) => Array.from(new Set([...prev, ...visibleRowIds])));
  };

  const toggleRowSelection = (id: string) => {
    setSelectedRowIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  };

  const download = (path: string) => {
    if (!token) return;
    const url = `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const exportCsv = () => {
    const params = new URLSearchParams(queryString);
    if (selectedRowIds.length > 0) {
      params.set("ids", selectedRowIds.join(","));
    }
    download(`/api/admin/submissions/export?${params.toString()}`);
  };
  const purchasedIconsForRow = (row: ListRow): PurchasedIconItem[] => {
    const product = row.productType.trim().toLowerCase();
    const optionKeys = OPTION_KEYS_BY_PRODUCT[product] ?? [];

    const activeBusinessKeys = new Set<PurchasedIconKey>();
    for (const rawKey of row.orderedOptionKeys ?? []) {
      const canonical = canonicalizePurchasedOptionKey(rawKey);
      if (canonical) activeBusinessKeys.add(canonical);
    }
    for (const rawKey of Object.keys(row.orderedOptionValues ?? {})) {
      const canonical = canonicalizePurchasedOptionKey(rawKey);
      if (canonical) activeBusinessKeys.add(canonical);
    }

    return optionKeys.map((key) => {
      const active = activeBusinessKeys.has(key);
      return {
        key,
        label: ICON_META[key].label,
        active,
        Icon: ICON_META[key].Icon,
      };
    });
  };

  return (
    <>
    <AdminShell
      title="Admin Submissions"
      subtitle="Daily submission operations (one row = one purchased submission)."
      themeClassName="bg-sky-50"
      headerBorderClassName="border-sky-100"
      headerRight={
        <>
          <Input type="password" placeholder="Admin token" value={token} onChange={(event) => updateToken(event.target.value)} className="w-64 bg-white" />
          <Button type="button" variant="outline" onClick={clearToken}>Clear</Button>
        </>
      }
    >
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            Role: <span className="font-semibold text-foreground">{role}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 items-center gap-2 rounded border px-2 text-sm">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </label>
            <Button variant="outline" className="h-9 min-w-[210px] justify-start" onClick={exportCsv}>
              <Download className="mr-1 h-4 w-4" />
              Export CSV {selectedRowIds.length > 0 ? `(${selectedRowIds.length} selected)` : ""}
            </Button>
            <div className="relative min-w-[280px]">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="h-9 bg-white pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Quick search: order, company, email, title" />
            </div>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={String(pageSize)}
              onChange={(event) => setPageSize(Number(event.target.value))}
              title="Page size"
            >
              <option value="20">20</option>
              <option value="40">40</option>
              <option value="60">60</option>
              <option value="80">80</option>
              <option value="100">100</option>
            </select>
            <Button variant="outline" className="h-9" onClick={() => setShowAdvancedFilters((prev) => !prev)}>
              <Funnel className="mr-1 h-4 w-4" />
              Filters
            </Button>
          </div>
        </div>

        {unauthorized ? (
          <Alert variant="destructive">
            <AlertTitle>Unauthorized</AlertTitle>
            <AlertDescription>Admin token is missing or invalid.</AlertDescription>
          </Alert>
        ) : null}

        {showAdvancedFilters ? (
          <section className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <div>
                <Label className="mb-1 block text-xs uppercase">Product type</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={productType} onChange={(event) => setProductType(event.target.value)}>
                  <option value="">All</option><option value="giveaway">Giveaway</option><option value="promo">Promo</option><option value="news">News</option><option value="ads">Ads</option><option value="sponsorship">Sponsorship</option>
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs uppercase">Editorial</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={editorialStatus} onChange={(event) => setEditorialStatus(event.target.value)}>
                  <option value="">All</option><option value="SUBMITTED">SUBMITTED</option><option value="UNDER_REVIEW">UNDER_REVIEW</option><option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option>
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs uppercase">Publication</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={publicationStatus} onChange={(event) => setPublicationStatus(event.target.value)}>
                  <option value="">All</option><option value="NOT_SCHEDULED">NOT_SCHEDULED</option><option value="SCHEDULED">SCHEDULED</option><option value="PUBLISHED">PUBLISHED</option><option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
              <div>
                <Label className="mb-1 block text-xs uppercase">Payment</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
                  <option value="">All</option><option value="PAID">PAID</option><option value="PENDING">PENDING</option><option value="FAILED">FAILED</option><option value="REFUNDED">REFUNDED</option>
                </select>
              </div>
              <div><Label className="mb-1 block text-xs uppercase">Order #</Label><Input className="h-9" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></div>
              <div><Label className="mb-1 block text-xs uppercase">Company</Label><Input className="h-9" value={company} onChange={(event) => setCompany(event.target.value)} /></div>
              <div><Label className="mb-1 block text-xs uppercase">Email</Label><Input className="h-9" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} /></div>
              <div><Label className="mb-1 block text-xs uppercase">Reviewer</Label><Input className="h-9" value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></div>
              <div>
                <Label className="mb-1 block text-xs uppercase">Assets</Label>
                <select className="h-9 w-full rounded-md border px-2 text-sm" value={hasAssets} onChange={(event) => setHasAssets(event.target.value)}>
                  <option value="">All</option><option value="true">Has assets</option><option value="false">Missing assets</option>
                </select>
              </div>
              <div><Label className="mb-1 block text-xs uppercase">Reserved from</Label><Input className="h-9" type="date" value={reservedFrom} onChange={(event) => setReservedFrom(event.target.value)} /></div>
              <div><Label className="mb-1 block text-xs uppercase">Reserved to</Label><Input className="h-9" type="date" value={reservedTo} onChange={(event) => setReservedTo(event.target.value)} /></div>
              <div><Label className="mb-1 block text-xs uppercase">Created from</Label><Input className="h-9" type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} /></div>
              <div><Label className="mb-1 block text-xs uppercase">Created to</Label><Input className="h-9" type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} /></div>
              <div className="flex items-end gap-2 xl:col-span-2">
                <Button className="h-9" onClick={() => void refresh()}>Apply filters</Button>
                <Button
                  className="h-9"
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
        ) : null}

        <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap px-2 py-2 text-xs">Select</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2 text-xs">Open</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Order #" sortKey="orderNumber" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Urgency" sortKey="urgency" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Product" sortKey="productType" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Company" sortKey="company" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2 text-xs">Contact</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Reserved slot" sortKey="reservedSlot" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Created" sortKey="createdAt" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Updated" sortKey="updatedAt" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Payment" sortKey="paymentStatus" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Total paid" sortKey="totalPaid" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="VAT paid" sortKey="vatPaid" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Editorial" sortKey="editorialStatus" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Publication" sortKey="publicationStatus" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Reviewer" sortKey="reviewerAssignee" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2 text-xs">Purchased options</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2 text-xs">Assets</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2 text-xs">Actions</TableHead>
                    <TableHead className="whitespace-nowrap px-2 py-2"><SortHeader label="Submission ID" sortKey="submissionId" activeSortKey={sortKey} sortDir={sortDir} onClick={handleSort} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((row) => {
                    const urgency = urgencyFromCreated(row.createdAt);
                    const purchasedIcons = purchasedIconsForRow(row);
                    return (
                      <TableRow key={row.id} className="text-xs">
                        <TableCell className="whitespace-nowrap px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedRowIds.includes(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                            aria-label={`Select ${row.orderNumber !== "-" ? row.orderNumber : row.submissionId}`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => void openDetail(row.id)} title="View" aria-label="View">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">{row.orderNumber !== "-" ? row.orderNumber : row.linkedOrderId}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">
                          <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${urgency.className}`}>{urgency.label}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2"><Badge variant="outline">{row.productType.toUpperCase()}</Badge></TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2" title={row.company}>{compactText(row.company, 20)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2" title={row.contactEmail}>
                          {isEmail(row.contactEmail) ? (
                            <a href={`mailto:${row.contactEmail}`} className="text-blue-700 hover:underline">
                              {compactText(row.contactEmail, 20)}
                            </a>
                          ) : (
                            compactText(row.contactEmail, 20)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2" title={row.reservedSlot}>{compactText(row.reservedSlot, 24)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">{iso(row.createdAt)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">{iso(row.updatedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">{statusPill("payment", row.paymentStatus)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">{formatMoney(row.totalPaid)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">{formatMoney(row.vatPaid)}</TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">
                          {roleCanEdit.canUpdateEditorial ? (
                            <select
                              className="h-8 rounded border px-1 text-xs"
                              value={row.editorialStatus}
                              onChange={(event) => void updateInlineStatus(row.id, { editorialStatus: event.target.value as ListRow["editorialStatus"] })}
                              aria-label="Edit editorial status"
                            >
                              <option>SUBMITTED</option>
                              <option>UNDER_REVIEW</option>
                              <option>CHANGES_REQUESTED</option>
                              <option>APPROVED</option>
                              <option>REJECTED</option>
                            </select>
                          ) : (
                            statusPill("editorial", row.editorialStatus)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">
                          {roleCanEdit.canUpdatePublication ? (
                            <select
                              className="h-8 rounded border px-1 text-xs"
                              value={row.publicationStatus}
                              onChange={(event) => void updateInlineStatus(row.id, { publicationStatus: event.target.value as ListRow["publicationStatus"] })}
                              aria-label="Edit publication status"
                            >
                              <option>NOT_SCHEDULED</option>
                              <option>SCHEDULED</option>
                              <option>PUBLISHED</option>
                              <option>ARCHIVED</option>
                            </select>
                          ) : (
                            statusPill("publication", row.publicationStatus)
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2" title={row.reviewerAssignee}>{compactText(row.reviewerAssignee, 16)}</TableCell>
                        <TableCell className="px-2 py-2">
                          {purchasedIcons.length === 0 ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <div className="grid grid-cols-4 gap-1.5 justify-items-start" title={row.purchasedOptionsSummary}>
                              {purchasedIcons.map((item) => (
                                <PurchasedOptionIcon key={item.key} item={item} />
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground" title={row.assetsSummary}>
                            <ImageIcon className="h-3.5 w-3.5" />
                            {row.assetsSummary}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => download(`/api/admin/submissions/${row.id}/export?format=package`)} title="Export package" aria-label="Export package">
                            <Package className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-2 py-2 font-mono text-xs">{compactText(row.submissionId, 20)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
    </AdminShell>

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
                <p className="mb-2 text-xs text-muted-foreground">Publication status is an internal workflow status managed in admin. It does not automatically sync WordPress publication state.</p>
                <div className="mb-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <span className="font-medium">Pending action:</span> {detail.pendingAction.label} ({detail.pendingAction.owner})
                </div>
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
                    <select
                      className="h-10 w-full rounded-md border px-3 text-sm"
                      disabled={!detailPermissions.canUpdateNotes}
                      value={workflow.reviewerCollaboratorId}
                      onChange={(event) => {
                        const collaboratorId = event.target.value;
                        const collaborator = collaboratorById.get(collaboratorId);
                        setWorkflow((prev) => ({
                          ...prev,
                          reviewerCollaboratorId: collaboratorId,
                          reviewerAssignee: collaborator?.displayName ?? "",
                        }));
                      }}
                    >
                      <option value="">Unassigned</option>
                      {(detail.collaborators ?? []).map((collaborator) => (
                        <option key={collaborator.id} value={collaborator.id}>
                          {collaborator.displayName} ({collaborator.role})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Assignment uses active collaborators (SUPER_ADMIN, CONTENT_ADMIN, OPS_ADMIN) only.
                    </p>
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
                  <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Title</p><p>{getString(formData, "title")}</p></div>
                  <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Short product description</p><p className="whitespace-pre-wrap">{getString(formData, "short_product_description")}</p></div>
                  <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Body</p><p className="whitespace-pre-wrap">{getString(formData, "body")}</p></div>
                  <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Notes to admin</p><p className="whitespace-pre-wrap">{getString(formData, "notes")}</p></div>

                  {detail.submission.productType === "giveaway" ? (
                    <>
                      <div className="rounded border p-3">
                        <p className="text-xs uppercase text-muted-foreground">Giveaway details</p>
                        <div className="grid gap-1 md:grid-cols-2">
                          <p>Prize: {getString(formData, "prize_name")}</p><p>Category: {getString(formData, "giveaway_category")}</p><p>Units: {getString(formData, "prize_units_count")}</p><p>Unit value (USD): {getString(formData, "prize_unit_value_usd")}</p>
                        </div>
                      </div>
                      <div className="rounded border p-3">
                        <p className="text-xs uppercase text-muted-foreground">Quiz question and answers</p>
                        <div className="grid gap-1">{quizFields.map(([label, value]) => (<p key={label}><span className="text-muted-foreground">{label}:</span> {value}</p>))}</div>
                      </div>
                      <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Shipping configuration</p><p>{shipping.length ? shipping.join(", ") : "-"}</p></div>
                      <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Audience Amplifier configuration</p><pre className="whitespace-pre-wrap text-xs">{summarizeAudienceAmplifier(formData)}</pre></div>
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
    </>
  );
}
