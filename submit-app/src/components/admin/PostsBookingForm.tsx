import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PostsBookingFormValues = {
  companyName: string;
  customerEmail: string;
  orderRef: string;
  internalNote: string;
};

type PostsBookingFormProps = {
  values: PostsBookingFormValues;
  onChange: (next: PostsBookingFormValues) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  submitting: boolean;
  selectedSummary?: string;
  submitLabel?: string;
};

export function PostsBookingForm({
  values,
  onChange,
  canSubmit,
  onSubmit,
  submitting,
  selectedSummary,
  submitLabel = "Create booking",
}: PostsBookingFormProps) {
  return (
    <div className="rounded-md border p-4">
      <h3 className="text-base font-semibold">Booking details</h3>
      {selectedSummary ? <p className="mt-1 text-sm text-muted-foreground">{selectedSummary}</p> : null}

      <div className="grid gap-4 py-3">
        <div className="grid gap-2">
          <Label htmlFor="posts-company-name">Company name</Label>
          <Input
            id="posts-company-name"
            value={values.companyName}
            onChange={(event) => onChange({ ...values, companyName: event.target.value })}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="posts-customer-email">Customer email</Label>
          <Input
            id="posts-customer-email"
            type="email"
            value={values.customerEmail}
            onChange={(event) => onChange({ ...values, customerEmail: event.target.value })}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="posts-order-ref">Order reference</Label>
          <Input
            id="posts-order-ref"
            value={values.orderRef}
            onChange={(event) => onChange({ ...values, orderRef: event.target.value })}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="posts-internal-note">Internal note (optional)</Label>
          <Input
            id="posts-internal-note"
            value={values.internalNote}
            onChange={(event) => onChange({ ...values, internalNote: event.target.value })}
          />
        </div>
      </div>

      <Button type="button" onClick={onSubmit} disabled={submitting || !canSubmit}>
        {submitting ? "Creating..." : submitLabel}
      </Button>
    </div>
  );
}
