import { NextRequest, NextResponse } from "next/server";

import { authenticateAdminRequest, buildSubmissionScopeWhere, canDownloadExports } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { createZip } from "@/lib/zip";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function unauthorized() {
  return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateAdminRequest(request);
  if (!auth) return unauthorized();
  if (!canDownloadExports(auth.role)) {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await context.params;
  const submission = await prisma.submitFormSubmission.findFirst({
    where: {
      AND: [{ id }, buildSubmissionScopeWhere(auth)],
    },
    select: {
      id: true,
      orderNumber: true,
      linkedOrderId: true,
      bannerImageName: true,
      bannerImageMimeType: true,
      bannerImageData: true,
      createdAt: true,
    },
  });

  if (!submission) {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }

  const mode = request.nextUrl.searchParams.get("mode") || "zip";
  const orderPrefix = sanitizeFilename(submission.orderNumber || submission.linkedOrderId || submission.id);
  const imageName = sanitizeFilename(submission.bannerImageName || "asset.jpg");
  const directName = `${orderPrefix}-cover-${imageName}`;

  if (mode === "direct") {
    return new NextResponse(submission.bannerImageData, {
      status: 200,
      headers: {
        "Content-Type": submission.bannerImageMimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename=\"${directName}\"`,
      },
    });
  }

  const manifest = {
    submissionId: submission.id,
    orderNumber: submission.orderNumber,
    linkedOrderId: submission.linkedOrderId,
    generatedAt: new Date().toISOString(),
    assets: [
      {
        type: "cover",
        name: directName,
        mimeType: submission.bannerImageMimeType,
      },
    ],
  };

  const zip = createZip([
    {
      name: `${orderPrefix}-assets-manifest.json`,
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      modifiedAt: submission.createdAt,
    },
    {
      name: directName,
      data: new Uint8Array(submission.bannerImageData),
      modifiedAt: submission.createdAt,
    },
  ]);

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"${orderPrefix}-assets.zip\"`,
    },
  });
}
