import type MarkdownIt from 'markdown-it';

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
}
