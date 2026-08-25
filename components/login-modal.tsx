"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function LoginModal({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") router.back();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [router]);

  return (
    <div className="login-modal-layer" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <button
        className="login-modal-backdrop"
        type="button"
        onClick={() => router.back()}
        aria-label="로그인 창 바깥 영역을 눌러 닫기"
      />
      <div className="login-modal-content">
        <button className="login-modal-close" type="button" aria-label="로그인 창 닫기" onClick={() => router.back()}>
          <span aria-hidden="true">×</span>
        </button>
        {children}
      </div>
    </div>
  );
}
