import { notFound } from "next/navigation";

import CollaboratorsPageClient from "@/app/admin/CollaboratorsPageClient";

export const dynamic = "force-dynamic";

export default async function AdminCollaboratorsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const expectedSlug = process.env.ADMIN_SLUG_SECRET;

  if (!expectedSlug || slug !== expectedSlug) {
    notFound();
  }

  return <CollaboratorsPageClient />;
}
