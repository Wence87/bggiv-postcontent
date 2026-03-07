import { notFound } from "next/navigation";

import AdminPageClient from "@/app/admin/AdminPageClient";

export const dynamic = "force-dynamic";

export default async function AdminSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const expectedSlug = process.env.ADMIN_SLUG_SECRET;

  if (!expectedSlug || slug !== expectedSlug) {
    notFound();
  }

  return <AdminPageClient />;
}
