import {
  PAGE_SIZE_DEFINITIONS,
  resolveNumberedPage,
  type PageNumberFirstPageMode,
  type PageSizeId,
  type PublicationDiagnostic,
} from '@markdown-publication/shared';

const katexFontFamilies = [
  'KaTeX_Main',
  'KaTeX_Math',
  'KaTeX_Size1',
  'KaTeX_Size2',
  'KaTeX_Size3',
  'KaTeX_Size4',
];

export async function probePreviewRendering(
  frame: HTMLIFrameElement,
  pageSize: PageSizeId,
  pageNumberFirstPageMode: PageNumberFirstPageMode,
): Promise<PublicationDiagnostic[]> {
  const document = frame.contentDocument;
  const previewWindow = frame.contentWindow;
  if (!document || !previewWindow) return [];

  await document.fonts.ready;
  updateTocPageEstimates(document, pageSize, pageNumberFirstPageMode);
  const stylesheet = [...document.querySelectorAll('style')]
    .map((style) => style.textContent ?? '')
    .join('\n');
  const mathElement = document.querySelector<HTMLElement>('.katex .mord');
  const delimiterElement = document.querySelector<HTMLElement>(
    '.katex .delimsizing',
  );
  const fonts = Object.fromEntries(
    katexFontFamilies.map((family) => [
      family,
      document.fonts.check(`16px "${family}"`, '∫[]'),
    ]),
  );
  if (window.location.hostname === 'localhost') {
    console.info(
      `[math-render] Preview font probe ${JSON.stringify({
        mathElementCount: document.querySelectorAll('.katex').length,
        relativeFontUrlCount: (stylesheet.match(/url\((?!data:)/gu) ?? [])
          .length,
        dataFontUrlCount: (stylesheet.match(/url\(data:/gu) ?? []).length,
        fonts,
        mathFontFamily: mathElement
          ? previewWindow.getComputedStyle(mathElement).fontFamily
          : undefined,
        delimiterFontFamily: delimiterElement
          ? previewWindow.getComputedStyle(delimiterElement).fontFamily
          : undefined,
      })}`,
    );
  }

  const diagrams = [
    ...document.querySelectorAll<SVGSVGElement>('svg.mermaid-diagram'),
  ].map((svg) => {
    const rectangle = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    let bounds: DOMRect | undefined;
    try {
      bounds = svg.getBBox();
    } catch {
      bounds = undefined;
    }
    const expectedHeight =
      viewBox.width > 0
        ? (rectangle.width * viewBox.height) / viewBox.width
        : 0;
    const next = svg.closest('.mermaid-container')?.nextElementSibling;
    const nextTop = next?.getBoundingClientRect().top;
    return {
      id: svg.closest<HTMLElement>('.mermaid-container')?.dataset.mermaidId,
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      clientRect: { width: rectangle.width, height: rectangle.height },
      expectedHeight,
      heightError: Math.abs(rectangle.height - expectedHeight),
      overlapsNextBlock: nextTop !== undefined && rectangle.bottom > nextTop,
      bounds: bounds
        ? {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          }
        : undefined,
    };
  });
  if (window.location.hostname === 'localhost') {
    console.info(
      `[mermaid-render] Preview layout probe ${JSON.stringify({ diagrams })}`,
    );
  }

  const missingMathFonts =
    mathElement === null
      ? []
      : katexFontFamilies.filter((family) => !fonts[family]);
  return missingMathFonts.length === 0
    ? []
    : [
        {
          severity: 'warning',
          code: 'math-font-unavailable',
          message: `KaTeX fonts are not ready in the preview: ${missingMathFonts.join(', ')}.`,
          feature: 'math',
          details: { missingFonts: missingMathFonts },
        },
      ];
}

function updateTocPageEstimates(
  document: Document,
  pageSize: PageSizeId,
  pageNumberFirstPageMode: PageNumberFirstPageMode,
): void {
  const pageHeightPx = PAGE_SIZE_DEFINITIONS[pageSize].heightPt * (96 / 72);
  const toc = document.querySelector<HTMLElement>('[data-toc="true"]');
  const tocBottom = toc
    ? toc.getBoundingClientRect().bottom + document.defaultView!.scrollY
    : 0;
  const estimatedTocPages = toc
    ? Math.max(1, Math.ceil(toc.getBoundingClientRect().height / pageHeightPx))
    : 0;
  const documentHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );
  const estimatedPageCount = Math.max(
    1,
    Math.ceil(documentHeight / pageHeightPx),
  );

  for (const pageElement of document.querySelectorAll<HTMLElement>(
    '[data-toc-page-for]',
  )) {
    const headingId = pageElement.dataset.tocPageFor;
    if (!headingId) continue;
    const heading = document.getElementById(headingId);
    if (!heading) {
      pageElement.textContent = '—';
      continue;
    }
    const headingTop =
      heading.getBoundingClientRect().top + document.defaultView!.scrollY;
    const bodyOffset = Math.max(0, headingTop - tocBottom);
    const pageIndex = estimatedTocPages + Math.floor(bodyOffset / pageHeightPx);
    const numbered = resolveNumberedPage(
      pageIndex,
      Math.max(estimatedPageCount, pageIndex + 1),
      pageNumberFirstPageMode,
    );
    pageElement.textContent = numbered ? `~${numbered.page}` : '—';
  }

  if (toc && window.location.hostname === 'localhost') {
    console.info(
      `[toc] Preview page estimates ${JSON.stringify({
        estimatedTocPages,
        estimatedPageCount,
        entryCount: document.querySelectorAll('[data-toc-page-for]').length,
      })}`,
    );
  }
}
