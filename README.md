# Ruinfall

Ruinfall은 덱빌딩 탐험 게임입니다. 적을 쓰러뜨리고, 카드를 수집하세요. 발견한 덱에서 카드를 추출하고, 자신만의 덱을 만드세요. 여러 개의 덱을 준비하고 더 깊은 곳으로 내려가, 세계의 비밀을 밝혀내세요. 그 끝에서, 당신은 별에 닿을 수 있을까요?

- 공개 게임: https://dhwangdo.github.io/ruinfall/
- 현재 상태와 다음 작업: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- 구현된 게임 규칙: [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md)
- Python 사용자를 위한 코드 설명: [`docs/CODE_GUIDE.md`](docs/CODE_GUIDE.md)

## 로컬 실행

Node.js `22.13.0` 이상이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 이 주소는 개발 서버를 실행 중인 컴퓨터에서 사용하는 로컬 주소입니다.

## 검사

```bash
npm run lint
npm test
$env:GITHUB_ACTIONS='true'; npm run build:pages
```

- `npm run lint`: TypeScript와 React 코드 정적 검사
- `npm test`: 프로덕션 빌드와 첫 화면 서버 렌더링 검사
- `npm run build:pages`: GitHub Pages용 정적 사이트 생성

현재 게임은 데이터베이스나 외부 저장소를 사용하지 않으므로 브라우저를 새로고침하면 진행 상태가 초기화됩니다.
