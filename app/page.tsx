import type { Metadata } from "next";

import { CampaignEntryLink } from "@/components/campaign-entry-link";
import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: "아이디어 검증 · 하루 안에 돈 되는지 숫자로 증명",
  description: "앱 만들기 전에 아이디어가 돈 되는지 하루 안에 검증합니다. 실제 타깃 고객을 찾아 돈 내는지 숫자로 확인해드립니다.",
};

const problems = [
  ["01", "앱을 만들었는데,\n아무도 안 썼다", "6개월 개발, 출시 첫 주 다운로드 12건. 뭐가 잘못된 걸까…"],
  ["02", "정부지원 서류 탈락,\n이유를 모르겠다", "아이템? 차별화? 피드백 한 줄 없이 떨어지니 다음 라운드도 막막하다."],
  ["03", "아이디어는 있는데,\n시작을 못 하겠다", "주변 반응은 좋은데, 진짜 돈 낼 사람이 있을지 모르겠다."],
] as const;

const steps = [
  ["STEP 01", "고객 언어로 번역된\n랜딩페이지 제작", "헤드라인·베네핏·CTA까지 전환율 중심으로 카피라이팅된 1페이지 랜딩. 당신의 아이디어가 고객에게 어떻게 팔릴지 번역해 드립니다."],
  ["STEP 02", "실제 타깃에게\n광고 집행", "인스타그램에 광고를 노출합니다. 복잡한 비즈니스 계정 세팅이나 픽셀 설치 없이 실제 고객 반응을 확인합니다."],
  ["STEP 03", "결제 의향까지\n숫자로 증명", "클릭률·체류시간·결제 클릭·사전예약을 측정해 돈 되는 아이디어인지 한 장의 리포트로 정리합니다."],
] as const;

