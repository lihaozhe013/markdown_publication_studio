import katex from 'katex';
import katexStylesheetSource from 'katex/dist/katex.min.css?raw';
import katexAms from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline';
import katexCaligraphicBold from 'katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline';
import katexCaligraphicRegular from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline';
import katexFrakturBold from 'katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline';
import katexFrakturRegular from 'katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline';
import katexMainBold from 'katex/dist/fonts/KaTeX_Main-Bold.woff2?inline';
import katexMainBoldItalic from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline';
import katexMainItalic from 'katex/dist/fonts/KaTeX_Main-Italic.woff2?inline';
import katexMainRegular from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?inline';
import katexMathBoldItalic from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline';
import katexMathItalic from 'katex/dist/fonts/KaTeX_Math-Italic.woff2?inline';
import katexSansSerifBold from 'katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline';
import katexSansSerifItalic from 'katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline';
import katexSansSerifRegular from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline';
import katexScriptRegular from 'katex/dist/fonts/KaTeX_Script-Regular.woff2?inline';
import katexSize1Regular from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline';
import katexSize2Regular from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline';
import katexSize3Regular from 'katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline';
import katexSize4Regular from 'katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline';
import katexTypewriterRegular from 'katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline';
import type { PublicationDiagnostic } from '@markdown-publication/shared';
import { katexFontAssetSummary } from './render-debug.js';

interface MathPlaceholder {
  id: string;
  expression: string;
  displayMode: boolean;
}

export interface PreparedMath {
  source: string;
  placeholders: MathPlaceholder[];
}

const katexFontUrls: Record<string, string> = {
  'KaTeX_AMS-Regular': katexAms,
  'KaTeX_Caligraphic-Bold': katexCaligraphicBold,
  'KaTeX_Caligraphic-Regular': katexCaligraphicRegular,
  'KaTeX_Fraktur-Bold': katexFrakturBold,
  'KaTeX_Fraktur-Regular': katexFrakturRegular,
  'KaTeX_Main-Bold': katexMainBold,
  'KaTeX_Main-BoldItalic': katexMainBoldItalic,
  'KaTeX_Main-Italic': katexMainItalic,
  'KaTeX_Main-Regular': katexMainRegular,
  'KaTeX_Math-BoldItalic': katexMathBoldItalic,
  'KaTeX_Math-Italic': katexMathItalic,
  'KaTeX_SansSerif-Bold': katexSansSerifBold,
  'KaTeX_SansSerif-Italic': katexSansSerifItalic,
  'KaTeX_SansSerif-Regular': katexSansSerifRegular,
  'KaTeX_Script-Regular': katexScriptRegular,
  'KaTeX_Size1-Regular': katexSize1Regular,
  'KaTeX_Size2-Regular': katexSize2Regular,
  'KaTeX_Size3-Regular': katexSize3Regular,
  'KaTeX_Size4-Regular': katexSize4Regular,
  'KaTeX_Typewriter-Regular': katexTypewriterRegular,
};

const katexFontSourcePattern =
  /url\(fonts\/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\),url\(fonts\/\1\.woff\) format\("woff"\),url\(fonts\/\1\.ttf\) format\("truetype"\)/gu;

function inlineKatexFonts(stylesheet: string): string {
  return stylesheet.replace(katexFontSourcePattern, (_match, name: string) => {
    const fontUrl = katexFontUrls[name];
    if (!fontUrl) {
      throw new Error(`Missing bundled KaTeX font asset: ${name}`);
    }
    return `url(${fontUrl}) format("woff2")`;
  });
}

const katexStylesheet = inlineKatexFonts(katexStylesheetSource);

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function createPlaceholder(
  placeholders: MathPlaceholder[],
  expression: string,
  displayMode: boolean,
): string {
  const id = `math-${placeholders.length}`;
  placeholders.push({ id, expression, displayMode });
  const tag = displayMode ? 'div' : 'span';
  return `<${tag} data-publication-math="${id}"></${tag}>`;
}

function replaceMathInText(
  text: string,
  placeholders: MathPlaceholder[],
): string {
  const withDisplayMath = text
    .replace(/\\\[([\s\S]*?)\\\]/gu, (_match, expression: string) =>
      createPlaceholder(placeholders, expression, true),
    )
    .replace(/\$\$([\s\S]*?)\$\$/gu, (_match, expression: string) =>
      createPlaceholder(placeholders, expression, true),
    );

  return withDisplayMath
    .split(/(`+[^`]*`+)/gu)
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\\\((.+?)\\\)/gu, (_match, expression: string) =>
          createPlaceholder(placeholders, expression, false),
        )
        .replace(
          /(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/gu,
          (_match, expression: string) =>
            createPlaceholder(placeholders, expression, false),
        );
    })
    .join('');
}

function isFenceLine(line: string): boolean {
  return /^\s{0,3}(`{3,}|~{3,})/u.test(line);
}

export function prepareMath(source: string, enabled: boolean): PreparedMath {
  if (!enabled) return { source, placeholders: [] };

  const placeholders: MathPlaceholder[] = [];
  const lines = source.split('\n');
  let inFence = false;
  const output: string[] = [];
  let textBuffer: string[] = [];
  const flushTextBuffer = (): void => {
    if (textBuffer.length === 0) return;
    output.push(replaceMathInText(textBuffer.join('\n'), placeholders));
    textBuffer = [];
  };

  for (const line of lines) {
    if (isFenceLine(line)) {
      flushTextBuffer();
      output.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) output.push(line);
    else textBuffer.push(line);
  }
  flushTextBuffer();

  return { source: output.join('\n'), placeholders };
}

export function renderMathPlaceholders(
  html: string,
  placeholders: MathPlaceholder[],
  diagnostics: PublicationDiagnostic[],
): string {
  let result = html;
  for (const placeholder of placeholders) {
    let rendered: string;
    try {
      rendered = katex.renderToString(placeholder.expression, {
        displayMode: placeholder.displayMode,
        output: 'htmlAndMathml',
        throwOnError: true,
        strict: 'warn',
      });
    } catch (error) {
      diagnostics.push({
        severity: 'warning',
        code: 'invalid-math',
        message: `The LaTeX formula could not be rendered: ${placeholder.expression}`,
        feature: 'math',
        details: {
          reason: error instanceof Error ? error.message : String(error),
        },
      });
      rendered = `<span class="math-error"><code>${escapeAttribute(placeholder.expression)}</code></span>`;
    }
    result = result.replaceAll(
      `<span data-publication-math="${placeholder.id}"></span>`,
      rendered,
    );
    result = result.replaceAll(
      `<div data-publication-math="${placeholder.id}"></div>`,
      `<div class="math-block">${rendered}</div>`,
    );
  }
  return result;
}

export function getKatexStylesheet(): string {
  return katexStylesheet;
}

export function getKatexFontAssetSummary(): ReturnType<
  typeof katexFontAssetSummary
> {
  return katexFontAssetSummary(katexStylesheet);
}
