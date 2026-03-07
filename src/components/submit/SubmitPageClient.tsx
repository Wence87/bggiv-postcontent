"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";

type OrderContextResponse = {
  product: {
    product_type: string;
    form_id: string;
    product_key: string;
    base_fields: string[];
  };
  options: Array<{
    option_key: string;
    business_type: string;
    enabled: boolean;
  }>;
  enabled_options: string[];
  derived_values: Record<string, unknown>;
  activated_blocks: Array<{
    name: string;
    fields: string;
    validation: string;
  }>;
  config_version: number | null;
};

type DiagnosticState = {
  endpoint: string;
  status: number;
  responseBody: unknown;
} | null;

type SubmitPageClientProps = {
  token: string;
  diag?: boolean;
};

const WP_BASE_URL = (process.env.NEXT_PUBLIC_WP_BASE_URL || "https://boardgamegiveaways.com").replace(/\/$/, "");

export function SubmitPageClient({ token, diag = false }: SubmitPageClientProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<OrderContextResponse | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticState>(null);

  const contextEndpoint = useMemo(
    () => `${WP_BASE_URL}/wp-json/bgg/v1/order-context?token=${encodeURIComponent(token)}`,
    [token]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(contextEndpoint, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        const responseText = await response.text();
        let parsed: unknown = null;
        try {
          parsed = responseText ? JSON.parse(responseText) : null;
        } catch {
          parsed = { raw: responseText.slice(0, 1000) };
        }

        if (!response.ok) {
          if (!cancelled) {
            setDiagnostic({
              endpoint: contextEndpoint,
              status: response.status,
              responseBody: parsed,
            });
            setError("Invalid or expired token");
          }
          return;
        }

        if (!parsed || typeof parsed !== "object" || !("product" in parsed)) {
          if (!cancelled) {
            setDiagnostic({
              endpoint: contextEndpoint,
              status: response.status,
              responseBody: parsed,
            });
            setError("Invalid order context payload");
          }
          return;
        }

        if (!cancelled) {
          setContext(parsed as OrderContextResponse);
          setDiagnostic({
            endpoint: contextEndpoint,
            status: response.status,
            responseBody: diag ? parsed : { ok: true },
          });
        }
      } catch (fetchError) {
        if (!cancelled) {
          setDiagnostic({
            endpoint: contextEndpoint,
            status: 0,
            responseBody: {
              error: fetchError instanceof Error ? fetchError.message : "Network error",
            },
          });
          setError("Unable to load order context");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [contextEndpoint, diag]);

  if (loading) {
    return <div className="rounded-md border bg-white p-4 text-sm text-muted-foreground">Loading submission context...</div>;
  }

  if (error || !context) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ?? "Invalid submission link"}
        </div>

        {diag && diagnostic ? (
          <pre className="overflow-auto rounded-md border bg-slate-950 p-4 text-xs text-slate-100">
            {JSON.stringify(diagnostic, null, 2)}
          </pre>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Submission Context</h2>
          <Badge variant="secondary">{context.product.product_type.toUpperCase()}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Form: {context.product.form_id}</p>
        <p className="text-sm text-muted-foreground">Product key: {context.product.product_key}</p>
      </section>

      <section className="rounded-md border bg-white p-4">
        <h3 className="text-base font-semibold">Enabled options</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {context.enabled_options.length ? context.enabled_options.join(", ") : "No enabled options"}
        </p>
      </section>

      <section className="rounded-md border bg-white p-4">
        <h3 className="text-base font-semibold">Activated blocks</h3>
        <pre className="mt-2 overflow-auto rounded-md bg-slate-100 p-3 text-xs">
          {JSON.stringify(context.activated_blocks, null, 2)}
        </pre>
      </section>

      <section className="rounded-md border bg-white p-4">
        <h3 className="text-base font-semibold">Derived values</h3>
        <pre className="mt-2 overflow-auto rounded-md bg-slate-100 p-3 text-xs">
          {JSON.stringify(context.derived_values, null, 2)}
        </pre>
      </section>

      {diag && diagnostic ? (
        <section className="rounded-md border bg-white p-4">
          <h3 className="text-base font-semibold">Diagnostic</h3>
          <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(diagnostic, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
