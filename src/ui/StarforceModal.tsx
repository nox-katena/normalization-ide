import {basename} from 'node:path';
import {Box, Text} from 'ink';
import type {EnhancementStatus} from '../domain/enhancement-flow.js';
import {getStarforceRate} from '../domain/starforce-rates.js';
import type {EnhancementAnimationPhase} from './enhancement-animation.js';

export type StarforceModalLayout = 'full' | 'compact' | 'minimal';

const FULL_MIN_COLUMNS = 90;
const FULL_MIN_ROWS = 28;
const COMPACT_MIN_COLUMNS = 60;
const COMPACT_MIN_ROWS = 20;
const MODAL_MAX_WIDTH = 64;

const GOLD = '#E0BD72';
const GOLD_TEXT = '#FFF4D7';
const GOLD_TITLE = '#FFE7A8';
const GOLD_SURFACE = '#453326';
const GOLD_HEADER = '#6A4B2E';
const GOLD_INSET = '#382A22';
const WARNING_BORDER = '#CD7662';
const WARNING_TEXT = '#FFD0C6';
const WARNING_SURFACE = '#5A3028';
const FAILURE = '#F0A35E';
const FAILURE_SURFACE = '#563522';
const DESTROYED = '#FF6B68';
const DESTROYED_SURFACE = '#562627';

export const STARFORCE_MODAL_PALETTE = {
  border: GOLD,
  text: GOLD_TEXT,
  title: GOLD_TITLE,
  surface: GOLD_SURFACE,
  header: GOLD_HEADER,
  inset: GOLD_INSET,
  warningBorder: WARNING_BORDER,
  warningText: WARNING_TEXT,
  warningSurface: WARNING_SURFACE,
} as const;

export interface StarforceModalProps {
  readonly status: EnhancementStatus;
  readonly message: string;
  readonly terminalColumns: number;
  readonly terminalRows: number;
  readonly targetPath?: string;
  readonly colorEnabled?: boolean;
  readonly phase?: EnhancementAnimationPhase;
  readonly recentRemovedGraphemes?: number;
}

export function getStarforceModalLayout(
  columns: number,
  rows: number,
): StarforceModalLayout {
  if (columns >= FULL_MIN_COLUMNS && rows >= FULL_MIN_ROWS) {
    return 'full';
  }

  if (columns >= COMPACT_MIN_COLUMNS && rows >= COMPACT_MIN_ROWS) {
    return 'compact';
  }

  return 'minimal';
}

