"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProductFormField = {
  key: string;
  label: string;
  type: "text" | "email" | "url" | "file" | "select" | "date" | "textarea";
  required?: boolean;
  accept?: string;
  options?: string[];
};

type OrderContextResponse = {
  product: {
    product_type: string;
    form_id: string;
    product_key: string;
    base_fields: string[];
    form_fields?: ProductFormField[];
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<OrderContextResponse | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticState>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileValues, setFileValues] = useState<Record<string, File | null>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          setValues({});
          setFileValues({});
          setValidationError(null);
          setSubmitError(null);
          setIsSubmitting(false);
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

  const formFields = context.product.form_fields ?? [];

  function setFieldValue(key: string, value: string) {
    setValues((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function setFieldFileValue(key: string, file: File | null) {
    setFileValues((previous) => ({
      ...previous,
      [key]: file,
    }));
  }

  function validateField(field: ProductFormField): boolean {
    if (!field.required) {
      return true;
    }

    if (field.type === "file") {
      return Boolean(fileValues[field.key]);
    }

    const rawValue = values[field.key];
    return typeof rawValue === "string" && rawValue.trim().length > 0;
  }

  function validateForm(): boolean {
    for (const field of formFields) {
      if (!validateField(field)) {
        setValidationError(`Missing required field: ${field.label}`);
        return false;
      }

      if (field.type === "email" && values[field.key]) {
        const email = values[field.key].trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setValidationError(`Invalid email: ${field.label}`);
          return false;
        }
      }

      if (field.type === "url" && values[field.key]) {
        try {
          const parsedUrl = new URL(values[field.key]);
          if (!parsedUrl.protocol.startsWith("http")) {
            throw new Error("Unsupported protocol");
          }
        } catch {
          setValidationError(`Invalid URL: ${field.label}`);
          return false;
        }
      }
    }

    setValidationError(null);
    return true;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (!context) {
      setSubmitError("Missing context");
      return;
    }

    if (!validateForm()) {
      return;
    }

    const payload = new FormData();
    payload.append("token", token);
    payload.append("product_key", context.product.product_key);
    payload.append("form_data", JSON.stringify(values));

    const bannerFile = fileValues.banner_image_upload;
    if (bannerFile) {
      payload.append("banner_image_upload", bannerFile);
      payload.append("uploaded_files", bannerFile);
    }

    setIsSubmitting(true);
    void fetch("/api/submit/finalize", {
      method: "POST",
      body: payload,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            typeof body?.message === "string" ? body.message : typeof body?.code === "string" ? body.code : "Submission failed";
          throw new Error(message);
        }
        router.push("/submit/success");
      })
      .catch((submitRequestError) => {
        setSubmitError(submitRequestError instanceof Error ? submitRequestError.message : "Submission failed");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  function renderField(field: ProductFormField) {
    const requiredMark = field.required ? " *" : "";
    const label = `${field.label}${requiredMark}`;

    if (field.type === "textarea") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          <textarea
            id={field.key}
            name={field.key}
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
            required={Boolean(field.required)}
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          <select
            id={field.key}
            name={field.key}
            value={values[field.key] ?? ""}
            onChange={(event) => setFieldValue(field.key, event.target.value)}
            required={Boolean(field.required)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Select...</option>
            {(field.options ?? []).map((optionValue) => (
              <option key={optionValue} value={optionValue}>
                {optionValue}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.type === "file") {
      return (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{label}</Label>
          <Input
            id={field.key}
            name={field.key}
            type="file"
            required={Boolean(field.required)}
            accept={field.accept}
            onChange={(event) => setFieldFileValue(field.key, event.target.files?.[0] ?? null)}
          />
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={field.key}>{label}</Label>
        <Input
          id={field.key}
          name={field.key}
          type={field.type}
          required={Boolean(field.required)}
          value={values[field.key] ?? ""}
          onChange={(event) => setFieldValue(field.key, event.target.value)}
        />
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

      <section className="rounded-md border bg-white p-4">
        <h3 className="text-base font-semibold">Submission form</h3>
        {formFields.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No dynamic fields configured for this product yet.</p>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
            {formFields.map((field) => renderField(field))}
            {validationError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{validationError}</div>
            ) : null}
            {submitError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
            ) : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Validate form"}
            </Button>
          </form>
        )}
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