const comparisons = [
  ["개발 기간", "3–6개월", "0일 (개발 안 함)"],
  ["총 비용", "1,000만원+", "29만원부터"],
  ["검증 결과", "아무도 안 써요…", "CTR 4.2%, 결제의향 12건"],
  ["다음 액션", "뭘 고쳐야 할지 모름", "숫자 근거로 Go / Stop 판단"],
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
          <h1 className={styles.heroTitle}>아이디어가 <span>돈이 되는지</span><br />하루만에 증명합니다.</h1>
          <p className={styles.heroSub}>실제 타깃 고객을 찾아 <strong>돈 내는지 확인</strong>해드립니다.<br />클릭률·결제 의향까지 <strong>숫자로 보여드립니다.</strong></p>
          <div className={styles.heroCtas}>
            <CampaignEntryLink className={styles.primaryButton}>내 아이디어 검증하기 <span aria-hidden="true">→</span></CampaignEntryLink>
            <a href="#how" className={styles.ghostButton}>어떻게 하는 거예요?</a>
          </div>
          <div className={styles.trustList}><span><Check size={15} /> 광고 계정 세팅 불필요</span><span><Check size={15} /> 개발 &amp; 디자인 지식 불필요</span></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`} id="problem">
        <div className={styles.container}>
          <header className={styles.sectionHeader}>
            <span className={styles.eyebrow}>{"// THE PROBLEM"}</span><h2>혹시 이런 적, 있으신가요?</h2>
            <p>창업가 대부분은 같은 실수를 합니다. 공통점은 하나 —<br /><strong>고객이 진짜 돈 낼지 확인하지 않은 채, 많은 시간과 돈을 먼저 써버린다는 것.</strong></p>
          </header>
          <div className={styles.cardGrid}>
            {problems.map(([number, title, quote]) => <article className={styles.problemCard} key={number}><span className={styles.cardNumber}>{number}</span><h3>{title.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</h3><blockquote>“{quote}”</blockquote></article>)}
          </div>
        </div>
      </section>

      <section className={styles.section} id="how">
        <div className={styles.container}>
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// THE METHOD"}</span><h2>우리는 <em>3단계</em>로 답을 드립니다.</h2><p>아이디어를 고객 언어로 번역한 랜딩과 광고 소재로 만들고, 실제 타깃에게 노출해 지갑을 여는지 추적합니다.</p></header>
          <div className={styles.cardGrid}>
            {steps.map(([number, title, body]) => <article className={styles.stepCard} key={number}><span>{number}</span><h3>{title.split("\n").map((line) => <span key={line}>{line}<br /></span>)}</h3><p>{body}</p></article>)}
          </div>
          <div className={styles.promiseList}>{["광고 계정 세팅 불필요", "개발·디자인 지식 불필요", "한 흐름에서 결과 리포트 확인"].map((promise) => <span key={promise}><Check /> {promise}</span>)}</div>
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
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// DELIVERABLE"}</span><h2>이런 <em>리포트</em>를 받습니다.</h2><p>노출·클릭·체류·예약까지. 추측 말고 숫자로 판단할 수 있는 한 장의 증거.</p></header>
          <div className={styles.reportSample}>
            <div className={styles.reportResult}><span><Check /></span><small>검증 결과</small><strong>시장성 우수</strong></div>
            <div className={styles.metricGrid}>
              <article className={styles.metricCard}><div><span>노출 수</span><strong>4,312<small>회</small></strong></div><svg viewBox="0 0 260 64" aria-label="노출 수 증가 막대 그래프">{[20, 28, 24, 36, 42, 38, 50, 58].map((height, index) => <rect key={index} x={8 + index * 32} y={62 - height} width="22" height={height} rx="4" />)}</svg></article>
              <article className={styles.metricCard}><div><span>CTR</span><strong>3.8%</strong></div><div className={styles.benchmark}><p><span>우리</span><i><b style={{ width: "100%" }} /></i><strong>3.8%</strong></p><p><span>업계</span><i><b style={{ width: "50%" }} /></i><strong>1.9%</strong></p></div></article>
              <article className={styles.metricCard}><div><span>예약률</span><strong>25%</strong></div><div className={styles.donutWrap}><span className={styles.donut}>+15%p</span><p>업계 평균<br /><strong>10%</strong></p></div></article>
            </div>
            <h3 className={styles.tableTitle}>예약자 리스트</h3>
            <div className={styles.reservationTable}><div><strong>No</strong><strong>이메일</strong></div>{["seon****@gmail.com", "minj****@naver.com", "yjki****@gmail.com", "haru****@kakao.com"].map((email, index) => <div key={email}><span>{index + 1}</span><span>{email}</span></div>)}</div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.alt}`}>
        <div className={styles.container}>
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// THE REAL COST"}</span><h2>“실패한 앱 하나”의 <em>진짜 가격</em></h2><p>당신이 고민하는 29만원은, 무엇을 막아주는 돈일까요?</p></header>
          <div className={styles.costGrid}>
            <article className={styles.costCard}><span>MVP 외주 개발 비용</span><strong>2,000~5,000<small>만원</small></strong><ul><li>풀스택 개발 3~6개월</li><li>계속 미뤄지는 일정</li><li>출시해도 시장 반응은 미지수</li><li>실패 시 회수 불가</li></ul><b>시장 검증 ✕</b></article>
            <article className={styles.costCard}><span>혼자 개발 시 기회비용</span><strong>3,000<small>만원</small></strong><ul><li>6개월 풀타임 몰입</li><li>월 500만원 급여 기회 손실</li><li>아무도 안 쓰는 리스크</li><li>번아웃 리스크까지</li></ul><b>시장 검증 ✕</b></article>
            <article className={`${styles.costCard} ${styles.featuredCost}`}><span>Market Valley 시장 검증</span><strong>29<small>만원</small></strong><ul><li>하루 안에 시장검증</li><li>실제 타깃에게 광고 집행</li><li>결제 의향까지 숫자로 증명</li><li>Go / Stop / Pivot 판단 근거</li></ul><b>숫자로 검증 ✓</b></article>
          </div>
          <p className={styles.costPunch}><del>수천만 원짜리 리스크</del>를,<br /><strong>29만 원짜리 보험</strong>으로 바꿉니다.</p>
        </div>
      </section>

      <section className={`${styles.section} ${styles.reserve}`} id="reserve">
        <div className={styles.narrow}>
          <header className={styles.sectionHeader}><span className={styles.eyebrow}>{"// START VALIDATION"}</span><h2>지금 <em>검증을 시작</em>하고,<br />먼저 숫자로 답을 아세요.</h2><p>아이디어를 두 단계로 입력하면 랜딩과 광고 소재가 바로 준비됩니다.</p></header>
          <div className={styles.startCard}><span className={styles.startIcon}>→</span><h3>첫 시장 반응을 확인할 준비가 됐나요?</h3><p>입력한 아이디어로 검증 가설, 공개 랜딩, 광고 소재를 한 번에 만듭니다.</p><CampaignEntryLink className={styles.primaryButton}>내 아이디어 검증 시작하기 →</CampaignEntryLink></div>
        </div>
      </section>

      <section className={styles.finalCta}><div className={styles.narrow}><h2>지금 이 순간에도 누군가는 <em>6개월</em> 동안<br />팔리지도 않을 제품에 <em>수천만원</em>을 들여<br />개발하고 있을지 모릅니다.</h2><p>먼저 숫자로 답을 아는 쪽이 이깁니다.</p><CampaignEntryLink className={styles.finalButton}>내 아이디어 검증 시작하기 →</CampaignEntryLink></div></section>

      <footer className={styles.footer}><div className={styles.footerInner}><div><strong>Market <em>Valley</em></strong><p>아이디어 검증 · 하루 안에 숫자로</p></div><a href="mailto:support@marketvalley.com">support@marketvalley.com</a></div></footer>
    </main>
  );
}
