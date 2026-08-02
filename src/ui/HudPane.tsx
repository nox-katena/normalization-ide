import {Box, Text} from 'ink';
import type {EnhancementStatus} from '../domain/enhancement-flow.js';
import {getStarforceRate} from '../domain/starforce-rates.js';
import type {PythonSyntaxDiagnostic} from '../runtime/python-syntax.js';

const UNLOCK_NAMES = new Map<number, string>([
  [3, '줄 번호'],
  [5, 'Backspace'],
  [7, '공백 입력'],
  [10, 'Ctrl+Z Undo'],
  [12, 'Python 실행'],
  [15, '파일 저장'],
  [17, 'Python 구문 오류 표시'],
  [20, 'Syntax highlighting'],
  [22, 'Git commit'],
  [25, 'Vim 편집 기능'],
]);

const STRETCH_UNLOCKS = [17, 20, 22, 25] as const;

export interface HudPaneProps {
  readonly status: EnhancementStatus;
  readonly syntaxCheck?: SyntaxCheckStatus;
}

export type SyntaxCheckStatus =
  | {readonly status: 'locked' | 'checking' | 'valid'}
  | {readonly status: 'invalid'; readonly diagnostic: PythonSyntaxDiagnostic}
  | {readonly status: 'error'; readonly message: string};

export function HudPane({
  status,
  syntaxCheck = status.unlocks.pythonSyntax
    ? {status: 'checking'}
    : {status: 'locked'},
}: HudPaneProps) {
  const rate = getStarforceRate(status.stars);
  const nextStars = status.stars === 25 ? 'MAX' : `${status.stars + 1}성`;
  const nextUnlock =
    status.nextUnlockStars === null
      ? '모든 해금 단계 달성'
      : `${status.nextUnlockStars}성 ${UNLOCK_NAMES.get(status.nextUnlockStars) ?? '추가 기능'}`;

  return (
    <Box borderStyle="round" flexDirection="column">
      <Text bold>STARFORCE HUD</Text>
      <Text>
        현재/다음 별: {status.stars}성 → {nextStars}
      </Text>
      <Text>강화권: {status.enhancementTickets}장</Text>
      <Text>
        확률: 성공 {rate?.success ?? 0}% · 실패 {rate?.failure ?? 0}% · 파괴{' '}
        {rate?.destruction ?? 0}%
      </Text>
      <Text>다음 해금: {nextUnlock}</Text>
      <Text>
        직접 입력: {status.totalDirectInputs}타 · 현재 문자: {status.currentGraphemes}자
      </Text>
      <Text>
        소실: 실패 {status.failureLostGraphemes}자 · 파괴{' '}
        {status.destructionLostGraphemes}자
      </Text>
      <Text>생산성: {formatPercent(status.productivityPercent)}%</Text>
      <Text>17~25성 해금 예정:</Text>
      {STRETCH_UNLOCKS.map((stars) => (
        <Text key={stars}>
          {status.stars >= stars ? '[해금]' : '[잠금]'} {stars}성{' '}
          {UNLOCK_NAMES.get(stars)}
        </Text>
      ))}
      {status.unlocks.pythonSyntax ? (
        <Text
          {...(syntaxCheck.status === 'invalid' ? {color: 'red'} : {})}
        >
          {formatSyntaxCheck(syntaxCheck)}
        </Text>
      ) : null}
    </Box>
  );
}

function formatPercent(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

function formatSyntaxCheck(syntaxCheck: SyntaxCheckStatus): string {
  switch (syntaxCheck.status) {
    case 'checking':
      return 'Python 구문 검사: 검사 중...';
    case 'valid':
      return 'Python 구문 검사: 오류 없음';
    case 'invalid':
      return `Python 구문 오류: ${syntaxCheck.diagnostic.line}행 ${syntaxCheck.diagnostic.column}열 · ${syntaxCheck.diagnostic.message}`;
    case 'error':
      return `Python 구문 검사 실패: ${syntaxCheck.message}`;
    case 'locked':
      return '';
  }
}
