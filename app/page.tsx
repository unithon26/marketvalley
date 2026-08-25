import type { Metadata } from "next";

import { CampaignEntryLink } from "@/components/campaign-entry-link";
import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: "아이디어에서 첫 시장 반응까지 반복 업무를 없애는 시장검증 광고",
  description: "두 단계 입력으로 검증 가설, 공개 랜딩, 카드뉴스, 게시 준비 파일과 예약자명단을 한 흐름에서 준비합니다.",
};

const problems = [
  ["01", "검증 전에 제작 업무가\n먼저 쌓인다", "랜딩 기획, 문구 재작성, 카드 조판과 파일 정리를 채널마다 반복합니다."],
  ["02", "같은 아이디어를\n계속 다시 설명한다", "채널마다 고객·문제·해결 문구를 옮기며 서로 맞는지 다시 확인합니다."],
  ["03", "반응 취합이 끝나야\n판단을 시작한다", "공개 링크와 예약 반응을 따로 모으느라 재입력과 인계가 생깁니다."],
] as const;

const steps = [
  ["STEP 01", "아이디어를\n두 단계로 입력", "사업 배경과 솔루션을 한 번만 입력하면 검증 가설과 채널별 문구의 공통 근거가 됩니다."],
  ["STEP 02", "랜딩·카드·게시 파일을\n같은 계약에서 준비", "공개 랜딩, 카드뉴스 5장, 게시 문구와 Meta 게시 준비 ZIP을 하나의 광고 초안에서 만듭니다."],
  ["STEP 03", "예약 반응을 모아\n사람이 다음 행동 결정", "이름·이메일·동의를 받은 실제 예약자명단을 보고 계속, 수정, 보류 중 하나를 사람이 선택합니다."],
] as const;

const comparisons = [
  ["입력", "채널마다 다시 작성", "아이디어를 두 단계로 한 번 입력"],
  ["산출물", "랜딩·카드·문구를 따로 조판", "같은 광고 초안에서 함께 렌더링"],
  ["공개와 취합", "링크 발급과 반응 정리를 따로 처리", "공개 slug와 예약자명단으로 연결"],
  ["다음 행동", "산출물 정합성부터 다시 확인", "실제 예약 반응을 보고 사람이 판단"],
] as const;

