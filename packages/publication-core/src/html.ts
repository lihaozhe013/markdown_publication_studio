import type { PublicationDiagnostic } from '@markdown-publication/shared';
import type { CompiledChapter, PublicationHtmlOptions } from './model.js';

const defaultMargins = {
  top: '18mm',
  right: '16mm',
  bottom: '20mm',
  left: '16mm',
};

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

export function renderPublicationHtml(
  chapters: CompiledChapter[],
  options: PublicationHtmlOptions,
): { html: string; diagnostics: PublicationDiagnostic[] } {
  const margins = { ...defaultMargins, ...options.margins };
  const diagnostics = chapters.flatMap((chapter) => chapter.diagnostics);
  const body = chapters
    .map(
      (chapter) =>
        `<article class="chapter" data-source-path="${escapeAttribute(chapter.sourcePath)}">${chapter.html}</article>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="publication-render-ready" content="true">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data: https:;">
    <title>${escapeAttribute(options.title)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
      @page { size: ${options.pageSize ?? 'A4'}; margin: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left}; }
      @media screen {
        body { max-width: 900px; margin: 0 auto; padding: 48px 64px; background: #eef1f5; }
        .chapter { margin: 0 0 32px; padding: 52px 64px; background: white; box-shadow: 0 12px 40px rgb(16 35 58 / 12%); }
      }
      @media print {
        body { margin: 0; background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .chapter { break-before: page; }
        .chapter:first-child { break-before: auto; }
      }
      body { color: #182230; font-size: 11pt; line-height: 1.6; }
      h1, h2, h3, h4 { color: #102a43; line-height: 1.2; break-after: avoid; }
      h1 { font-size: 28pt; margin: 0 0 20pt; border-bottom: 2px solid #2f80ed; padding-bottom: 8pt; }
      h2 { font-size: 18pt; margin-top: 24pt; }
      h3 { font-size: 14pt; margin-top: 18pt; }
      p, ul, ol, blockquote, table, pre { margin: 10pt 0; }
      a { color: #1b64b0; }
      img { max-width: 100%; height: auto; display: block; margin: 14pt auto; }
      blockquote { border-left: 4px solid #90cdf4; padding: 4pt 14pt; color: #52606d; background: #f0f7ff; }
      table { width: 100%; border-collapse: collapse; break-inside: avoid; }
      th, td { border: 1px solid #bcccdc; padding: 6pt 8pt; text-align: left; }
      th { background: #d9eaf7; }
      pre { overflow-x: auto; padding: 14pt; border-radius: 6pt; break-inside: avoid; background: #0d1117; }
      code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 9pt; }
      :not(pre) > code { background: #e9f2fb; padding: 1pt 4pt; border-radius: 3pt; }
      .shiki { padding: 14pt; border-radius: 6pt; overflow-x: auto; }
    </style>
    <style>${options.stylesheet ?? ''}</style>
  </head>
  <body class="markdown-body" data-theme="${escapeAttribute(options.themeId ?? 'default')}" data-publication-render-ready="true">
    ${body}
  </body>
</html>`;
  return { html, diagnostics };
}
