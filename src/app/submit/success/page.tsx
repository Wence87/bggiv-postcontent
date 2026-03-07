import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";

export default function SubmitSuccessPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <header className="mb-8">
        <BrandHeader
          title="Submission Received"
          subtitle="Your submission has been saved successfully."
        />
      </header>

      <section className="rounded-md border bg-white p-6">
        <p className="text-sm text-muted-foreground">
          Our team will review your submission and process it in WordPress.
        </p>
        <div className="mt-4">
          <Link href="https://boardgamegiveaways.com">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
