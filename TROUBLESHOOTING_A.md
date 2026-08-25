# 트러블슈팅 기록 (개발자 A)

## 2026-08-25 — `pnpm` 명령을 찾을 수 없음 (Windows, Git Bash / PowerShell)

- 증상: 로컬 QA를 위해 `pnpm dev`를 실행하려 했으나 Git Bash에서 `/usr/bin/bash: line 1: pnpm: command not found`, PowerShell에서도 `pnpm: The term 'pnpm' is not recognized...` 오류 발생. `package.json`의 `packageManager` 필드는 `pnpm@11.15.1`로 지정돼 있음
- 원인: 이 머신에 `pnpm`이 전역 설치돼 있지 않음. `node`/`npm`/`corepack`은 `C:\Program Files\nodejs\`에 있지만 `pnpm`은 없음
- 1차 시도 (실패): `corepack enable && corepack prepare pnpm@11.15.1 --activate` 실행 → `EPERM: operation not permitted, open 'C:\Program Files\nodejs\pnpx'`. 관리자 권한 없이 `Program Files` 아래에 쓰기가 막힘
- 해결: 전역 설치 대신 `npx --yes pnpm@11.15.1 dev`로 실행 — npx가 임시로 지정 버전 pnpm을 받아 실행하므로 `Program Files` 쓰기 권한이 필요 없음. `next dev`(Turbopack)가 정상적으로 `http://localhost:3000`에서 기동됨을 확인
- 참고: `pnpm-workspace.yaml`이 이 git 저장소(`marketvalley`) 상위 디렉터리(`unithon/`)에 있어서, Turbopack이 "ignored pnpm-workspace.yaml ... because it is outside the current Git repository" 경고를 띄움. 동작에는 영향 없음. 필요하면 `next.config.ts`에 `turbopack.root`를 명시해 경고를 없앨 수 있음 (이번 세션에서는 처리하지 않음)
- 재현 시 권장 조치: 관리자 권한 PowerShell에서 `corepack enable`을 먼저 시도하고, 그래도 안 되면 `npx pnpm@<버전> <스크립트>` 패턴으로 우회
