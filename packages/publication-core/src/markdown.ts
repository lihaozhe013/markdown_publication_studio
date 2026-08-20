import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
} from 'node:path';
import MarkdownIt from 'markdown-it';
import {
  bundledLanguages,
  createHighlighter,
  type BundledLanguage,
} from 'shiki';
import type { PublicationDiagnostic } from '@markdown-publication/shared';
import type {
  CompiledChapter,
  CompileContext,
  MarkdownSource,
  PublicationFeatureOptions,
} from './model.js';
import { renderMathPlaceholders, prepareMath } from './math.js';
import { sanitizePublicationHtml } from './sanitizer.js';

const imageMimeTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const defaultFeatures: Required<PublicationFeatureOptions> = {
  codeTheme: 'github-dark',
  math: { enabled: true },
  mermaid: { enabled: true },
  html: { policy: 'safe-static' },
};

function getFeatures(
  features: PublicationFeatureOptions | undefined,
): Required<PublicationFeatureOptions> {
  return {
    codeTheme: features?.codeTheme ?? defaultFeatures.codeTheme,
    math: { ...defaultFeatures.math, ...features?.math },
    mermaid: { ...defaultFeatures.mermaid, ...features?.mermaid },
    html: { ...defaultFeatures.html, ...features?.html },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function isLocalReference(value: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(value);
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !isAbsolute(relativePath))
  );
}

async function embedLocalImages(
  html: string,
  sourcePath: string,
  projectRoot: string,
): Promise<{ html: string; diagnostics: PublicationDiagnostic[] }> {
  const diagnostics: PublicationDiagnostic[] = [];
  const imagePattern = /(<img\b[^>]*\bsrc=)(["'])(.*?)\2/giu;
  const matches = [...html.matchAll(imagePattern)];
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const reference = match[3];
      if (!reference || !isLocalReference(reference)) {
        return { match, replacement: undefined };
      }

      const assetPath = resolve(dirname(sourcePath), reference);
      if (!isWithinRoot(assetPath, projectRoot)) {
        diagnostics.push({
          severity: 'warning',
          code: 'asset-outside-project-root',
          message: `The image reference is outside the project root: ${reference}`,
          sourcePath,
          feature: 'asset',
        });
        return { match, replacement: undefined };
      }

      try {
        const data = await readFile(assetPath);
        const mimeType = imageMimeTypes[extname(assetPath).toLowerCase()];
        if (!mimeType) {
          diagnostics.push({
            severity: 'warning',
            code: 'unsupported-image-type',
            message: `The image type is not supported for embedding: ${reference}`,
            sourcePath,
            feature: 'asset',
          });
          return { match, replacement: undefined };
        }
        return {
          match,
          replacement: `data:${mimeType};base64,${data.toString('base64')}`,
        };
      } catch (error) {
        diagnostics.push({
          severity: 'warning',
          code: 'missing-image',
          message: `The local image could not be read: ${reference}`,
          sourcePath,
          feature: 'asset',
          details: {
            reason: error instanceof Error ? error.message : String(error),
          },
        });
        return { match, replacement: undefined };
      }
    }),
  );

  let embeddedHtml = html;
  for (const { match, replacement } of replacements) {
    if (!replacement || match.index === undefined || !match[0]) continue;
    embeddedHtml = embeddedHtml.replace(
      match[0],
      `${match[1]}"${replacement}"`,
    );
  }
  return { html: embeddedHtml, diagnostics };
}

function mermaidId(sourcePath: string, code: string, index: number): string {
  const digest = createHash('sha256')
    .update(`${sourcePath}\u0000${index}\u0000${code}`)
    .digest('hex')
    .slice(0, 16);
  return `mermaid-${digest}`;
}

function mermaidPlaceholder(
  sourcePath: string,
  code: string,
  index: number,
): string {
  const id = mermaidId(sourcePath, code, index);
  const encoded = Buffer.from(code, 'utf8').toString('base64');
  return `<pre class="mermaid-placeholder" data-mermaid-id="${id}" data-mermaid-source="${encoded}"><code class="code-block code-block--plain" data-language="mermaid">${escapeHtml(code)}</code></pre>`;
}

