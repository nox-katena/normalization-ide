import {Box, Text} from 'ink';
import type {EnhancementStatus} from '../domain/enhancement-flow.js';
import {getStarforceRate} from '../domain/starforce-rates.js';
import type {PythonSyntaxDiagnostic} from '../runtime/python-syntax.js';

export type HudLayout = 'wide' | 'medium' | 'narrow';

const WIDE_MIN_COLUMNS = 110;
const MEDIUM_MIN_COLUMNS = 72;
const STAR_GROUP_SIZE = 5;
const STAR_GROUP_COUNT = 5;
const DEFAULT_BAR_WIDTH = 10;

const HUD_PALETTE = {
  border: '#77717F',
  surface: '#1D1A20',
  text: '#E8E3EA',
  muted: '#9A939F',
  gold: '#E0BD72',
  success: '#7BCB88',
  failure: '#E6B566',
  danger: '#E57373',
  unlocked: '#75C7D4',
} as const;

const IMPLEMENTED_UNLOCKS = [
  [3, '줄 번호'],
  [5, 'Backspace'],
  [7, '공백 입력'],
  [10, 'Ctrl+Z Undo'],
  [12, 'Python 실행'],
  [15, '파일 저장'],
  [17, 'Python 구문 오류'],
  [20, 'Syntax highlighting'],
] as const;

const MILESTONES = [
  {stars: 17, name: 'Python 오류', implemented: true},
  {stars: 20, name: 'Syntax', implemented: true},
  {stars: 22, name: 'Git commit', implemented: false},
  {stars: 25, name: 'Vim', implemented: false},
] as const;

export interface HudPaneProps {
  readonly status: EnhancementStatus;
  readonly syntaxCheck?: SyntaxCheckStatus;
  readonly dimmed?: boolean;
  readonly terminalColumns?: number;
  readonly colorEnabled?: boolean;
}

export type SyntaxCheckStatus =
  | {readonly status: 'locked' | 'checking' | 'valid'}
  | {readonly status: 'invalid'; readonly diagnostic: PythonSyntaxDiagnostic}
  | {readonly status: 'error'; readonly message: string};

export function getHudLayout(columns: number): HudLayout {
  if (columns >= WIDE_MIN_COLUMNS) {
    return 'wide';
  }

  return columns >= MEDIUM_MIN_COLUMNS ? 'medium' : 'narrow';
}

export function formatStarGauge(stars: number): string {
  return Array.from({length: STAR_GROUP_COUNT}, (_, groupIndex) =>
    Array.from({length: STAR_GROUP_SIZE}, (_, starIndex) =>
      groupIndex * STAR_GROUP_SIZE + starIndex < stars ? '★' : '☆',
    ).join(''),
  ).join(' ');
}

