export type AdminSection = "submissions" | "booking-tools" | "collaborators";

export function getAdminBasePathFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  const match = /^\/admin\/([^/]+)/.exec(pathname);
  if (!match || !match[1]) return null;
  return `/admin/${match[1]}`;
}

export function buildAdminSectionHref(
  pathname: string | null | undefined,
  section: AdminSection
): string | null {
  const base = getAdminBasePathFromPathname(pathname);
  if (!base) return null;
  if (section === "submissions") return base;
  if (section === "booking-tools") return `${base}/booking-tools`;
  return `${base}/collaborators`;
}

