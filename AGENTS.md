# AGENTS.md

## 작업 원칙

- 작업을 시작하기 전에 `PRODUCT.md`, 이 파일, `tasks.yaml`의 대상 task를 끝까지 읽는다.
- 한 번에 정확히 한 task만 수행한다. 다음 task나 관련 없는 리팩터링을 함께 처리하지 않는다.
- `tasks.yaml`의 dependency가 모두 완료된 task만 시작한다.
- 사용자가 별도로 요청하지 않는 한 dependency를 추가, 제거, 교체하거나 버전을 변경하지 않는다.
- task의 목표와 acceptance criteria를 만족하는 최소 vertical slice와 해당 테스트만 구현한다.
- 완료를 보고하기 전에 대상 테스트와 `npm run check`를 모두 실행한다.
- 테스트를 삭제, skip, 완화하거나 의미가 약한 assertion으로 바꾸지 않는다.
- 검증 실패나 환경 문제를 숨기지 않는다. 실행한 명령, 결과, 남은 문제를 작업 기록에 남긴다.

## 프로젝트 명령

프로젝트 초기화와 패키지 설치는 구현 task 범위 밖에서 준비되어 있어야 한다. 표준 런타임은 Node.js 22 이상, TypeScript, React/Ink 기반 TUI, Vitest이며 Python 실행에는 로컬 `python3`를 사용한다.

```bash
# 개발용 TUI 실행
npm start -- ./demo.py

# 전체 테스트 1회 실행
npm test

# 테스트 watch
npm run test:watch

# 타입 검사
npm run typecheck

# 린트
npm run lint

# 프로덕션 빌드
npm run build

# 타입 검사, 린트, 테스트, 빌드를 포함한 완료 전 필수 검증
npm run check
```

task description에 더 좁은 검증 명령이 있으면 먼저 실행하고, 마지막에는 항상 `npm run check`를 실행한다.

## 디렉터리 구조

```text
.
├── PRODUCT.md                  # 변경하지 않는 제품 명세
├── tasks.yaml                  # 의존성 순서의 task 목록과 완료 상태
├── AGENTS.md                   # 작업 규칙
├── src/
│   ├── app.tsx                 # CLI 인자 처리와 TUI 진입점
│   ├── domain/
│   │   ├── game-state.ts       # 별, 강화권, 통계, 해금 상태
│   │   ├── starforce-engine.ts # RNG가 주입되는 강화 판정
│   │   └── starforce-rates.ts  # 버전과 출처가 고정된 정적 확률표
│   ├── editor/
│   │   ├── buffer.ts           # grapheme 기반 버퍼와 커서 연산
│   │   ├── history.ts          # 직접 입력 추적, 실패 역적용, 사용자 Undo
│   │   └── input-economy.ts    # 타수, 강화권, 생산성 계산
│   ├── persistence/
│   │   ├── file-store.ts       # 15성 명시적 대상 파일 저장
│   │   └── recovery-store.ts   # 앱 전용 임시 복구본
│   ├── runtime/
│   │   └── python-runner.ts    # 임시 파일 기반 python3 실행과 진단
│   └── ui/
│       ├── App.tsx             # 화면 조합과 포커스
│       ├── EditorPane.tsx      # 코드, 커서, 줄 번호, highlighting
│       ├── HudPane.tsx         # 강화 상태, 확률, 통계, 잠금 안내
│       └── ResultPane.tsx      # 최근 강화 및 Python 실행 결과
└── tests/
    ├── domain/                 # 강화 확률과 게임 상태 테스트
    ├── editor/                 # 편집, 타수, 실패 역적용, Undo 테스트
    ├── persistence/            # 대상 파일 불변성과 복구 테스트
    ├── runtime/                # Python 실행과 구문 검사 테스트
    ├── tui/                    # 렌더링, 키 입력, 해금 테스트
    └── e2e/                    # 단일 사용자 happy path
```

새 파일은 위 책임 경계에 둔다. 도메인과 편집 로직은 Ink 컴포넌트나 실제 터미널 없이 headless 테스트할 수 있어야 한다. UI는 파일 저장, 프로세스 실행, 난수 생성을 직접 수행하지 않고 주입된 계층을 호출한다.

## 수정 금지 영역

- `PRODUCT.md`와 `AGENTS.md`는 구현 task에서 수정하지 않는다.
- `.ralphy/config.yaml`, `.ralphy/preflight/**`, `PREFLIGHTS.md`, `SETUP_PROMPTS.md`, `ralph.environment.json`, `scripts/ralph-preflight.sh`는 수정하지 않는다.
- `src/domain/starforce-rates.ts`는 `core-02` 외 task에서 수정하지 않는다. 확률 변경은 별도 사용자 승인과 출처 갱신이 필요하다.
- 현재 task와 무관한 기존 코드, 테스트, snapshot, 설정, 문서는 수정하지 않는다.
- 사용자가 실행 인자로 지정한 `.py` 대상 파일은 15성 이후 사용자가 `Ctrl+S`를 누른 경우에만 애플리케이션이 수정할 수 있다.
- 구현 중 생성한 임시 Python 파일과 복구본은 OS의 앱 전용 임시 경로 밖에 두지 않는다.

`tasks.yaml`에서는 실제 구현과 전체 검증이 끝난 현재 task의 `completed`만 `false`에서 `true`로 바꿀 수 있다. task를 재정렬하거나 acceptance criteria를 축소하지 않는다.

## TUI 안전 규칙

- 마우스 입력을 구현하지 않는다. 키보드와 명시된 단축키만 사용한다.
- 편집기와 강화 버튼 포커스는 `Tab`으로 전환한다. 편집기 포커스의 `Space`와 강화 버튼 포커스의 `Space`를 혼동하지 않는다.
- `Ctrl+Z`는 10성 이후 앱 내부 Undo에만 사용하고 OS 또는 외부 편집기로 전달하지 않는다.
- `Ctrl+R`의 Python 실행은 대상 파일과 다른 임시 파일을 사용한다. 사용자 코드를 shell command 문자열에 보간하지 않는다.
- active TUI 위로 debug 로그나 구조화되지 않은 출력을 쓰지 않는다.
- 빈 상태, 작은 터미널, resize, 긴 줄, 여러 줄, Unicode 입력에서 화면과 상태가 손상되지 않아야 한다.
- 정상 종료, 취소, 오류, `SIGINT`에서 raw mode, alternate screen, 커서 가시성을 원상 복구한다.

## 완료 조건

task는 다음 조건을 모두 만족할 때만 완료다.

1. dependency가 완료되어 있다.
2. 목표와 acceptance criteria가 코드와 테스트로 충족된다.
3. 관련 headless 및 TUI 테스트가 통과한다.
4. 테스트를 삭제하거나 약화하지 않았다.
5. dependency를 임의로 변경하지 않았다.
6. `npm run check`가 성공한다.
7. 그 후에만 해당 task의 `completed`를 `true`로 변경한다.
