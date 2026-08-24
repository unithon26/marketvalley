import type { CampaignSpec } from "@/lib/contracts/campaign";
import { campaignThemeStyle } from "@/lib/brand-theme";

export const carouselFileNames = [
  "01-hook.png",
  "02-problem.png",
  "03-insight.png",
  "04-solution.png",
  "05-cta.png",
] as const;

function cardCopy(spec: CampaignSpec, index: number) {
  switch (index) {
    case 0: return { kicker: "첫 시장 반응 전에", headline: spec.messaging.hooks[0], body: spec.carousel.hookBody };
    case 1: return { kicker: "반복되는 제작 업무", headline: spec.carousel.problem.headline, body: spec.carousel.problem.body };
    case 2: return { kicker: "검증의 핵심", headline: spec.carousel.insight.headline, body: spec.carousel.insight.body };
    case 3: return { kicker: "하나의 캠페인", headline: spec.messaging.valueProposition, body: spec.carousel.solutionBody };
    default: return { kicker: "다음 판단은 사람이", headline: spec.validation.signal.ctaLabel, body: spec.carousel.ctaBody };
  }
}

export function CarouselCard({ spec, index, exportRef }: { spec: CampaignSpec; index: number; exportRef?: (node: HTMLDivElement | null) => void }) {
  const copy = cardCopy(spec, index);
  return (
    <div ref={exportRef} className={`carousel-card carousel-card-${index + 1}`} style={campaignThemeStyle(spec.brand)} data-brand-tone={spec.brand.tone}>
      <div className="carousel-grain" />
      <div className="carousel-index">0{index + 1}</div>
      <div className="carousel-content">
        <span>{copy.kicker}</span>
        <h2>{copy.headline}</h2>
        <p>{copy.body}</p>
      </div>
      <div className="carousel-shape"><i /><i /></div>
      <footer><strong>{spec.project.name}</strong><span>marketvalley campaign</span></footer>
    </div>
  );
}