export function StarforceModal({
  status,
  message,
  terminalColumns,
  terminalRows,
  targetPath,
  colorEnabled = true,
  phase = 'ready',
  recentRemovedGraphemes = 0,
}: StarforceModalProps) {
  const layout = getStarforceModalLayout(terminalColumns, terminalRows);
  const rate = getStarforceRate(status.stars);
  const fileName = targetPath === undefined ? 'untitled.py' : basename(targetPath);
  const nextStars = status.stars === 25 ? 'MAX' : `${status.stars + 1}성`;
  const modalWidth = Math.max(
    1,
    Math.min(MODAL_MAX_WIDTH, terminalColumns - (layout === 'minimal' ? 2 : 4)),
  );
  const colors = getStarforceModalPalette(colorEnabled);

  return (
    <Box
      width={modalWidth}
      borderStyle="double"
      borderColor={colors?.border}
      backgroundColor={colors?.surface}
      flexDirection="column"
      overflow="hidden"
    >
      <Box
        justifyContent="center"
        backgroundColor={colors?.header}
        paddingX={1}
      >
        <Text bold {...colorProps(colors?.title)} wrap="truncate-end">
          {layout === 'minimal' ? '✦ 강화 ✦' : '✦ 장비 강화 ✦'}
        </Text>
      </Box>

      {phase === 'ready' ? <>
      <Box justifyContent="center" paddingX={1}>
        <Text bold {...colorProps(colors?.border)} wrap="truncate-end">
          {formatStars(status.stars, layout)}
        </Text>
      </Box>

      {layout === 'full' ? (
        <Box flexDirection="column" alignItems="center">
          <Box borderStyle="single" borderColor={colors?.border} paddingX={1}>
            <Text {...colorProps(colors?.title)}>&lt;/&gt;</Text>
          </Box>
          <Text bold {...colorProps(colors?.text)} wrap="truncate-end">
            {fileName}
          </Text>
        </Box>
      ) : null}

      <Box
        justifyContent="center"
        gap={2}
        paddingX={1}
        backgroundColor={colors?.inset}
      >
        {layout === 'minimal' ? (
          <Text bold {...colorProps(colors?.text)} wrap="truncate-end">
            {status.stars}성 ➜ {nextStars}
          </Text>
        ) : (
          <>
            <Text bold {...colorProps(colors?.text)}>{status.stars}성</Text>
            <Text {...colorProps(colors?.border)}>➜</Text>
            <Text bold {...colorProps(colors?.text)}>{nextStars}</Text>
          </>
        )}
      </Box>

      <ProbabilityRows
        layout={layout}
        success={rate?.success ?? 0}
        failure={rate?.failure ?? 0}
        destruction={rate?.destruction ?? 0}
        color={colors?.text}
        backgroundColor={colors?.inset}
      />

      {layout === 'minimal' ? (
        <Box justifyContent="center" paddingX={1}>
          <Text {...colorProps(colors?.warningText)} wrap="truncate-end">
            강화권 {status.enhancementTickets}장 · 실패 시 10자 소실
          </Text>
        </Box>
      ) : (
        <>
          <Box
            justifyContent="center"
            marginX={1}
            borderStyle="single"
            borderColor={colors?.warningBorder}
            backgroundColor={colors?.warningSurface}
            paddingX={1}
          >
            <Text {...colorProps(colors?.warningText)} wrap="truncate-end">
              {formatRisk(rate?.destruction ?? 0)}
            </Text>
          </Box>
          <Box justifyContent="center">
            <Text {...colorProps(colors?.text)}>
              보유 강화권 <Text bold>{status.enhancementTickets}장</Text>
            </Text>
          </Box>
        </>
      )}
      </> : phase === 'result' ? (
        <ResultFeedback
          status={status}
          removed={recentRemovedGraphemes}
          layout={layout}
          colorEnabled={colorEnabled}
        />
      ) : (
        <AnimationFeedback phase={phase} color={colors?.title} />
      )}

      {shouldShowMessage(message) ? (
        <Box justifyContent="center" paddingX={1}>
          <Text {...colorProps(colors?.warningText)} wrap="truncate-end">
            {message}
          </Text>
        </Box>
      ) : null}

      <Box
        justifyContent="center"
        marginX={1}
        borderStyle="double"
        borderColor={colors?.border}
        backgroundColor={colors?.header}
        paddingX={1}
      >
        <Text bold {...colorProps(colors?.text)} wrap="truncate-end">
          {phase === 'result'
            ? '[ SPACE ] 확인'
            : phase === 'ready'
              ? `[ SPACE ] 강화${layout === 'full' ? '하기' : ''}`
              : '[ 강화 중... ]'}
        </Text>
      </Box>

      {layout === 'full' && !isAnimationPhase(phase) ? (
        <Box justifyContent="center">
          <Text dimColor {...colorProps(colors?.title)}>Tab/Esc 닫기</Text>
        </Box>
      ) : null}
    </Box>
  );
}

interface AnimationFeedbackProps {
  readonly phase: Exclude<EnhancementAnimationPhase, 'ready' | 'result'>;
  readonly color: string | undefined;
}

function AnimationFeedback({phase, color}: AnimationFeedbackProps) {
  const beat =
    phase === 'pulse-one'
      ? '✦  강화 중 .'
      : phase === 'pulse-two'
        ? '✦  강화 중 ..'
        : '✦  강화 중 ...  ✦';

  return (
    <Box minHeight={8} flexDirection="column" alignItems="center" justifyContent="center">
      <Text bold {...colorProps(color)}>{beat}</Text>
      <Text dimColor>별의 힘이 응축되고 있습니다</Text>
    </Box>
  );
}

interface ResultFeedbackProps {
  readonly status: EnhancementStatus;
  readonly removed: number;
  readonly layout: StarforceModalLayout;
  readonly colorEnabled: boolean;
}

