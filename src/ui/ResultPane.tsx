import {Box, Text} from 'ink';
import type {RecentEnhancement} from '../domain/enhancement-flow.js';
import type {PythonRunResult} from '../runtime/python-runner.js';

const RESULT_NAMES: Record<RecentEnhancement['result'], string> = {
  success: '성공',
  failure: '실패',
  destroyed: '파괴',
};

export interface ResultPaneProps {
  readonly recent: RecentEnhancement | null;
  readonly message: string;
  readonly pythonResult?: PythonRunResult | null;
  readonly dimmed?: boolean;
}

export function ResultPane({
  recent,
  message,
  pythonResult = null,
  dimmed = false,
}: ResultPaneProps) {
  const recentText =
    recent === null
      ? '없음'
      : `${RESULT_NAMES[recent.result]} (${recent.starsBefore}성 → ${recent.starsAfter}성)`;

  return (
    <Box borderStyle="round" borderDimColor={dimmed} flexDirection="column">
      <Text dimColor={dimmed}>최근 결과: {recentText}</Text>
      <Text color="yellow" dimColor={dimmed}>HUD: {message}</Text>
      {pythonResult === null ? null : (
        <Box flexDirection="column">
          <Text dimColor={dimmed}>표준 출력: {formatOutput(pythonResult.stdout)}</Text>
          <Text dimColor={dimmed}>표준 오류: {formatOutput(pythonResult.stderr)}</Text>
          <Text dimColor={dimmed}>
            종료 코드:{' '}
            {pythonResult.exitCode === null
              ? '없음 (비정상 종료)'
              : pythonResult.exitCode}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function formatOutput(output: string): string {
  return output.length === 0 ? '(없음)' : output;
}
