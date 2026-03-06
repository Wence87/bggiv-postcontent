import { PublicCalendar } from "@/components/public/PublicCalendar";
import { BrandHeader } from "@/components/BrandHeader";

export default function CalendarPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-12">
      <header className="mb-6">
        <BrandHeader
          title="Public Calendar"
          subtitle="Read-only availability overview for Sponsorship, Ads and Posts."
        />
      </header>

      <PublicCalendar />
    </main>
  );
}
