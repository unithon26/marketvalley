import Image from "next/image";

export function BrandLogo({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      className="brand-logo"
      src="/brand/marketvalley-logo.svg"
      alt="market valley"
      width={200}
      height={30}
      priority={priority}
    />
  );
}
