import type { PublicationDiagnostic } from '@markdown-publication/shared';

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
): Promise<PublicationDiagnostic[]> {
  if (window.location.hostname !== 'localhost') return [];
  const document = frame.contentDocument;
  const previewWindow = frame.contentWindow;
  if (!document || !previewWindow) return [];

  await document.fonts.ready;
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
  console.info(
    `[math-render] Preview font probe ${JSON.stringify({
      mathElementCount: document.querySelectorAll('.katex').length,
      relativeFontUrlCount: (stylesheet.match(/url\((?!data:)/gu) ?? []).length,
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
  console.info(
    `[mermaid-render] Preview layout probe ${JSON.stringify({ diagrams })}`,
  );

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
