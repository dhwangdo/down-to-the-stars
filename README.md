# Down to the Stars

솔리테어식 파일 조작, 덱빌딩 전투, 그리드 지도 탐험을 결합한 웹게임 프로토타입입니다.

- 공개 게임: https://dhwangdo.github.io/down-to-the-stars/
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
