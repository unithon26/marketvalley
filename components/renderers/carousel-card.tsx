import type { CampaignSpec } from "@/lib/contracts/campaign";
import { carouselFileNames } from "@/lib/contracts/carouselAssets";
import { campaignThemeStyle } from "@/lib/brand-theme";

export { carouselFileNames };

export const carouselCoverAssets: Partial<Record<CampaignSpec["templates"]["carouselCover"], string>> = {
  "cover-32": "/figma-templates/cover-32-original.webp",
  "cover-34": "/figma-templates/cover-34-original.webp",
};

function cardCopy(spec: CampaignSpec, index: number) {
  switch (index) {
    case 0: return { kicker: "첫 시장 반응 전에", headline: spec.messaging.hooks[0], body: spec.carousel.hookBody };
    case 1: return { kicker: "반복되는 제작 업무", headline: spec.carousel.problem.headline, body: spec.carousel.problem.body };
    case 2: return { kicker: "검증의 핵심", headline: spec.carousel.insight.headline, body: spec.carousel.insight.body };
    case 3: return { kicker: "하나의 광고", headline: spec.messaging.valueProposition, body: spec.carousel.solutionBody };
    default: return { kicker: "다음 판단은 사람이", headline: spec.validation.signal.ctaLabel, body: spec.carousel.ctaBody };
  }
}

function splitHighlight(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length === 1) return { before: "", highlight: words[0], after: "" };

  const start = Math.min(Math.max(1, Math.floor(words.length / 2) - 1), words.length - 1);
  const end = Math.min(start + 2, words.length);
  return {
    before: words.slice(0, start).join(" "),
    highlight: words.slice(start, end).join(" "),
    after: words.slice(end).join(" "),
  };
}

function HighlightedText({ text }: { text: string }) {
  const copy = splitHighlight(text);
  return (
    <>
      {copy.before && <span>{copy.before} </span>}
      <mark>{copy.highlight}</mark>
      {copy.after && <span> {copy.after}</span>}
    </>
  );
}

function CarouselCover({ spec }: { spec: CampaignSpec }) {
  const template = spec.templates.carouselCover;
  const headlineLength = spec.messaging.hooks[0].length;
  const bodyLength = spec.carousel.hookBody.length;
  const copyClasses = [
    "carousel-cover-copy",
    headlineLength > 54 ? "has-extra-long-headline" : headlineLength > 36 ? "has-long-headline" : "",
    bodyLength > 130 ? "has-extra-long-body" : bodyLength > 90 ? "has-long-body" : "",
    spec.project.category.length > 40 ? "has-long-eyebrow" : "",
  ].filter(Boolean).join(" ");

  if (template === "cover-31") {
    return (
      <div className={copyClasses}>
        <h2><HighlightedText text={spec.messaging.hooks[0]} /></h2>
        <p>{spec.carousel.hookBody}</p>
      </div>
    );
  }

  return (
    <>
      <div className="carousel-cover-photo" aria-hidden="true" />
      <div className="carousel-cover-overlay" aria-hidden="true" />
      <div className={copyClasses}>
        {template === "cover-34" && <span className="carousel-cover-eyebrow">{spec.project.category}</span>}
        <h2><HighlightedText text={spec.messaging.hooks[0]} /></h2>
        {template === "cover-32" && (
          <h3><HighlightedText text={spec.messaging.valueProposition} /></h3>
        )}
        <p>{spec.carousel.hookBody}</p>
      </div>
    </>
  );
}

export function CarouselCard({
  spec,
  index,
  exportRef,
  preview = false,
}: {
  spec: CampaignSpec;
  index: number;
  exportRef?: (node: HTMLDivElement | null) => void;
  preview?: boolean;
}) {
  const copy = cardCopy(spec, index);
  const coverTemplate = spec.templates.carouselCover;
  return (
    <div
      ref={exportRef}
      className={`carousel-card ${preview ? `carousel-preview-render carousel-preview-render-${index + 1}` : `carousel-card-${index + 1}`} carousel-cover-template-${coverTemplate}`}
      style={campaignThemeStyle(spec.brand)}
      data-carousel-index={index + 1}
      data-brand-tone={spec.brand.tone}
      data-carousel-cover-template={coverTemplate}
      data-product-name={spec.project.name}
    >
      {index === 0 ? <CarouselCover spec={spec} /> : (
        <>
          {coverTemplate !== "cover-31" && <div className="carousel-cover-photo carousel-series-photo" aria-hidden="true" />}
          {coverTemplate !== "cover-31" && <div className="carousel-cover-overlay carousel-series-overlay" aria-hidden="true" />}
          <div className="carousel-index">0{index + 1}</div>
          <div className="carousel-content">
            <span>{copy.kicker}</span>
            <h2><HighlightedText text={copy.headline} /></h2>
            <p>{copy.body}</p>
          </div>
          <footer><strong>{spec.project.name}</strong><span>marketvalley campaign</span></footer>
        </>
      )}
    </div>
  );
}
