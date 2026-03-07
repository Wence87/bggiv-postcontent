import { BrandHeader } from "@/components/BrandHeader";
import { SubmitPageClient } from "@/components/submit/SubmitPageClient";

type SubmitPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SubmitPage({ searchParams }: SubmitPageProps) {
  const params = await searchParams;
  const tokenValue = params.token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue;
  const diagValue = params.diag;
  const diag = (Array.isArray(diagValue) ? diagValue[0] : diagValue) === "1";

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-12">
      <header className="mb-6">
        <BrandHeader
          title="Complete Submission"
          subtitle="Reserve your slot and submit your content."
        />
      </header>

      {!token ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Missing token in URL.
        </div>
      ) : (
        <SubmitPageClient token={token} diag={diag} />
      )}
    </main>
  );
}
