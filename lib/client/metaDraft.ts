import { carouselFileNames } from "@/lib/contracts/carouselAssets";

function pngBlob(dataUrl: string): Blob {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u.exec(dataUrl);
  if (!match) throw new Error("meta_png_data_url_invalid");
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/png" });
}

/**
 * Client boundary: only campaign ID and five PNGs are sent. Bytes are caller-supplied;
 * the API relies on an internal-operator allowlist and validates PNG structure/dimensions,
 * but it cannot cryptographically prove that these bytes came from the renderer.
 */
export function createMetaDraftFormData(
  campaignId: string,
  pngDataUrls: readonly string[],
): FormData {
  if (pngDataUrls.length !== 5) throw new Error("meta_png_count_invalid");
  const formData = new FormData();
  formData.set("campaignId", campaignId);
  pngDataUrls.forEach((dataUrl, index) => {
    formData.set(`image${index}`, pngBlob(dataUrl), carouselFileNames[index]);
  });
  return formData;
}
