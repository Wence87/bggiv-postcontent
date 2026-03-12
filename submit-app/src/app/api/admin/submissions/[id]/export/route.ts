import { NextRequest, NextResponse } from "next/server";

import { authenticateAdminRequestWithCollaborators, buildSubmissionScopeWhere, canDownloadExports } from "@/lib/adminAuth";
import { formatReservedSlot, summarizeAssets, summarizePurchasedOptions } from "@/lib/adminSubmissions";
import { prisma } from "@/lib/prisma";
import { createZip } from "@/lib/zip";

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toCsvRow(values: string[]): string {
  return values
    .map((value) => {
      const safe = value.replace(/\"/g, '""');
      return `"${safe}"`;
    })
    .join(",");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function rtfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

function toRtfParagraph(value: string): string {
  return rtfEscape(value).replace(/\r?\n/g, "\\line ");
}

type EditorialSection = {
  title: string;
  rows: Array<{ label: string; value: string }>;
};

function appendIfPresent(rows: Array<{ label: string; value: string }>, label: string, value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  rows.push({ label, value: trimmed });
}

function buildEditorialSections(input: {
  submission: {
    orderNumber: string | null;
    linkedOrderId: string | null;
    productType: string;
    companyName: string;
    contactEmail: string;
  };
  form: Record<string, unknown>;
  reservedSlot: string;
  purchasedOptionsSummary: string;
}): EditorialSection[] {
  const { submission, form, reservedSlot, purchasedOptionsSummary } = input;
  const sections: EditorialSection[] = [];

  sections.push({
    title: "Submission summary",
    rows: [
      { label: "Order number", value: submission.orderNumber || "-" },
      { label: "Linked order ID", value: submission.linkedOrderId || "-" },
      { label: "Product type", value: submission.productType },
      { label: "Company", value: submission.companyName },
      { label: "Contact email", value: submission.contactEmail },
      { label: "Reserved slot", value: reservedSlot },
      { label: "Purchased options", value: purchasedOptionsSummary || "-" },
    ],
  });

  const editorialRows: Array<{ label: string; value: string }> = [];
  appendIfPresent(editorialRows, "Title", form.title);
  appendIfPresent(editorialRows, "Short product description", form.short_product_description);
  appendIfPresent(editorialRows, "Body", form.body);
  appendIfPresent(editorialRows, "Notes to admin", form.notes);
  if (editorialRows.length) {
    sections.push({ title: "Editorial content", rows: editorialRows });
  }

  const linksRows: Array<{ label: string; value: string }> = [];
  appendIfPresent(linksRows, "Destination URL", form.destination_url);
  appendIfPresent(linksRows, "Website URL", form.website_url);
  appendIfPresent(linksRows, "Product URL", form.product_url);
  appendIfPresent(linksRows, "Target URL", form.target_url);
  appendIfPresent(linksRows, "Visit page URL", form.visit_page_url);
  appendIfPresent(linksRows, "Embedded video link", form.embedded_video_link);
  appendIfPresent(linksRows, "Embedded video URL", form.embedded_video_url);
  appendIfPresent(linksRows, "Call to action URL", form.call_to_action_url);
  if (linksRows.length) {
    sections.push({ title: "Links", rows: linksRows });
  }

  const giveawayRows: Array<{ label: string; value: string }> = [];
  appendIfPresent(giveawayRows, "Prize name", form.prize_name);
  appendIfPresent(giveawayRows, "Prize short description", form.prize_short_description);
  appendIfPresent(giveawayRows, "Giveaway category", form.giveaway_category);
  appendIfPresent(giveawayRows, "Prize unit value (USD)", String(form.prize_unit_value_usd ?? ""));
  appendIfPresent(giveawayRows, "Number of units offered", String(form.prize_units_count ?? ""));
  appendIfPresent(giveawayRows, "Minimum age", String(form.minimum_age ?? ""));
  const shipping = asStringArray(form.shipping_countries);
  if (shipping.length) {
    giveawayRows.push({ label: "Shipping countries", value: shipping.join(", ") });
  }
  if (giveawayRows.length) {
    sections.push({ title: "Giveaway details", rows: giveawayRows });
  }

  const quizRows: Array<{ label: string; value: string }> = [];
  appendIfPresent(quizRows, "Question", form.giveaway_question);
  appendIfPresent(quizRows, "Correct answer", form.answer_correct);
  appendIfPresent(quizRows, "Wrong answer 1", form.answer_wrong_1);
  appendIfPresent(quizRows, "Wrong answer 2", form.answer_wrong_2);
  appendIfPresent(quizRows, "Wrong answer 3", form.answer_wrong_3);
  appendIfPresent(quizRows, "Wrong answer 4", form.answer_wrong_4);
  if (quizRows.length) {
    sections.push({ title: "Quiz", rows: quizRows });
  }

  const audienceRows: Array<{ label: string; value: string }> = [];
  const audienceActions =
    form.audience_amplifier_actions && typeof form.audience_amplifier_actions === "object" && !Array.isArray(form.audience_amplifier_actions)
      ? (form.audience_amplifier_actions as Record<string, unknown>)
      : null;
  if (audienceActions) {
    const actionLabels: Record<string, string> = {
      boardgamegeek_thread_url: "BoardGameGeek thread URL",
      tweet_message_text: "Tweet message text",
      newsletter_signup_url: "Newsletter signup URL",
      instagram_url: "Instagram URL",
      tiktok_url: "TikTok URL",
      youtube_channel_url: "YouTube channel URL",
      x_profile_url: "X profile URL",
      youtube_video_url: "YouTube video URL",
      visit_page_url: "Visit page URL",
    };
    for (const [key, label] of Object.entries(actionLabels)) {
      appendIfPresent(audienceRows, label, audienceActions[key]);
    }
    const referFriend =
      audienceActions.refer_a_friend && typeof audienceActions.refer_a_friend === "object" && !Array.isArray(audienceActions.refer_a_friend)
        ? (audienceActions.refer_a_friend as Record<string, unknown>)
        : null;
    if (referFriend) {
      appendIfPresent(audienceRows, "Refer a friend message", referFriend.referral_message);
      appendIfPresent(audienceRows, "Refer a friend target URL", referFriend.target_url);
    }
  }
  if (audienceRows.length) {
    sections.push({ title: "Audience amplifier", rows: audienceRows });
  }

  return sections;
}

function buildEditorialRtf(input: {
  submission: {
    orderNumber: string | null;
    linkedOrderId: string | null;
    productType: string;
    companyName: string;
    contactEmail: string;
  };
  form: Record<string, unknown>;
  reservedSlot: string;
  purchasedOptionsSummary: string;
}): string {
  const sections = buildEditorialSections(input);
  const lines: string[] = [];
  lines.push("{\\rtf1\\ansi\\deff0");
  lines.push("{\\fonttbl{\\f0 Arial;}}");
  lines.push("\\fs24");
  lines.push("\\b Submission content export\\b0\\par");
  lines.push("\\par");

  for (const section of sections) {
    lines.push(`\\b ${toRtfParagraph(section.title)}\\b0\\par`);
    for (const row of section.rows) {
      lines.push(`\\b ${toRtfParagraph(row.label)}:\\b0 ${toRtfParagraph(row.value)}\\par`);
    }
    lines.push("\\par");
  }

  lines.push("}");
  return lines.join("\n");
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authenticateAdminRequestWithCollaborators(request);
  if (!auth) return unauthorized();
  if (!canDownloadExports(auth.role)) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await context.params;
  const submission = await prisma.submitFormSubmission.findFirst({
    where: {
      AND: [{ id }, buildSubmissionScopeWhere(auth)],
    },
    include: {
      ops: true,
    },
  });
  if (!submission) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });

  const format = (request.nextUrl.searchParams.get("format") || "package").toLowerCase();
  const orderPrefix = sanitizeFilename(submission.orderNumber || submission.linkedOrderId || submission.id);

  const form = submission.formDataJson && typeof submission.formDataJson === "object"
    ? (submission.formDataJson as Record<string, unknown>)
    : {};
  const purchasedOptionsSummary = summarizePurchasedOptions(submission);
  const reservedSlot = formatReservedSlot(submission);
  const assetsSummary = summarizeAssets(submission).summary;

  if (format === "csv") {
    const header = toCsvRow([
      "submission_id",
      "order_number",
      "linked_order_id",
      "product_type",
      "company",
      "contact_email",
      "reservation_month_key",
      "reservation_week_key",
      "reservation_starts_at",
      "payment_status",
      "editorial_status",
      "publication_status",
      "reviewer_assignee",
      "reserved_slot",
      "assets_summary",
      "purchased_options_summary",
      "created_at",
      "updated_at",
    ]);
    const row = toCsvRow([
      submission.id,
      submission.orderNumber || "",
      submission.linkedOrderId || "",
      submission.productType,
      submission.companyName,
      submission.contactEmail,
      submission.reservationMonthKey || "",
      submission.reservationWeekKey || "",
      submission.reservationStartsAt?.toISOString() || "",
      submission.ops?.orderPaymentStatus || "PAID",
      submission.ops?.editorialStatus || "SUBMITTED",
      submission.ops?.publicationStatus || "NOT_SCHEDULED",
      submission.ops?.reviewerAssignee || "",
      reservedSlot,
      assetsSummary,
      purchasedOptionsSummary,
      submission.createdAt.toISOString(),
      submission.updatedAt.toISOString(),
    ]);

    return new NextResponse(`${header}\n${row}\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${orderPrefix}-metadata.csv\"`,
      },
    });
  }

  if (format === "package") {
    const metadataHeader = toCsvRow([
      "submission_id",
      "order_number",
      "linked_order_id",
      "product_type",
      "company",
      "contact_email",
      "reservation_month_key",
      "reservation_week_key",
      "reservation_starts_at",
      "reserved_slot",
      "payment_status",
      "editorial_status",
      "publication_status",
      "reviewer_assignee",
      "assets_summary",
      "purchased_options_summary",
      "created_at",
      "updated_at",
    ]);
    const metadataRow = toCsvRow([
      submission.id,
      submission.orderNumber || "",
      submission.linkedOrderId || "",
      submission.productType,
      submission.companyName,
      submission.contactEmail,
      submission.reservationMonthKey || "",
      submission.reservationWeekKey || "",
      submission.reservationStartsAt?.toISOString() || "",
      reservedSlot,
      submission.ops?.orderPaymentStatus || "PAID",
      submission.ops?.editorialStatus || "SUBMITTED",
      submission.ops?.publicationStatus || "NOT_SCHEDULED",
      submission.ops?.reviewerAssignee || "",
      assetsSummary,
      purchasedOptionsSummary,
      submission.createdAt.toISOString(),
      submission.updatedAt.toISOString(),
    ]);
    const editorialRtf = buildEditorialRtf({
      submission: {
        orderNumber: submission.orderNumber,
        linkedOrderId: submission.linkedOrderId,
        productType: submission.productType,
        companyName: submission.companyName,
        contactEmail: submission.contactEmail,
      },
      form,
      reservedSlot,
      purchasedOptionsSummary,
    });

    const zip = createZip([
      {
        name: `${orderPrefix}-metadata.csv`,
        data: new TextEncoder().encode(`${metadataHeader}\n${metadataRow}\n`),
        modifiedAt: submission.updatedAt,
      },
      {
        name: `${orderPrefix}-content.rtf`,
        data: new TextEncoder().encode(editorialRtf),
        modifiedAt: submission.updatedAt,
      },
      {
        name: `${orderPrefix}-cover-${sanitizeFilename(submission.bannerImageName || "asset.jpg")}`,
        data: new Uint8Array(submission.bannerImageData),
        modifiedAt: submission.updatedAt,
      },
      ...(submission.additionalImage1Data
        ? [
            {
              name: `${orderPrefix}-image1-${sanitizeFilename(submission.additionalImage1Name || "image1")}`,
              data: new Uint8Array(submission.additionalImage1Data),
              modifiedAt: submission.updatedAt,
            },
          ]
        : []),
      ...(submission.additionalImage2Data
        ? [
            {
              name: `${orderPrefix}-image2-${sanitizeFilename(submission.additionalImage2Name || "image2")}`,
              data: new Uint8Array(submission.additionalImage2Data),
              modifiedAt: submission.updatedAt,
            },
          ]
        : []),
      ...(submission.additionalImage3Data
        ? [
            {
              name: `${orderPrefix}-image3-${sanitizeFilename(submission.additionalImage3Name || "image3")}`,
              data: new Uint8Array(submission.additionalImage3Data),
              modifiedAt: submission.updatedAt,
            },
          ]
        : []),
    ]);

    return new NextResponse(Buffer.from(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"${orderPrefix}-submission-package.zip\"`,
      },
    });
  }

  return NextResponse.json({ code: "BAD_REQUEST", message: "Supported formats: csv, package" }, { status: 400 });
}
