"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type SubmissionDetailPayload = {
  id: string;
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
  permissions: {
    canUpdateEditorial: boolean;
    canUpdatePublication: boolean;
    canUpdatePayment: boolean;
    canUpdateNotes: boolean;
  };
  clientMessages?: Array<{
    id: string;
    message: string;
    createdAt: string;
    actorRole: string;
    actorIdentifier: string | null;
  }>;
  previousVersion?: {
    id: string;
    createdAt: string;
    formData: Record<string, unknown>;
  } | null;
};

export type SubmissionWorkflowForm = {
  orderPaymentStatus: string;
  editorialStatus: string;
  publicationStatus: string;
  reviewerAssignee: string;
  reviewerCollaboratorId: string;
  clientVisibleNote: string;
  internalNote: string;
  comment: string;
  clientMessage: string;
  requestClientChanges: boolean;
};

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

function formatProductLabel(productType: string): string {
  const normalized = productType.trim().toLowerCase();
  if (normalized === "promo") return "Promodeal";
  if (normalized === "giveaway") return "Giveaway";
  if (normalized === "news") return "News";
  if (normalized === "ads") return "Ads";
  if (normalized === "sponsorship") return "Sponsorship";
  return productType.toUpperCase();
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

type QuizStructured = {
  question: string;
  answers: string[];
  correctIndex: number;
  correctLabel: string;
};

function readQuizStructured(data: Record<string, unknown>): QuizStructured {
  const question = getString(data, "giveaway_question");
  const answer1 = getString(data, "answer_1");
  const answer2 = getString(data, "answer_2");
  const answer3 = getString(data, "answer_3");
  const answer4 = getString(data, "answer_4");
  const answer5 = getString(data, "answer_5");
  const legacyAnswers = [
    getString(data, "answer_correct"),
    getString(data, "answer_wrong_1"),
    getString(data, "answer_wrong_2"),
    getString(data, "answer_wrong_3"),
    getString(data, "answer_wrong_4"),
  ];
  const answers = [answer1, answer2, answer3, answer4, answer5].some((value) => value !== "-") ? [answer1, answer2, answer3, answer4, answer5] : legacyAnswers;

  const explicitIndexValue = data.correct_answer_index;
  const explicitIndex = typeof explicitIndexValue === "number"
    ? explicitIndexValue
    : typeof explicitIndexValue === "string"
      ? Number.parseInt(explicitIndexValue, 10)
      : NaN;
  const correctKey = typeof data.correct_answer_key === "string" ? data.correct_answer_key.trim() : "";

  let correctIndex = 0;
  if (Number.isFinite(explicitIndex) && explicitIndex >= 1 && explicitIndex <= answers.length) {
    correctIndex = explicitIndex - 1;
  } else if (/^answer_[1-5]$/.test(correctKey)) {
    correctIndex = Number.parseInt(correctKey.split("_")[1], 10) - 1;
  }

  const correctLabel = `Answer ${correctIndex + 1}`;
  return { question, answers, correctIndex, correctLabel };
}

function normalizeDiffValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasChanged(left: string, right: string): boolean {
  return normalizeDiffValue(left) !== normalizeDiffValue(right);
}

export function SubmissionDetailSheet({
  open,
  onOpenChange,
  loading,
  detail,
  workflow,
  setWorkflow,
  saving,
  onSave,
  canSeeInternalNotes,
  contextSubtitle,
  themeVariant = "submissions",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  detail: SubmissionDetailPayload | null;
  workflow: SubmissionWorkflowForm;
  setWorkflow: Dispatch<SetStateAction<SubmissionWorkflowForm>>;
  saving: boolean;
  onSave: () => void;
  canSeeInternalNotes: boolean;
  contextSubtitle?: string;
  themeVariant?: "submissions" | "collaborators";
}) {
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
  const collaboratorById = new Map((detail?.collaborators ?? []).map((collab) => [collab.id, collab] as const));
  const detailPermissions = detail?.permissions ?? {
    canUpdatePayment: false,
    canUpdateEditorial: false,
    canUpdatePublication: false,
    canUpdateNotes: false,
  };
  const canSave =
    detailPermissions.canUpdateNotes ||
    detailPermissions.canUpdateEditorial ||
    detailPermissions.canUpdatePublication ||
    detailPermissions.canUpdatePayment;
  const previousFormData = detail?.previousVersion?.formData ?? null;
  const currentQuiz = readQuizStructured(formData);
  const previousQuiz = previousFormData ? readQuizStructured(previousFormData) : null;
  const hasQuizDiff = Boolean(
    previousQuiz &&
      (
        hasChanged(previousQuiz.question, currentQuiz.question) ||
        previousQuiz.answers.some((value, index) => hasChanged(value, currentQuiz.answers[index] ?? "-")) ||
        previousQuiz.correctIndex !== currentQuiz.correctIndex
      )
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const containerTone = themeVariant === "collaborators" ? "bg-sky-50 border-sky-200" : "bg-sky-50 border-sky-200";
  const panelTone = themeVariant === "collaborators" ? "bg-sky-50 border-sky-200" : "bg-sky-50 border-sky-200";

  useEffect(() => {
    setHistoryOpen(false);
  }, [detail?.id]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={`w-full overflow-y-auto sm:max-w-4xl ${containerTone}`}>
        <SheetHeader>
          <SheetTitle>Submission detail</SheetTitle>
          <SheetDescription>
            {contextSubtitle ? `${contextSubtitle} · ` : ""}Order/customer info, workflow, client submission data, and audit history.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : null}

        {detail ? (
          <div className="mt-6 space-y-6">
            <section className={`rounded-md border p-4 ${panelTone}`}>
              <h3 className="text-sm font-semibold uppercase">Order / customer info</h3>
              <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <p><span className="text-muted-foreground">Order:</span> {detail.submission.orderNumber || detail.submission.linkedOrderId || "-"}</p>
                <p><span className="text-muted-foreground">Product:</span> {formatProductLabel(detail.submission.productType)}</p>
                <p><span className="text-muted-foreground">Company:</span> {detail.submission.companyName}</p>
                <p><span className="text-muted-foreground">Contact:</span> {detail.submission.contactEmail}</p>
                <p><span className="text-muted-foreground">Reserved:</span> {detail.submission.reservationStartsAt || detail.submission.reservationWeekKey || detail.submission.reservationMonthKey || "-"}</p>
                <p><span className="text-muted-foreground">Assets:</span> {detail.submission.assets.summary}</p>
              </div>
            </section>

            <section className={`rounded-md border p-4 ${panelTone}`}>
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
                    <p className="mt-1 text-xs text-muted-foreground">Internal workflow status. `SCHEDULED` means a reservation slot exists.</p>
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

                {canSeeInternalNotes ? (
                  <div className="md:col-span-2">
                    <Label className="mb-1 block text-xs">INTERNAL NOTES</Label>
                    <textarea disabled={!detailPermissions.canUpdateNotes} className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={workflow.internalNote} onChange={(event) => setWorkflow((prev) => ({ ...prev, internalNote: event.target.value }))} />
                  </div>
                ) : null}

                <div className="md:col-span-2 rounded-md border p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Client communication</p>
                  <p className="mb-2 text-xs text-muted-foreground">Use this block to request client corrections and keep a traceable communication history.</p>
                  <textarea
                    disabled={!detailPermissions.canUpdateNotes}
                    className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
                    value={workflow.clientMessage}
                    onChange={(event) => setWorkflow((prev) => ({ ...prev, clientMessage: event.target.value }))}
                    placeholder="Write a message for the client..."
                  />
                  <label className="mt-2 inline-flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={workflow.requestClientChanges}
                      disabled={!detailPermissions.canUpdateEditorial}
                      onChange={(event) => setWorkflow((prev) => ({ ...prev, requestClientChanges: event.target.checked }))}
                    />
                    Mark editorial status as CHANGES_REQUESTED
                  </label>
                  <div className="mt-2 space-y-2 text-xs">
                    {(detail.clientMessages ?? []).length === 0 ? (
                      <p className="text-muted-foreground">No client messages yet.</p>
                    ) : (
                      (detail.clientMessages ?? []).map((message) => (
                        <div key={message.id} className="rounded border p-2">
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{message.actorRole} ({message.actorIdentifier || "-"})</p>
                            <p className="text-muted-foreground">{iso(message.createdAt)}</p>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap">{message.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {canSave ? (
                  <div className="md:col-span-2">
                    <Label className="mb-1 block text-xs">AUDIT COMMENT (OPTIONAL)</Label>
                    <Input value={workflow.comment} onChange={(event) => setWorkflow((prev) => ({ ...prev, comment: event.target.value }))} />
                  </div>
                ) : null}
              </div>
              {canSave ? (
                <div className="mt-3 flex justify-end">
                  <Button onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save workflow"}</Button>
                </div>
              ) : null}
            </section>

            <section className={`rounded-md border p-4 ${panelTone}`}>
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
                      {previousQuiz ? (
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-[11px] uppercase text-muted-foreground">
                            <p>Previous version ({iso(detail.previousVersion?.createdAt || "")})</p>
                            <p>Current version</p>
                          </div>
                          <div className="grid gap-2">
                            <div className="grid grid-cols-2 gap-2">
                              <div className={`rounded border p-2 ${hasChanged(previousQuiz.question, currentQuiz.question) ? "bg-red-50" : "bg-white"}`}>
                                <p className="text-[11px] uppercase text-muted-foreground">Question</p>
                                <p className={`whitespace-pre-wrap ${hasChanged(previousQuiz.question, currentQuiz.question) ? "line-through text-red-700" : ""}`}>{previousQuiz.question}</p>
                              </div>
                              <div className={`rounded border p-2 ${hasChanged(previousQuiz.question, currentQuiz.question) ? "bg-yellow-50" : "bg-white"}`}>
                                <p className="text-[11px] uppercase text-muted-foreground">Question</p>
                                <p className="whitespace-pre-wrap">{currentQuiz.question}</p>
                              </div>
                            </div>
                            {currentQuiz.answers.map((currentAnswer, index) => {
                              const prevAnswer = previousQuiz.answers[index] ?? "-";
                              const changed = hasChanged(prevAnswer, currentAnswer);
                              const isPrevCorrect = previousQuiz.correctIndex === index;
                              const isCurrentCorrect = currentQuiz.correctIndex === index;
                              return (
                                <div key={`quiz-answer-${index}`} className="grid grid-cols-2 gap-2">
                                  <div className={`rounded border p-2 ${changed ? "bg-red-50" : "bg-white"}`}>
                                    <p className="text-[11px] uppercase text-muted-foreground">Answer {index + 1}{isPrevCorrect ? " · Correct" : ""}</p>
                                    <p className={`${changed ? "line-through text-red-700" : ""}`}>{prevAnswer}</p>
                                  </div>
                                  <div className={`rounded border p-2 ${changed ? "bg-yellow-50" : "bg-white"}`}>
                                    <p className="text-[11px] uppercase text-muted-foreground">Answer {index + 1}{isCurrentCorrect ? " · Correct" : ""}</p>
                                    <p>{currentAnswer}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {previousQuiz.correctIndex !== currentQuiz.correctIndex ? (
                            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                              Correct answer changed: {previousQuiz.correctLabel} → {currentQuiz.correctLabel}
                            </p>
                          ) : hasQuizDiff ? null : (
                            <p className="text-xs text-muted-foreground">No quiz changes detected.</p>
                          )}
                        </div>
                      ) : (
                        <div className="grid gap-1">
                          {quizFields.map(([label, value]) => (
                            <p key={label}><span className="text-muted-foreground">{label}:</span> {value}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Shipping configuration</p><p>{shipping.length ? shipping.join(", ") : "-"}</p></div>
                    <div className="rounded border p-3"><p className="text-xs uppercase text-muted-foreground">Audience Amplifier configuration</p><pre className="whitespace-pre-wrap text-xs">{summarizeAudienceAmplifier(formData)}</pre></div>
                  </>
                ) : null}
              </div>
            </section>

            <section className={`rounded-md border p-4 ${panelTone}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase">History</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3"
                  onClick={() => setHistoryOpen((prev) => !prev)}
                  aria-label={historyOpen ? "Collapse history" : "Expand history"}
                  title={historyOpen ? "Collapse history" : "Expand history"}
                >
                  {historyOpen ? "Hide" : "Show"}
                </Button>
              </div>
              {historyOpen ? (
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
              ) : null}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
