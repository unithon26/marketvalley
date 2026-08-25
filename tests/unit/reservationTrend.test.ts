import { describe, expect, it } from "vitest";

import {
  buildReservationTrendGeometry,
  formatReservationTime,
} from "@/components/campaign-report";
import type { ReservationRecord } from "@/lib/contracts/repository";

function reservation(id: string, reservedAt: string): ReservationRecord {
  return { id, name: id, email: `${id}@example.com`, reservedAt };
}

describe("reservation trend geometry", () => {
  it("서버와 브라우저 로캘에 의존하지 않는 한국 시간 문자열을 만든다", () => {
    expect(formatReservationTime("2026-08-24T09:00:00.000Z")).toBe("8. 24. 18:00");
    expect(formatReservationTime("invalid-date")).toBe("시간 확인 필요");
  });

  it("예약 사이의 실제 시간 간격을 x축 간격에 반영한다", () => {
    const geometry = buildReservationTrendGeometry([
      reservation("first", "2026-08-25T00:00:00.000Z"),
      reservation("soon", "2026-08-25T00:10:00.000Z"),
      reservation("later", "2026-08-25T02:00:00.000Z"),
    ]);

    const firstGap = geometry.points[1].x - geometry.points[0].x;
    const secondGap = geometry.points[2].x - geometry.points[1].x;
    expect(secondGap).toBeGreaterThan(firstGap * 5);
    expect(geometry.line).toContain(`H${geometry.points[1].x} V${geometry.points[1].y}`);
  });

  it("예약이 없으면 점을 만들지 않고 기준선만 그린다", () => {
    const geometry = buildReservationTrendGeometry([]);

    expect(geometry.points).toEqual([]);
    expect(geometry.line).toContain("H696");
  });
});
