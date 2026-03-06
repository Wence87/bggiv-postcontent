import Image from "next/image";

type BrandHeaderProps = {
  title: string;
  subtitle: string;
};

export function BrandHeader({ title, subtitle }: BrandHeaderProps) {
  return (
    <div className="flex items-start gap-3 sm:items-center sm:gap-4">
      <div className="shrink-0">
        <Image
          src="/brand/BoardGameGiveaways-Sigle.png"
          alt="Board Game Giveaways"
          width={56}
          height={56}
          className="h-12 w-12 object-contain sm:h-14 sm:w-14"
          priority
        />
      </div>
      <div className="leading-tight">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
