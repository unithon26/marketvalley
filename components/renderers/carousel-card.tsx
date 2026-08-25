import type { CampaignSpec } from "@/lib/contracts/campaign";
import { campaignThemeStyle } from "@/lib/brand-theme";

export const carouselFileNames = [
  "01-hook.png",
  "02-problem.png",
  "03-insight.png",
  "04-solution.png",
  "05-cta.png",
] as const;

export const carouselCoverAssets: Partial<Record<CampaignSpec["templates"]["carouselCover"], string>> = {
  "cover-32": "/figma-templates/cover-32.jpg",
  "cover-34": "/figma-templates/cover-34.jpg",
};

function cardCopy(spec: CampaignSpec, index: number) {
  switch (index) {
    case 0: return { kicker: "첫 시장 반응 전에", headline: spec.messaging.hooks[0], body: spec.carousel.hookBody };
    case 1: return { kicker: "반복되는 제작 업무", headline: spec.carousel.problem.headline, body: spec.carousel.problem.body };
    case 2: return { kicker: "검증의 핵심", headline: spec.carousel.insight.headline, body: spec.carousel.insight.body };
    case 3: return { kicker: "하나의 캠페인", headline: spec.messaging.valueProposition, body: spec.carousel.solutionBody };
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

function CarouselCover({ spec }: { spec: CampaignSpec }) {
  const template = spec.templates.carouselCover;
  const headline = splitHighlight(spec.messaging.hooks[0]);
  const headlineLength = spec.messaging.hooks[0].length;
  const bodyLength = spec.carousel.hookBody.length;
  const copyClasses = [
    "carousel-cover-copy",
    headlineLength > 54 ? "has-extra-long-headline" : headlineLength > 36 ? "has-long-headline" : "",
    bodyLength > 130 ? "has-extra-long-body" : bodyLength > 90 ? "has-long-body" : "",
    spec.project.oneLiner.length > 80 ? "has-long-eyebrow" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      {template !== "cover-31" && <div className="carousel-cover-photo" aria-hidden="true" />}
      {template !== "cover-31" && <div className="carousel-cover-overlay" aria-hidden="true" />}
      <div className={copyClasses}>
        <span className="carousel-cover-eyebrow">{spec.project.oneLiner}</span>
        <h2>
          {headline.before && <span>{headline.before} </span>}
          <mark>{headline.highlight}</mark>
          {headline.after && <span> {headline.after}</span>}
        </h2>
        <p>{spec.carousel.hookBody}</p>
      </div>
    </>
  );
}

export function CarouselCard({ spec, index, exportRef }: { spec: CampaignSpec; index: number; exportRef?: (node: HTMLDivElement | null) => void }) {
  const copy = cardCopy(spec, index);
  const coverTemplate = spec.templates.carouselCover;
  return (
    <div
      ref={exportRef}
      className={`carousel-card carousel-card-${index + 1} carousel-cover-template-${coverTemplate}`}
      style={campaignThemeStyle(spec.brand)}
      data-brand-tone={spec.brand.tone}
      data-carousel-cover-template={coverTemplate}
    >
      {index === 0 ? <CarouselCover spec={spec} /> : (
        <>
          <div className="carousel-grain" />
          <div className="carousel-index">0{index + 1}</div>
          <div className="carousel-content">
            <span>{copy.kicker}</span>
            <h2>{copy.headline}</h2>
            <p>{copy.body}</p>
          </div>
          <div className="carousel-shape"><i /><i /></div>
          <footer><strong>{spec.project.name}</strong><span>marketvalley campaign</span></footer>
        </>
      )}
    </div>
  );
}
