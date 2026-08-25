import type { Metadata } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: "개인정보 처리방침 — Market Valley",
  description: "Market Valley의 개인정보 수집·이용과 삭제 요청 방법을 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <div className="privacy-shell">
      <header className="privacy-header">
        <Link href="/" className="brand" aria-label="marketvalley 홈">
          <BrandLogo priority />
        </Link>
      </header>
      <main className="privacy-main">
        <article className="privacy-card">
          <p className="privacy-kicker">PRIVACY POLICY</p>
          <h1>개인정보 처리방침</h1>
          <p className="privacy-effective">시행일: 2026년 8월 26일</p>
          <p>
            Market Valley 프로젝트 팀은 시장검증 광고 생성, 캠페인 관리와 사전예약 접수에
            필요한 범위에서만 정보를 처리합니다.
          </p>

          <section>
            <h2>1. 처리하는 정보</h2>
            <ul>
              <li>Google 로그인: 계정 식별자, 이름, 이메일과 로그인 세션</li>
              <li>캠페인 생성: 사용자가 입력한 제품 배경·아이디어·해결책과 생성 결과</li>
              <li>사전예약: 이름, 이메일, 수집 동의 여부·시각과 해당 캠페인 식별자</li>
              <li>안전한 운영: 요청 시각, 오류와 악용 방지에 필요한 최소 기술 정보</li>
            </ul>
          </section>

          <section>
            <h2>2. 이용 목적</h2>
            <ul>
              <li>로그인 사용자 확인, 캠페인 소유권 보호와 광고 초안 생성</li>
              <li>동의 기반 사전예약 명단 제공과 후속 안내</li>
              <li>중복 제출·자동화된 악용 방지, 장애 대응과 서비스 안정성 확보</li>
            </ul>
          </section>

          <section>
            <h2>3. 보관과 삭제</h2>
            <p>
              정보는 위 목적을 달성하는 동안 보관하고, 삭제 요청이나 서비스 종료 시 지체 없이
              삭제합니다. 관계 법령상 보관 의무가 있는 경우에는 해당 기간에 한해 분리 보관할 수
              있습니다. 브라우저의 인증 쿠키는 로그아웃하거나 유효기간이 끝나면 더 이상 사용되지
              않습니다.
            </p>
          </section>

          <section>
            <h2>4. 외부 서비스 이용</h2>
            <p>
              서비스 제공을 위해 Vercel(웹 호스팅), Supabase(인증·데이터베이스), Anthropic
              (캠페인 문구 생성), Meta(승인된 광고 초안 생성)를 사용합니다. 사전예약자의 이름과
              이메일은 광고 문구 생성을 위해 Anthropic이나 Meta에 보내지 않습니다.
            </p>
          </section>

          <section>
            <h2>5. 이용자의 권리와 문의</h2>
            <p>
              본인 정보의 열람·정정·삭제 또는 처리 중지를 요청할 수 있습니다. 요청할 때 예약에
              사용한 이메일과 해당 캠페인을 알려주면 본인 확인 후 처리합니다.
            </p>
            <a
              className="privacy-contact"
              href="https://www.instagram.com/marketvalley__/"
              target="_blank"
              rel="noreferrer"
            >
              Market Valley 공식 Instagram으로 문의
            </a>
          </section>

          <section>
            <h2>6. 방침 변경</h2>
            <p>
              처리 항목이나 이용 목적이 달라지면 이 페이지에 변경 내용과 시행일을 공개합니다.
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
