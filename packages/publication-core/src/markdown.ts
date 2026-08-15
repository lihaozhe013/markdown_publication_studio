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
import { createHighlighter } from 'shiki';
import type { PublicationDiagnostic } from '@markdown-publication/shared';
import type {
  CompiledChapter,
  CompileContext,
  MarkdownSource,
} from './model.js';

const supportedLanguages = [
  'bash',
  'css',
  'html',
  'javascript',
  'json',
  'markdown',
  'text',
  'typescript',
];
const imageMimeTypes: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isLocalReference(value: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
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
  const imagePattern = /(<img\b[^>]*\bsrc=")([^"]+)(")/gi;
  const matches = [...html.matchAll(imagePattern)];
  const replacements = await Promise.all(
    matches.map(async (match) => {
      const reference = match[2];
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
    if (!replacement || match.index === undefined || !match[0]) {
      continue;
    }
    embeddedHtml = embeddedHtml.replace(
      match[0],
      `${match[1]}${replacement}${match[3]}`,
    );
  }
  return { html: embeddedHtml, diagnostics };
}

export interface MarkdownCompiler {
  compile(
    input: MarkdownSource,
    context: CompileContext,
  ): Promise<CompiledChapter>;
}

export async function createMarkdownCompiler(): Promise<MarkdownCompiler> {
  const highlighter = await createHighlighter({
    themes: ['github-dark'],
    langs: supportedLanguages,
  });

  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    highlight(code, language) {
      const requestedLanguage = language.trim().split(/\s+/u)[0] || 'text';
      try {
        return highlighter.codeToHtml(code, {
          lang: requestedLanguage,
          theme: 'github-dark',
        });
      } catch {
        return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`;
      }
    },
  });

  return {
    async compile(input, context) {
      const rendered = markdown.render(input.content);
      const embedded = await embedLocalImages(
        rendered,
        input.path,
        context.projectRoot,
      );
      const titleMatch = rendered.match(/<h1[^>]*>(.*?)<\/h1>/i);
      const title =
        titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ||
        basename(input.path, extname(input.path));
      return {
        id: basename(input.path, extname(input.path)),
        sourcePath: input.path,
        title,
        html: embedded.html,
        diagnostics: embedded.diagnostics,
      };
    },
  };
}

export async function compileMarkdownFile(
  compiler: MarkdownCompiler,
  sourcePath: string,
): Promise<CompiledChapter> {
  const content = await readFile(sourcePath, 'utf8');
  return compiler.compile(
    { path: sourcePath, content },
    { projectRoot: dirname(sourcePath) },
  );
}
