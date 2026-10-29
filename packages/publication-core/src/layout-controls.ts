import type MarkdownIt from 'markdown-it';

/** Page templates available to the `\pagetemplate{...}` layout directive. */
const PAGE_TEMPLATE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
const TEMPLATE_DIRECTIVE_PATTERN = /^\\pagetemplate\{([^{}]*)\}[\t ]*$/u;

/** Register the standalone page-ending directive as a Markdown block token. */
export function registerLayoutControls(
  markdown: InstanceType<typeof MarkdownIt>,
): void {
  markdown.block.ruler.before(
    'paragraph',
    'publication_clearpage',
    (state, startLine, _endLine, silent) => {
      if (
        state.parentType !== 'root' &&
        !(silent && state.parentType === 'paragraph')
      ) {
        return false;
      }
      const indentation = state.sCount[startLine] ?? 0;
      if (indentation - state.blkIndent >= 4) return false;
      const start =
        (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
      const end = state.eMarks[startLine] ?? start;
      if (!/^\\clearpage[\t ]*$/u.test(state.src.slice(start, end))) {
        return false;
      }
      if (silent) return true;
      const token = state.push('publication_clearpage', '', 0);
      token.block = true;
      token.map = [startLine, startLine + 1];
      state.line = startLine + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );

  markdown.block.ruler.before(
    'paragraph',
    'publication_pagetemplate',
    (state, startLine, _endLine, silent) => {
      if (
        state.parentType !== 'root' &&
        !(silent && state.parentType === 'paragraph')
      ) {
        return false;
      }
      const indentation = state.sCount[startLine] ?? 0;
      if (indentation - state.blkIndent >= 4) return false;
      const start =
        (state.bMarks[startLine] ?? 0) + (state.tShift[startLine] ?? 0);
      const end = state.eMarks[startLine] ?? start;
      const match = TEMPLATE_DIRECTIVE_PATTERN.exec(
        state.src.slice(start, end),
      );
      if (!match) return false;
      if (silent) return true;
      const token = state.push('publication_pagetemplate', '', 0);
      token.block = true;
      token.map = [startLine, startLine + 1];
      token.meta = {
        template: PAGE_TEMPLATE_PATTERN.test(match[1] ?? '')
          ? (match[1] ?? '')
          : 'invalid',
      };
      state.line = startLine + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );

  markdown.core.ruler.after(
    'block',
    'publication_clearpage_normalize',
    (state) => {
      const tokens = state.tokens;
      const isBreak = (index: number): boolean =>
        tokens[index]?.type === 'publication_clearpage';
      const lastContentIndex = tokens.findLastIndex(
        (token) => token.type !== 'publication_clearpage',
      );
      state.tokens = tokens.filter((token, index) => {
        if (token.type !== 'publication_clearpage') return true;
        return index > 0 && index < lastContentIndex && !isBreak(index - 1);
      });
    },
  );

  markdown.renderer.rules.publication_clearpage = (tokens, index) => {
    const line = (tokens[index]?.map?.[0] ?? 0) + 1;
    return `<div class="publication-page-break" data-layout-line="${line}" aria-hidden="true"></div>\n`;
  };

  markdown.renderer.rules.publication_pagetemplate = (tokens, index) => {
    const token = tokens[index];
    const line = (token?.map?.[0] ?? 0) + 1;
    const template = String(
      (token?.meta as { template?: unknown } | undefined)?.template ??
        'invalid',
    ).replaceAll(/[^a-z0-9-]/gu, '');
    return `<div class="publication-page-break publication-page-template publication-page-template--${template}" data-page-template="${template}" data-layout-line="${line}" aria-hidden="true"></div>\n`;
  };
}
