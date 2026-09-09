# Codex 작업 지침

이 저장소에서 작업하기 전에 다음 문서를 순서대로 읽는다.

1. `docs/HANDOFF.md`
2. `docs/GAME_DESIGN.md`
3. `docs/CODE_GUIDE.md`

## 사용자와 소통하는 방법

- 사용자는 Python 문법과 수학적 사고에는 익숙하지만, TypeScript·React·웹 개발은 입문 단계다.
- 설명할 때 결과를 먼저 말하고, 필요한 경우 Python과 비교해 설명한다.
- 코드 용어를 쓰면 그 용어가 게임에서 무엇을 뜻하는지도 함께 말한다.
- 모호한 게임 규칙이 결과를 크게 바꿀 때만 짧게 질문한다. UI의 사소한 부분은 기존 스타일을 따라 합리적으로 구현한다.

## 구현 원칙

- 현재 제품 코드는 주로 `app/page.tsx`와 `app/globals.css`에 있다.
- 이미 삭제한 시스템인 카드 활성화/비활성화와 적 열정/각성을 임의로 되살리지 않는다.
- 코드가 아직 구현하지 않은 기획을 구현된 기능처럼 문서화하거나 보고하지 않는다.
- 사용자의 기존 변경을 보존하고, 요청 범위 밖의 디자인과 규칙을 함부로 바꾸지 않는다.
- 큰 기능을 추가할 때는 가능하면 데이터, 게임 규칙, 화면 표현을 작은 파일 또는 함수로 분리한다. 현재의 거대한 `page.tsx`를 더 키우기 전에 분리를 검토한다.
- 브라우저 새로고침 시 상태가 초기화되는 현재 구조를 기억한다. 저장 기능이 필요하면 별도 설계가 필요하다.

## 확인 명령

변경 규모에 맞게 다음을 실행한다.

```bash
npm run lint
npm test
$env:GITHUB_ACTIONS='true'; npm run build:pages
```

- `npm run lint`는 정적 검사다.
- `npm test`는 Vinext 빌드와 서버 렌더링 검사를 수행한다.
- 마지막 명령은 GitHub Pages용 정적 빌드를 로컬에서 확인한다.

## GitHub와 배포

- 원격 저장소: `https://github.com/dhwangdo/down-to-the-stars`
- 공개 주소: `https://dhwangdo.github.io/down-to-the-stars/`
- `main`에 push하면 GitHub Actions가 Pages 배포를 시도한다.
- 최근 GitHub Actions 실행은 코드 오류가 아니라 runner `startup_failure`로 시작조차 못 한 사례가 있다. 배포 실패 시 코드 문제와 GitHub 인프라 문제를 구분해 보고한다.
- 한 덩어리의 작업이 완료되면 검사 후 commit/push한다. 빈 커밋을 반복해서 배포만 재시도하지 않는다.

