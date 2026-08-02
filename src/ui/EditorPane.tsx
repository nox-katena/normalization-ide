import {Box, Text, useStdout} from 'ink';
import {Fragment} from 'react';
import {getUnlockState} from '../domain/game-state.js';
import type {EditorState} from '../editor/buffer.js';
import type {PythonSyntaxDiagnostic} from '../runtime/python-syntax.js';
import {
  highlightPythonGraphemes,
  type PythonHighlightKind,
} from './python-highlighting.js';

export interface EditorPaneProps {
  readonly editor: EditorState;
  readonly focused: boolean;
  readonly stars: number;
  readonly diagnostic?: PythonSyntaxDiagnostic | null;
}

export function EditorPane({
  editor,
  focused,
  stars,
  diagnostic = null,
}: EditorPaneProps) {
  const {stdout} = useStdout();
  const unlocks = getUnlockState(stars);
  const graphemes = editor.buffer.map(({value}) => value);
  const highlights = unlocks.pythonHighlighting
    ? highlightPythonGraphemes(graphemes)
    : graphemes.map((): PythonHighlightKind => 'plain');
  const lines: Array<Array<{value: string; highlight: PythonHighlightKind}>> = [
    [],
  ];
  let cursorLine = 0;
  let cursorColumn = 0;

  editor.buffer.forEach(({value}, index) => {
    if (index < editor.cursor) {
      if (value === '\n') {
        cursorLine += 1;
        cursorColumn = 0;
      } else {
        cursorColumn += 1;
      }
    }

    if (value === '\n') {
      lines.push([]);
    } else {
      lines.at(-1)?.push({
        value,
        highlight: highlights[index] ?? 'plain',
      });
    }
  });

  const lineNumberWidth = String(lines.length).length;
  const editorColor = focused ? 'cyan' : 'white';
  const visibleDiagnostic = unlocks.pythonSyntax ? diagnostic : null;
  const colorHighlighting =
    unlocks.pythonHighlighting && terminalSupportsColor(stdout);

  return (
    <Box
      borderStyle="round"
      {...(unlocks.monochromeEditor
        ? {}
        : {borderColor: focused ? 'cyan' : 'gray'})}
      flexDirection="column"
    >
      <Text
        bold
        {...(unlocks.monochromeEditor ? {} : {color: editorColor})}
      >
        {focused ? '▶ EDITOR (focused)' : '  EDITOR'}
      </Text>
      {lines.map((line, index) => {
        const diagnosticIndex =
          visibleDiagnostic?.line === index + 1
            ? diagnosticColumnIndex(line, visibleDiagnostic.column)
            : null;

        return (
          <Text key={index} wrap="truncate-end">
            {unlocks.lineNumbers
              ? `${String(index + 1).padStart(lineNumberWidth)} │ `
              : ''}
            {line.map(({value, highlight}, column) => {
              const color =
                diagnosticIndex === column
                  ? 'red'
                  : colorHighlighting
                    ? HIGHLIGHT_COLORS[highlight]
                    : undefined;

              return (
                <Fragment key={column}>
                  {index === cursorLine && column === cursorColumn ? (
                    <Cursor
                      focused={focused}
                      color={editorColor}
                      monochrome={unlocks.monochromeEditor}
                    />
                  ) : null}
                  <Text
                    {...(color === undefined ? {} : {color})}
                    underline={diagnosticIndex === column}
                  >
                    {value}
                  </Text>
                </Fragment>
              );
            })}
            {index === cursorLine && cursorColumn === line.length ? (
              <Cursor
                focused={focused}
                color={editorColor}
                monochrome={unlocks.monochromeEditor}
              />
            ) : null}
            {diagnosticIndex === line.length ? (
              <Text color="red">▲</Text>
            ) : null}
          </Text>
        );
      })}
      {visibleDiagnostic !== null ? (
        <Text color="red">
          ▲ 구문 오류 · {visibleDiagnostic.line}행 {visibleDiagnostic.column}열 ·{' '}
          {visibleDiagnostic.message}
        </Text>
      ) : null}
    </Box>
  );
}

interface CursorProps {
  readonly focused: boolean;
  readonly color: string;
  readonly monochrome: boolean;
}

function Cursor({focused, color, monochrome}: CursorProps) {
  return (
    <Text inverse={focused} {...(monochrome ? {} : {color})}>
      ▌
    </Text>
  );
}

function diagnosticColumnIndex(
  line: ReadonlyArray<{readonly value: string}>,
  pythonColumn: number,
): number {
  const codePointOffset = Math.max(0, pythonColumn - 1);
  let consumed = 0;

  for (const [index, {value}] of line.entries()) {
    const next = consumed + Array.from(value).length;
    if (codePointOffset < next) {
      return index;
    }
    consumed = next;
  }

  return line.length;
}

const HIGHLIGHT_COLORS = {
  plain: undefined,
  keyword: 'blue',
  string: 'green',
  number: 'magenta',
  comment: 'gray',
} as const;

function terminalSupportsColor(stdout: NodeJS.WriteStream): boolean {
  if (!stdout.isTTY) {
    return false;
  }

  return typeof stdout.hasColors === 'function' ? stdout.hasColors() : true;
}
