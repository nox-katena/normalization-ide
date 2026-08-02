# Ctrl+Star IDE

코드를 직접 입력해 강화권을 얻고, 강화에 실패하면 방금 작성한 코드가
사라지는 확률형 TUI 코드 편집기입니다.

```text
코드 10타 입력 → 강화권 1장 획득 → Tab → Space로 강화
             → 성공: 별 상승
             → 실패: 최근 직접 입력 10타 삭제
             → 파괴: 전체 코드 삭제 및 0성 초기화
```

## 요구사항

- macOS 또는 Linux 터미널
- Node.js 22 이상
- npm
- Python 3 (`Ctrl+R` 실행 기능을 사용할 경우)

버전을 확인합니다.

```bash
node --version
npm --version
python3 --version
```

## 설치

저장소를 복제하고 개발 의존성을 포함해 설치합니다.

```bash
git clone https://github.com/nox-katena/normalization-ide.git
cd normalization-ide
npm ci --include=dev
```

## 실행

편집할 Python 파일 경로 하나를 전달합니다.

```bash
npm start -- ./demo.py
```

## Portable launchers

These scripts run the app without requiring a global Node.js or npm install. On first
run they download Node.js 22 into `.starforce-runtime/`, install project dependencies
with that bundled npm, and then start the TUI.

```powershell
# Windows
.\scripts\starforce.cmd .\demo.py
```

```bash
# macOS or Linux
sh ./scripts/starforce.sh ./demo.py
```

Set `STARFORCE_NODE_VERSION` to override the bundled Node version.

파일이 아직 없어도 빈 버퍼로 실행됩니다. 앱은 15성에 도달하고 사용자가
`Ctrl+S`를 누르기 전까지 대상 파일을 생성하거나 수정하지 않습니다.

## 기본 플레이

1. 편집기에 코드를 직접 10타 입력합니다.
2. HUD에서 강화권이 1장 증가했는지 확인합니다.
3. `Tab`을 눌러 강화 버튼으로 포커스를 옮깁니다.
4. `Space`를 눌러 강화권 한 장을 사용합니다.
5. 성공, 실패 또는 파괴 결과와 코드·별·소실 통계 변화를 확인합니다.
6. `Tab`으로 편집기에 돌아가 반복합니다.

붙여넣기는 버퍼에 반영되지만 직접 입력 타수나 강화권을 늘리지 않습니다.

## 조작법

| 키 | 동작 | 해금 단계 |
|---|---|---:|
| 문자 입력 | 코드 입력 및 타수 누적 | 0성 |
| 방향키 | 커서 이동 | 0성 |
| `Tab` | 편집기와 강화 버튼 포커스 전환 | 0성 |
| 강화 버튼에서 `Space` | 강화권 한 장으로 강화 | 0성 |
| `Backspace` | 이전 문자 삭제 | 5성 |
| 편집기에서 `Space` | 공백 입력 | 7성 |
| `Ctrl+Z` | 앱 내부 사용자 편집 Undo | 10성 |
| `Ctrl+R` | 현재 버퍼를 임시 파일에서 Python으로 실행 | 12성 |
| `Ctrl+S` | 대상 Python 파일에 명시적으로 저장 | 15성 |
| `Ctrl+Q` | 종료 또는 변경 폐기 확인 | 0성 |
| `Ctrl+C` | 즉시 종료하고 터미널 상태 복원 | 0성 |

추가 기능으로 17성부터 Python 구문 오류 표시, 20성부터 Python syntax
highlighting이 해금됩니다. HUD에 표시되는 22성 Git commit과 25성 Vim 편집
기능은 현재 구현 범위에 포함되지 않습니다.

## 입력 및 강화 규칙

- 사용자에게 한 글자로 보이는 Unicode grapheme 하나를 1타로 계산합니다.
- 문자, 해금된 공백과 개행은 직접 입력 타수에 포함됩니다.
- 방향키, Backspace, 삭제, Undo와 단축키는 타수에 포함되지 않습니다.
- 직접 입력 누적 10타마다 강화권 한 장을 얻습니다.
- 성공하면 별이 1 오르고 코드는 유지됩니다.
- 일반 실패하면 별은 유지되고 최근 생존 직접 입력 문자 최대 10개가 사라집니다.
- 파괴되면 전체 인메모리 버퍼가 사라지고 0성으로 돌아갑니다.
- 최대 강화 단계는 25성입니다.

## 파일 안전과 복구

- 편집 내용은 명시적으로 저장하기 전까지 메모리와 앱 전용 임시 복구본에만
  기록됩니다.
- 15성 전에는 `Ctrl+S`가 잠겨 있어 대상 파일을 덮어쓸 수 없습니다.
- 12성 Python 실행은 대상 파일과 별도의 임시 `.py` 파일을 사용합니다.
- 저장하지 않은 변경이 있으면 다음 실행에서 복구본 적용 또는 폐기를 선택할
  수 있습니다.
- 정상 종료, 오류 및 `SIGINT`에서 raw mode, 커서와 alternate screen을
  복원합니다.

## 검증

타입 검사, 린트, 105개 테스트와 프로덕션 빌드를 한 번에 실행합니다.

```bash
npm run check
```

개별 명령도 사용할 수 있습니다.

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

제품 명세와 상세 성공 조건은 [`PRODUCT.md`](./PRODUCT.md)를 참고하세요.
