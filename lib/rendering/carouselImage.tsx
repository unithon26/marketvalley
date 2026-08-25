import "server-only";

import { ImageResponse } from "next/og";

import {
  carouselCoverAssets,
  carouselFileNames,
  getCarouselCardCopy,
  splitCarouselHighlight,
} from "@/components/renderers/carousel-card";
import type { CampaignSpec } from "@/lib/contracts/campaign";
import type { MetaPngAsset } from "@/lib/meta/contracts";

const width = 1080;
const height = 1350;
const maximumCoverBytes = 2 * 1024 * 1024;

type RenderOptions = {
  coverDataUrl?: string | null;
};

function highlighted(text: string, accentColor: string) {
  const copy = splitCarouselHighlight(text);
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {copy.before ? <span>{copy.before}</span> : null}
      <span style={{ color: accentColor }}>{copy.highlight}</span>
      {copy.after ? <span>{copy.after}</span> : null}
    </span>
  );
}

function background(spec: CampaignSpec, coverDataUrl: string | null | undefined) {
  return (
    <div style={{ display: "flex", position: "absolute", inset: 0 }}>
      {coverDataUrl ? (
        // Satori accepts data URLs for deterministic server-rendered assets.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverDataUrl}
          alt=""
          width={width}
          height={height}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: `linear-gradient(145deg, ${spec.brand.primaryColor}, #111318 72%)`,
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(11,12,16,.28), rgba(11,12,16,.9))",
        }}
      />
    </div>
  );
}

export function renderCarouselImageResponse(
  spec: CampaignSpec,
  index: number,
  options: RenderOptions = {},
): ImageResponse {
  if (!Number.isInteger(index) || index < 0 || index > 4) {
    throw new Error("carousel image index must be between 0 and 4");
  }
  const copy = getCarouselCardCopy(spec, index);
  const accent = spec.brand.accentColor;
  const usePhoto = spec.templates.carouselCover !== "cover-31";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: usePhoto ? "#111318" : "#ffffff",
          color: usePhoto ? "#ffffff" : spec.brand.primaryColor,
          padding: index === 0 ? "104px 84px 88px" : "82px 78px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {usePhoto ? background(spec, options.coverDataUrl) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: -1,
              opacity: .9,
            }}
          >
            <span>{index === 0 ? spec.project.category : copy.kicker}</span>
            <span>{String(index + 1).padStart(2, "0")}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
              maxWidth: 900,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: index === 0 ? 72 : 68,
                fontWeight: 900,
                lineHeight: 1.14,
                letterSpacing: -4,
              }}
            >
              {highlighted(copy.headline, accent)}
            </div>
            {index === 0 && spec.templates.carouselCover === "cover-32" ? (
              <div
                style={{
                  display: "flex",
                  marginTop: 34,
                  fontSize: 42,
                  fontWeight: 800,
                  lineHeight: 1.2,
                  letterSpacing: -2,
                }}
              >
                {highlighted(spec.messaging.valueProposition, accent)}
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                marginTop: 42,
                maxWidth: 880,
                fontSize: 30,
                fontWeight: 500,
                lineHeight: 1.55,
                letterSpacing: -1,
                opacity: .92,
              }}
            >
              {copy.body}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              borderTop: `2px solid ${usePhoto ? "rgba(255,255,255,.28)" : "rgba(25,31,40,.16)"}`,
              paddingTop: 30,
              fontSize: 26,
            }}
          >
            <span style={{ fontWeight: 800 }}>{spec.project.name}</span>
            <span style={{ opacity: .72 }}>marketvalley campaign</span>
          </div>
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "image/png",
      },
    },
  );
}

async function loadCoverDataUrl(
  spec: CampaignSpec,
  origin: string,
  fetchImplementation: typeof fetch,
): Promise<string | null> {
  const path = carouselCoverAssets[spec.templates.carouselCover];
  if (!path) return null;
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin) throw new Error("carousel asset origin mismatch");
  const response = await fetchImplementation(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "image/png") return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maximumCoverBytes) return null;
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function renderCampaignCarouselPngAssets(options: {
  spec: CampaignSpec;
  origin: string;
  fetchImplementation?: typeof fetch;
}): Promise<MetaPngAsset[]> {
  const coverDataUrl = await loadCoverDataUrl(
    options.spec,
    options.origin,
    options.fetchImplementation ?? fetch,
  );
  return Promise.all(Array.from({ length: 5 }, async (_, index) => {
    const response = renderCarouselImageResponse(options.spec, index, { coverDataUrl });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      filename: carouselFileNames[index],
      contentType: "image/png" as const,
      bytes,
    };
  }));
}