function Check({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="랜딩페이지 메뉴">
        <div className={styles.navInner}>
          <a href="#top" className={styles.logo} aria-label="Market Valley 맨 위로">Market <em>Valley</em></a>
          <div className={styles.navMenu}><a href="#problem">문제</a><a href="#how">해결방식</a><a href="#report">리포트</a></div>
          <CampaignEntryLink className={styles.navCta}>검증 시작</CampaignEntryLink>
        </div>
      </nav>

      <section className={styles.hero} id="top">
        <div className={styles.container}>
          <span className={styles.eyebrow}>아이디어에서 실제 시장 반응까지</span>
          <h1 className={styles.heroTitle}>아이디어에서 사람의 판단까지,<br /><span>반복 제작을 지웁니다.</span></h1>
          <p className={styles.heroSub}>검증 가설, 공개 랜딩, 카드뉴스와 게시 파일을 한 번에 준비합니다.<br />사람은 <strong>고객을 만나고 다음 행동을 결정하는 일</strong>에 남습니다.</p>
          <div className={styles.heroCtas}>
            <CampaignEntryLink className={styles.primaryButton}>내 아이디어 검증하기 <span aria-hidden="true">→</span></CampaignEntryLink>
            <a href="#how" className={styles.ghostButton}>어떻게 하는 거예요?</a>
          </div>
          <div className={styles.trustList}><span><Check size={15} /> Meta 자동 집행 없음</span><span><Check size={15} /> 다음 행동은 사람이 결정</span></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`} id="problem">
        <div className={styles.container}>
          <header className={styles.sectionHeader}>
            <span className={styles.eyebrow}>{"// THE PROBLEM"}</span><h2>혹시 이런 적, 있으신가요?</h2>
            <p>첫 반응을 확인하기도 전에 제작·확인·재입력이 쌓입니다.<br /><strong>Market Valley는 고객을 만나기 전 반복 업무부터 없앱니다.</strong></p>
          </header>
          <div className={styles.cardGrid}>
            {problems.map(([number, title, body]) => <article className={styles.problemCard} key={number}><span className={styles.cardNumber}>{number}</span><h3>{title.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</h3><p>{body}</p></article>)}
          </div>
        </div>
      </section>

      <section className={styles.section} id="how">
        <div className={styles.container}>
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// THE METHOD"}</span><h2><em>반복 업무</em>가 사라지는 3단계</h2><p>하나의 입력과 광고 초안을 공개·취합·판단까지 이어 메시지 정합성과 파일 정리를 다시 하지 않습니다.</p></header>
          <div className={styles.cardGrid}>
            {steps.map(([number, title, body]) => <article className={styles.stepCard} key={number}><span>{number}</span><h3>{title.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</h3><p>{body}</p></article>)}
          </div>
          <div className={styles.promiseList}>{["결정적 renderer로 같은 메시지 유지", "외부 장애 시 명시적 실패와 fixture 전환", "한 흐름에서 예약 반응 확인"].map((promise) => <span key={promise}><Check /> {promise}</span>)}</div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`}>
        <div className={styles.container}>
          <header className={styles.sectionHeader}><h2>지금까지의 검증 vs <em>Market Valley 방식</em></h2></header>
          <div className={styles.compareTable} role="table" aria-label="시장 검증 방식 비교">
            <div className={styles.compareHead} role="row"><span>구분</span><span>기존 방식</span><span>Market Valley 방식</span></div>
            {comparisons.map(([label, oldValue, newValue]) => <div className={styles.compareRow} role="row" key={label}><span>{label}</span><span>{oldValue}</span><strong>{newValue}</strong></div>)}
          </div>
        </div>
      </section>

      <section className={styles.section} id="report">
        <div className={styles.container}>
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// DELIVERABLE"}</span><h2>실제 반응은 <em>이렇게만</em> 보여줍니다.</h2><p>연결하지 않은 성과 지표는 만들지 않습니다. 동의받아 접수한 예약과 사람이 선택한 다음 행동만 기록합니다.</p></header>
          <div className={styles.reportSample}>
            <div className={styles.reportResult}><span>→</span><small>사람의 다음 판단</small><strong>계속 · 수정 · 보류</strong></div>
            <div className={styles.metricGrid}>
              <article className={styles.metricCard}><div><span>예약자 수</span><strong>실제 접수만</strong></div><p>필수 이름·이메일·동의를 모두 받은 예약만 집계합니다.</p></article>
              <article className={styles.metricCard}><div><span>예약 추이</span><strong>접수 시각 기준</strong></div><p>임의 그래프 대신 저장된 예약 시각으로 누적 흐름을 만듭니다.</p></article>
              <article className={styles.metricCard}><div><span>Meta 성과</span><strong>계측 연결 전</strong></div><p>Insights를 연결하기 전에는 노출·클릭·CTR을 표시하지 않습니다.</p></article>
            </div>
            <h3 className={styles.tableTitle}>예약자명단 안전 경계</h3>
            <div className={styles.reservationTable}><div><strong>구분</strong><strong>저장·표시 원칙</strong></div><div><span>접수</span><span>이름 · 이메일 · 동의 필수</span></div><div><span>목록</span><span>이메일 마스킹</span></div><div><span>중복</span><span>같은 광고의 같은 이메일 차단</span></div></div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`}>
        <div className={styles.container}>
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// THE WORK REMOVED"}</span><h2>더 빠르게가 아니라, <em>더 이상 하지 않게</em></h2><p>기능 수가 아니라 실제로 없어지는 수작업과 남는 사람의 역할을 기준으로 설계했습니다.</p></header>
          <div className={styles.costGrid}>
            <article className={styles.costCard}><span>사라지는 일 01</span><strong>채널별 기획 재작성</strong><ul><li>같은 고객과 문제 다시 입력</li><li>랜딩·캐러셀 문구 따로 작성</li><li>CTA와 공개 주소 다시 맞추기</li></ul><b>하나의 광고 초안으로 통합</b></article>
            <article className={styles.costCard}><span>사라지는 일 02</span><strong>조판과 파일 정리</strong><ul><li>랜딩 구성 직접 조립</li><li>카드뉴스 5장 반복 배치</li><li>PNG·문구·URL 따로 묶기</li></ul><b>같은 renderer와 ZIP으로 자동 준비</b></article>
            <article className={`${styles.costCard} ${styles.featuredCost}`}><span>남는 사람의 역할</span><strong>관계와 책임의 판단</strong><ul><li>고객을 직접 만나기</li><li>OAuth·계정·예산·게시 승인</li><li>예약 반응 해석하기</li><li>계속 · 수정 · 보류 결정하기</li></ul><b>사람이 최종 책임을 유지</b></article>
          </div>
          <p className={styles.costPunch}>콘텐츠를 더 만드는 대신,<br /><strong>고객을 만나기 전 반복 업무를 없앱니다.</strong></p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.reserve}`} id="reserve">
        <div className={styles.narrow}>
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// START VALIDATION"}</span><h2>지금 <em>검증을 시작</em>하고,<br />먼저 숫자로 답을 아세요.</h2><p>아이디어를 두 단계로 입력하면 랜딩과 광고 소재가 바로 준비됩니다.</p></header>
          <div className={styles.startCard}><span className={styles.startIcon}>→</span><h3>첫 시장 반응을 확인할 준비가 됐나요?</h3><p>입력한 아이디어로 검증 가설, 공개 랜딩, 광고 소재를 한 번에 만듭니다.</p><CampaignEntryLink className={styles.primaryButton}>내 아이디어 검증 시작하기 →</CampaignEntryLink></div>
        </div>
      </section>

      <section className={styles.finalCta}><div className={styles.narrow}><h2>만드는 일을 반복하는 사람에서,<br /><em>고객을 만나 판단하는 사람</em>으로.</h2><p>없어진 일은 같은 입력에서 나온 공개 결과와 실제 예약 반응으로 보여드립니다.</p><CampaignEntryLink className={styles.finalButton}>내 아이디어 검증 시작하기 →</CampaignEntryLink></div></section>

      <footer className={styles.footer}><div className={styles.footerInner}><div><strong>Market <em>Valley</em></strong><p>아이디어에서 첫 시장 반응까지 반복 업무를 없앱니다.</p></div><span>UNITHON 2026</span></div></footer>
    </main>
  );
}