export function formatProgressBar(percent: number, width = DEFAULT_BAR_WIDTH): string {
  const safePercent = Math.min(100, Math.max(0, percent));
  const filled = Math.round((safePercent / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}`;
}

export function HudPane({
  status,
  syntaxCheck = status.unlocks.pythonSyntax
    ? {status: 'checking'}
    : {status: 'locked'},
  dimmed = false,
  terminalColumns = 120,
  colorEnabled = true,
}: HudPaneProps) {
  const layout = getHudLayout(terminalColumns);
  const colors = colorEnabled ? HUD_PALETTE : null;

  return (
    <Box
      borderStyle="round"
      borderColor={colors?.border}
      borderDimColor={dimmed}
      backgroundColor={colors?.surface}
      flexDirection="column"
      overflow="hidden"
    >
      <Box paddingX={1}>
        <Text bold dimColor={dimmed} {...tone(colors?.text)}>
          STARFORCE HUD
        </Text>
      </Box>

      {layout === 'wide' ? (
        <WideDashboard status={status} dimmed={dimmed} colors={colors} />
      ) : layout === 'medium' ? (
        <MediumDashboard status={status} dimmed={dimmed} colors={colors} />
      ) : (
        <NarrowDashboard
          status={status}
          dimmed={dimmed}
          colors={colors}
          terminalColumns={terminalColumns}
        />
      )}

      <Telemetry
        status={status}
        layout={layout}
        dimmed={dimmed}
        colors={colors}
        terminalColumns={terminalColumns}
      />

      {status.unlocks.pythonSyntax ? (
        <SyntaxStatus
          syntaxCheck={syntaxCheck}
          dimmed={dimmed}
          colors={colors}
        />
      ) : null}
    </Box>
  );
}

interface DashboardProps {
  readonly status: EnhancementStatus;
  readonly dimmed: boolean;
  readonly colors: typeof HUD_PALETTE | null;
}

function WideDashboard({status, dimmed, colors}: DashboardProps) {
  return (
    <Box>
      <Box width="34%" paddingX={1}>
        <StarTicketArea status={status} wide dimmed={dimmed} colors={colors} />
      </Box>
      <VerticalSection width="32%" dimmed={dimmed} colors={colors}>
        <ProbabilityArea status={status} dimmed={dimmed} colors={colors} />
      </VerticalSection>
      <VerticalSection width="34%" dimmed={dimmed} colors={colors}>
        <UnlockArea status={status} dimmed={dimmed} colors={colors} />
      </VerticalSection>
    </Box>
  );
}

function MediumDashboard({status, dimmed, colors}: DashboardProps) {
  return (
    <Box flexDirection="column">
      <Box>
        <Box width="50%" paddingX={1}>
          <StarTicketArea status={status} dimmed={dimmed} colors={colors} />
        </Box>
        <VerticalSection width="50%" dimmed={dimmed} colors={colors}>
          <ProbabilityArea status={status} dimmed={dimmed} colors={colors} />
        </VerticalSection>
      </Box>
      <HorizontalSection dimmed={dimmed} colors={colors}>
        <UnlockArea status={status} dimmed={dimmed} colors={colors} />
      </HorizontalSection>
    </Box>
  );
}

interface NarrowDashboardProps extends DashboardProps {
  readonly terminalColumns: number;
}

function NarrowDashboard({
  status,
  dimmed,
  colors,
  terminalColumns,
}: NarrowDashboardProps) {
  const barWidth = terminalColumns < 32 ? 3 : 6;

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <StarTicketArea status={status} dimmed={dimmed} colors={colors} />
      </Box>
      <HorizontalSection dimmed={dimmed} colors={colors}>
        <ProbabilityArea
          status={status}
          dimmed={dimmed}
          colors={colors}
          barWidth={barWidth}
        />
      </HorizontalSection>
      <HorizontalSection dimmed={dimmed} colors={colors}>
        <UnlockArea status={status} dimmed={dimmed} colors={colors} stacked />
      </HorizontalSection>
    </Box>
  );
}

interface SectionProps {
  readonly children: React.ReactNode;
  readonly dimmed: boolean;
  readonly colors: typeof HUD_PALETTE | null;
  readonly width?: number | string;
}

function VerticalSection({children, dimmed, colors, width}: SectionProps) {
  return (
    <Box
      width={width}
      borderStyle="single"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={colors?.border}
      borderDimColor={dimmed}
      paddingX={1}
    >
      {children}
    </Box>
  );
}

function HorizontalSection({children, dimmed, colors}: SectionProps) {
  return (
    <Box
      borderStyle="single"
      borderRight={false}
      borderBottom={false}
      borderLeft={false}
      borderColor={colors?.border}
      borderDimColor={dimmed}
      paddingX={1}
    >
      {children}
    </Box>
  );
}

interface StarTicketAreaProps extends DashboardProps {
  readonly wide?: boolean;
}

function StarTicketArea({
  status,
  wide = false,
  dimmed,
  colors,
}: StarTicketAreaProps) {
  const nextStars = status.stars === 25 ? null : status.stars + 1;

  return (
    <Box flexDirection="column">
      <Text bold dimColor={dimmed} {...tone(colors?.gold)}>STAR LEVEL</Text>
      {wide ? (
        <Text dimColor={dimmed} {...tone(colors?.gold)} wrap="truncate-end">
          {formatStarGauge(status.stars)}
        </Text>
      ) : null}
      <Text bold dimColor={dimmed} {...tone(colors?.gold)} wrap="truncate-end">
        {status.stars === 25
          ? '★ 25성 MAX · 강화 완료'
          : `★ ${status.stars}성 → ${nextStars}성`}
      </Text>
      <Text bold dimColor={dimmed} {...tone(colors?.gold)}>
        강화권 {status.enhancementTickets}장
      </Text>
    </Box>
  );
}

interface ProbabilityAreaProps extends DashboardProps {
  readonly barWidth?: number;
}

function ProbabilityArea({
  status,
  dimmed,
  colors,
  barWidth = DEFAULT_BAR_WIDTH,
}: ProbabilityAreaProps) {
  const rate = getStarforceRate(status.stars);

  return (
    <Box flexDirection="column">
      <Text bold dimColor={dimmed} {...tone(colors?.text)}>PROBABILITY</Text>
      {rate === null ? (
        <Text bold dimColor={dimmed} {...tone(colors?.gold)}>
          ★ MAX · 강화 완료
        </Text>
      ) : (
        <>
          <ProbabilityRow
            label="성공"
            percent={rate.success}
            barWidth={barWidth}
            color={colors?.success}
            dimmed={dimmed}
          />
          <ProbabilityRow
            label="실패"
            percent={rate.failure}
            barWidth={barWidth}
            color={colors?.failure}
            dimmed={dimmed}
          />
          <ProbabilityRow
            label="파괴"
            percent={rate.destruction}
            barWidth={barWidth}
            color={colors?.danger}
            dimmed={dimmed}
          />
        </>
      )}
    </Box>
  );
}

interface ProbabilityRowProps {
  readonly label: string;
  readonly percent: number;
  readonly barWidth: number;
  readonly color: string | undefined;
  readonly dimmed: boolean;
}

function ProbabilityRow({
  label,
  percent,
  barWidth,
  color,
  dimmed,
}: ProbabilityRowProps) {
  return (
    <Text dimColor={dimmed} {...tone(color)} wrap="truncate-end">
      {label} {formatProgressBar(percent, barWidth)} {formatPercent(percent)}%
    </Text>
  );
}

interface UnlockAreaProps extends DashboardProps {
  readonly stacked?: boolean;
}

function UnlockArea({
  status,
  dimmed,
  colors,
  stacked = false,
}: UnlockAreaProps) {
  const nextUnlock = IMPLEMENTED_UNLOCKS.find(([stars]) => stars > status.stars);

  return (
    <Box width="100%" flexDirection="column">
      <Text bold dimColor={dimmed} {...tone(colors?.text)} wrap="truncate-end">
        UNLOCKS · ✓ 해금 🔒 잠금 ◇ 예정
      </Text>
      <Text bold dimColor={dimmed} {...tone(colors?.unlocked)} wrap="truncate-end">
        {nextUnlock === undefined
          ? 'NEXT · 구현 기능 모두 해금'
          : `NEXT ${nextUnlock[0]}성 · ${nextUnlock[1]}`}
      </Text>
      {stacked ? (
        MILESTONES.map((milestone) => (
          <Milestone key={milestone.stars} milestone={milestone} stars={status.stars} dimmed={dimmed} colors={colors} />
        ))
      ) : (
        <>
          <MilestoneRow milestones={MILESTONES.slice(0, 2)} stars={status.stars} dimmed={dimmed} colors={colors} />
          <MilestoneRow milestones={MILESTONES.slice(2)} stars={status.stars} dimmed={dimmed} colors={colors} />
        </>
      )}
    </Box>
  );
}

interface MilestoneRowProps extends Omit<DashboardProps, 'status'> {
  readonly milestones: readonly (typeof MILESTONES)[number][];
  readonly stars: number;
}

function MilestoneRow({milestones, stars, dimmed, colors}: MilestoneRowProps) {
  return (
    <Box>
      {milestones.map((milestone) => (
        <Box key={milestone.stars} width="50%">
          <Milestone milestone={milestone} stars={stars} dimmed={dimmed} colors={colors} />
        </Box>
      ))}
    </Box>
  );
}

interface MilestoneProps extends Omit<DashboardProps, 'status'> {
  readonly milestone: (typeof MILESTONES)[number];
  readonly stars: number;
}

function Milestone({milestone, stars, dimmed, colors}: MilestoneProps) {
  const unlocked = milestone.implemented && stars >= milestone.stars;
  const symbol = milestone.implemented ? (unlocked ? '✓' : '🔒') : '◇';
  const color = milestone.implemented
    ? unlocked
      ? colors?.unlocked
      : colors?.muted
    : colors?.muted;

  return (
    <Text dimColor={dimmed} {...tone(color)} wrap="truncate-end">
      {milestone.stars}{symbol} {milestone.name}
    </Text>
  );
}

interface TelemetryProps extends DashboardProps {
  readonly layout: HudLayout;
  readonly terminalColumns: number;
}

function Telemetry({
  status,
  layout,
  dimmed,
  colors,
  terminalColumns,
}: TelemetryProps) {
  const barWidth = layout === 'wide' ? 10 : terminalColumns < 36 ? 3 : 6;
  const productivity = formatPercent(status.productivityPercent);

  return (
    <HorizontalSection dimmed={dimmed} colors={colors}>
      <Box width="100%" flexDirection={layout === 'narrow' ? 'column' : 'row'}>
        <Text dimColor={dimmed} {...tone(colors?.text)} wrap="truncate-end">
          INPUT {status.totalDirectInputs} │ BUFFER {status.currentGraphemes} │ LOSS F{status.failureLostGraphemes} D{status.destructionLostGraphemes}
        </Text>
        <Text dimColor={dimmed} {...tone(colors?.text)} wrap="truncate-end">
          {layout === 'narrow' ? '' : ' │ '}PRODUCTIVITY{' '}
          {formatProgressBar(status.productivityPercent, barWidth)} {productivity}%
        </Text>
      </Box>
    </HorizontalSection>
  );
}

interface SyntaxStatusProps {
  readonly syntaxCheck: SyntaxCheckStatus;
  readonly dimmed: boolean;
  readonly colors: typeof HUD_PALETTE | null;
}

function SyntaxStatus({syntaxCheck, dimmed, colors}: SyntaxStatusProps) {
  const toneColor =
    syntaxCheck.status === 'invalid' || syntaxCheck.status === 'error'
      ? colors?.danger
      : syntaxCheck.status === 'valid'
        ? colors?.success
        : colors?.muted;

  return (
    <HorizontalSection dimmed={dimmed} colors={colors}>
      <Text dimColor={dimmed} {...tone(toneColor)} wrap="truncate-end">
        {formatSyntaxCheck(syntaxCheck)}
      </Text>
    </HorizontalSection>
  );
}

function formatPercent(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1);
}

function formatSyntaxCheck(syntaxCheck: SyntaxCheckStatus): string {
  switch (syntaxCheck.status) {
    case 'checking':
      return '… Python 구문 검사 중';
    case 'valid':
      return '✓ Python 구문 정상';
    case 'invalid':
      return `✕ ${syntaxCheck.diagnostic.line}행 ${syntaxCheck.diagnostic.column}열 · ${syntaxCheck.diagnostic.message}`;
    case 'error':
      return `! Python 구문 검사 실패 · ${syntaxCheck.message}`;
    case 'locked':
      return '';
  }
}

function tone(color: string | undefined): {readonly color?: string} {
  return color === undefined ? {} : {color};
}