function languageName(info: string): string {
  return info.trim().split(/\s+/u)[0]?.toLowerCase() || 'text';
}

function isKnownLanguage(language: string): boolean {
  return Object.prototype.hasOwnProperty.call(bundledLanguages, language);
}

export interface MarkdownCompiler {
  compile(
    input: MarkdownSource,
    context: CompileContext,
  ): Promise<CompiledChapter>;
}

export async function createMarkdownCompiler(): Promise<MarkdownCompiler> {
  const highlighter = await createHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: Object.keys(bundledLanguages) as BundledLanguage[],
  });

  return {
    async compile(input, context) {
      const features = getFeatures(context.features);
      const diagnostics: PublicationDiagnostic[] = [];
      let mermaidDiagramCount = 0;
      const math = prepareMath(input.content, features.math.enabled);
      const markdown = new MarkdownIt({
        html: features.html.policy === 'safe-static',
        linkify: true,
        typographer: true,
        highlight(code, languageInfo) {
          const language = languageName(languageInfo);
          if (language === 'mermaid') {
            if (!features.mermaid.enabled) {
              return `<pre class="code-block code-block--plain" data-language="mermaid"><code>${escapeHtml(code)}</code></pre>`;
            }
            const placeholder = mermaidPlaceholder(
              input.path,
              code,
              mermaidDiagramCount,
            );
            mermaidDiagramCount += 1;
            return placeholder;
          }

          if (!isKnownLanguage(language)) {
            diagnostics.push({
              severity: 'warning',
              code: 'unsupported-language',
              message: `No bundled syntax grammar was found for language: ${language}`,
              sourcePath: input.path,
              feature: 'code',
              details: { language },
            });
            return `<pre class="code-block code-block--plain" data-language="${escapeAttribute(language)}"><code>${escapeHtml(code)}</code></pre>`;
          }

          try {
            const highlighted = highlighter.codeToHtml(code, {
              lang: language,
              theme: features.codeTheme,
            });
            return highlighted.replace(
              /<pre class="shiki[^"]*"/u,
              `<pre class="shiki code-block" data-language="${escapeAttribute(language)}"`,
            );
          } catch (error) {
            diagnostics.push({
              severity: 'warning',
              code: 'highlight-failed',
              message: `Syntax highlighting failed for language: ${language}`,
              sourcePath: input.path,
              feature: 'code',
              details: {
                language,
                reason: error instanceof Error ? error.message : String(error),
              },
            });
            return `<pre class="code-block code-block--plain" data-language="${escapeAttribute(language)}"><code>${escapeHtml(code)}</code></pre>`;
          }
        },
      });

      const renderedMarkdown = markdown.render(math.source);
      const renderedMath = renderMathPlaceholders(
        renderedMarkdown,
        math.placeholders,
        diagnostics,
      );
      const sanitized = sanitizePublicationHtml(renderedMath);
      if (sanitized.removedContent) {
        diagnostics.push({
          severity: 'warning',
          code: 'unsafe-html-removed',
          message:
            'Unsafe or unsupported HTML content was removed from the publication.',
          sourcePath: input.path,
          feature: 'html',
        });
      }
      const embedded = await embedLocalImages(
        sanitized.html,
        input.path,
        context.projectRoot,
      );
      const titleMatch = embedded.html.match(/<h1[^>]*>(.*?)<\/h1>/iu);
      const title =
        titleMatch?.[1]?.replace(/<[^>]+>/gu, '').trim() ||
        basename(input.path, extname(input.path));
      return {
        id: basename(input.path, extname(input.path)),
        sourcePath: input.path,
        title,
        html: embedded.html,
        diagnostics: [...diagnostics, ...embedded.diagnostics],
        mermaidDiagramCount,
      };
    },
  };
}

export async function compileMarkdownFile(
  compiler: MarkdownCompiler,
  sourcePath: string,
  features?: PublicationFeatureOptions,
): Promise<CompiledChapter> {
  const content = await readFile(sourcePath, 'utf8');
  const context: CompileContext = { projectRoot: dirname(sourcePath) };
  if (features) context.features = features;
  return compiler.compile({ path: sourcePath, content }, context);
}