function ResultFeedback({
  status,
  removed,
  layout,
  colorEnabled,
}: ResultFeedbackProps) {
  const recent = status.recentEnhancement;

  if (recent === null) {
    return null;
  }

  const success = recent.result === 'success';
  const destroyed = recent.result === 'destroyed';
  const color = colorEnabled
    ? success
      ? GOLD_TITLE
      : destroyed
        ? DESTROYED
        : FAILURE
    : undefined;
  const backgroundColor = colorEnabled
    ? success
      ? GOLD_INSET
      : destroyed
        ? DESTROYED_SURFACE
        : FAILURE_SURFACE
    : undefined;
  const title = success
    ? '✦ SUCCESS ✦'
    : destroyed
      ? '☠ DESTROYED ☠'
      : '× FAILED ×';
  const detail = success
    ? `${recent.starsBefore}성  ➜  ${recent.starsAfter}성`
    : destroyed
      ? `전체 ${removed}자 소실 · 0성 초기화`
      : `최근 입력 ${removed}자 소실`;

  return (
    <Box
      marginX={1}
      minHeight={layout === 'minimal' ? 4 : 7}
      borderStyle={destroyed ? 'double' : 'single'}
      borderColor={color}
      backgroundColor={backgroundColor}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingX={1}
    >
      <Text bold {...colorProps(color)}>{title}</Text>
      <Text bold {...colorProps(color)} wrap="truncate-end">{detail}</Text>
      <Text {...colorProps(color)}>보유 강화권 {status.enhancementTickets}장</Text>
    </Box>
  );
}

function isAnimationPhase(phase: EnhancementAnimationPhase): boolean {
  return phase !== 'ready' && phase !== 'result';
}

interface ProbabilityRowsProps {
  readonly layout: StarforceModalLayout;
  readonly success: number;
  readonly failure: number;
  readonly destruction: number;
  readonly color: string | undefined;
  readonly backgroundColor: string | undefined;
}

function ProbabilityRows({
  layout,
  success,
  failure,
  destruction,
  color,
  backgroundColor,
}: ProbabilityRowsProps) {
  const entries = [
    ['성공', success],
    ['실패', failure],
    ['파괴', destruction],
  ] as const;

  if (layout === 'minimal') {
    return (
      <Box flexDirection="column" alignItems="center" backgroundColor={backgroundColor}>
        {entries.map(([label, value]) => (
          <Text key={label} {...colorProps(color)} wrap="truncate-end">
            {label} {formatPercent(value)}%
          </Text>
        ))}
      </Box>
    );
  }

  return (
    <Box justifyContent="space-around" paddingX={1} backgroundColor={backgroundColor}>
      {entries.map(([label, value]) => (
        <Text key={label} {...colorProps(color)} wrap="truncate-end">
          {label} {formatPercent(value)}%
        </Text>
      ))}
    </Box>
  );
}

function formatStars(stars: number, layout: StarforceModalLayout): string {
  if (layout === 'minimal') {
    return `${stars} / 25 ★`;
  }

  const groups = Array.from({length: 5}, (_, groupIndex) =>
    Array.from({length: 5}, (_, starIndex) =>
      groupIndex * 5 + starIndex < stars ? '★' : '☆',
    ).join(''),
  );

  return layout === 'compact'
    ? `${groups.slice(0, 3).join(' ')}\n${groups.slice(3).join(' ')}`
    : groups.join(' ');
}

function formatRisk(destruction: number): string {
  return destruction > 0
    ? '⚠ 실패 시 최근 입력 10자 · 파괴 시 전체 코드 소실'
    : '⚠ 실패 시 최근 입력 10자가 사라집니다';
}

function formatPercent(percent: number): string {
  return Number.isInteger(percent) ? percent.toFixed(1) : String(percent);
}

function shouldShowMessage(message: string): boolean {
  return message.includes('강화권이 없습니다') || message.includes('최대 단계');
}

export function getStarforceModalPalette(
  colorEnabled: boolean,
): typeof STARFORCE_MODAL_PALETTE | null {
  return colorEnabled ? STARFORCE_MODAL_PALETTE : null;
}

function colorProps(color: string | undefined): {readonly color?: string} {
  return color === undefined ? {} : {color};
}
