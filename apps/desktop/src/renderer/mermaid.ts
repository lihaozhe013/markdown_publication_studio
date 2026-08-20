import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

interface MermaidInput {
  id: string;
  source: string;
}

interface MermaidOutput {
  id: string;
  svg?: string;
  error?: string;
  errorCode?: 'mermaid-render-failed' | 'mermaid-svg-invalid';
  rawSummary?: MermaidSvgSummary;
  sanitizedSummary?: MermaidSvgSummary;
  metrics?: MermaidSvgMetrics;
  sanitizedMetrics?: MermaidSvgMetrics;
  removed?: MermaidSanitizationReport;
}

interface MermaidSvgSummary {
  elementCount: number;
  elements: string;
  attributeCount: number;
  attributes: string;
  viewBox?: string;
  width?: string;
  height?: string;
  style?: string;
}

interface MermaidSanitizationReport {
  tags: string[];
  attributes: string[];
}

interface MermaidSvgMetrics {
  viewBox: string;
  clientWidth: number;
  clientHeight: number;
  boundingBoxX: number;
  boundingBoxY: number;
  boundingBoxWidth: number;
  boundingBoxHeight: number;
}

type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral';

declare global {
  interface Window {
    __publicationRenderMermaid?: (
      items: MermaidInput[],
      theme: MermaidTheme,
    ) => Promise<MermaidOutput[]>;
  }
}

const computedStyleProperties = [
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'opacity',
  'overflow',
  'paint-order',
  'padding',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-align',
  'text-decoration',
  'text-rendering',
  'transform',
  'transform-origin',
  'white-space',
];

const allowedInlineStyleProperties = new Set([
  ...computedStyleProperties,
  'aspect-ratio',
  'height',
  'max-height',
  'max-width',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'min-height',
  'min-width',
  'width',
]);

const safeCssValue =
  /^(?!.*(?:expression\s*\(|javascript\s*:|@import|url\s*\(\s*(?!#[\w.:-]+\s*\))[^)]*\)))/iu;

function mermaidConfig(
  theme?: MermaidTheme,
): Parameters<typeof mermaid.initialize>[0] {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    secure: [
      'securityLevel',
      'startOnLoad',
      'theme',
      'themeCSS',
      'themeVariables',
      'fontFamily',
      'altFontFamily',
      'dompurifyConfig',
    ],
    ...(theme === undefined ? {} : { theme }),
    flowchart: { htmlLabels: false },
    sequence: { useMaxWidth: true },
    dompurifyConfig: {
      ADD_TAGS: ['foreignObject', 'div', 'span', 'p', 'br'],
      ALLOW_DATA_ATTR: true,
      ALLOWED_URI_REGEXP: /^(?:#|data:image\/(?:png|gif|jpeg|webp);base64,)/iu,
    },
  };
}

mermaid.initialize(mermaidConfig());

function summarizeSvgMarkup(svg: string): MermaidSvgSummary {
  const elementNames = [...svg.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/giu)].map(
    (match) => match[1]?.toLowerCase() ?? '',
  );
  const attributeNames = [
    ...svg.matchAll(/\s([:\w-]+)\s*=\s*(?:"[^"]*"|'[^']*')/gu),
  ].map((match) => match[1]?.toLowerCase() ?? '');
  const rootAttributes = svg.match(/<svg\b([^>]*)>/iu)?.[1] ?? '';
  const rootAttribute = (name: string): string | undefined =>
    rootAttributes.match(
      new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'iu'),
    )?.[1];
  const viewBox = rootAttribute('viewBox');
  const width = rootAttribute('width');
  const height = rootAttribute('height');
  const style = rootAttribute('style');

  return {
    elementCount: elementNames.length,
    elements: [...new Set(elementNames.filter(Boolean))].sort().join(','),
    attributeCount: attributeNames.length,
    attributes: [...new Set(attributeNames.filter(Boolean))].sort().join(','),
    ...(viewBox === undefined ? {} : { viewBox }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(style === undefined ? {} : { style }),
  };
}

function captureSvgMetrics(svgMarkup: string): MermaidSvgMetrics | undefined {
  const host = document.createElement('div');
  host.style.cssText =
    'position:absolute;left:-100000px;top:0;width:900px;visibility:hidden;';
  host.innerHTML = svgMarkup;
  const svg = host.querySelector<SVGSVGElement>('svg');
  if (!svg) return undefined;
  document.body.append(host);
  try {
    const rectangle = svg.getBoundingClientRect();
    const bounds = svg.getBBox();
    const viewBox = svg.viewBox.baseVal;
    return {
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
      clientWidth: rectangle.width,
      clientHeight: rectangle.height,
      boundingBoxX: bounds.x,
      boundingBoxY: bounds.y,
      boundingBoxWidth: bounds.width,
      boundingBoxHeight: bounds.height,
    };
  } catch {
    return undefined;
  } finally {
    host.remove();
  }
}

function bakeComputedStyles(svg: SVGSVGElement): void {
  const elements = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  for (const element of elements) {
    const computed = window.getComputedStyle(element);
    for (const property of computedStyleProperties) {
      const value = computed.getPropertyValue(property).trim();
      if (value && value !== 'normal' && safeCssValue.test(value)) {
        element.style.setProperty(property, value);
      }
    }
  }
  for (const style of svg.querySelectorAll('style')) style.remove();
}

function sanitizeInlineStyles(root: SVGSVGElement): void {
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    const declarations = [...element.style].flatMap((property) => {
      const value = element.style.getPropertyValue(property).trim();
      return allowedInlineStyleProperties.has(property) &&
        safeCssValue.test(value)
        ? [[property, value] as const]
        : [];
    });
    element.removeAttribute('style');
    if (declarations.length > 0) {
      element.setAttribute(
        'style',
        declarations
          .map(([property, value]) => `${property}:${value}`)
          .join(';'),
      );
    }
  }
}

function restrictForeignObjectContent(root: SVGSVGElement): void {
  const allowedTags = new Set(['DIV', 'SPAN', 'P', 'BR']);
  for (const foreignObject of root.querySelectorAll('foreignObject')) {
    for (const element of [
      ...foreignObject.querySelectorAll<HTMLElement>('*'),
    ].reverse()) {
      if (!allowedTags.has(element.tagName)) {
        const parent = element.parentNode;
        if (!parent) continue;
        while (element.firstChild)
          parent.insertBefore(element.firstChild, element);
        element.remove();
        continue;
      }
      for (const attribute of [...element.attributes]) {
        if (attribute.name !== 'class' && attribute.name !== 'style') {
          element.removeAttribute(attribute.name);
        }
      }
    }
  }
}

function validateSanitizedSvg(root: SVGSVGElement, rawViewBox: string): void {
  if (root.getAttribute('viewBox') !== rawViewBox) {
    throw new Error('Mermaid SVG sanitization changed the root viewBox.');
  }
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    for (const attribute of [...element.attributes]) {
      if (/^on/iu.test(attribute.name)) {
        throw new Error('Mermaid SVG contains an event handler attribute.');
      }
      if (
        ['href', 'xlink:href', 'src'].includes(attribute.name.toLowerCase())
      ) {
        if (!attribute.value.startsWith('#')) {
          throw new Error(
            'Mermaid SVG contains an external resource reference.',
          );
        }
      }
    }
    const style = element.getAttribute('style') ?? '';
    if (!safeCssValue.test(style)) {
      throw new Error('Mermaid SVG contains unsafe inline CSS.');
    }
  }
}

function sanitizeRenderedSvg(svgMarkup: string): {
  svg: string;
  report: MermaidSanitizationReport;
} {
  const host = document.createElement('div');
  host.innerHTML = svgMarkup;
  const svg = host.querySelector<SVGSVGElement>('svg');
  if (!svg || host.querySelectorAll('svg').length !== 1) {
    throw new Error('Mermaid returned an invalid SVG root.');
  }
  const rawViewBox = svg.getAttribute('viewBox');
  if (!rawViewBox) throw new Error('Mermaid SVG is missing a viewBox.');
  svg.classList.add('mermaid-diagram');
  bakeComputedStyles(svg);

  const cleaned = DOMPurify.sanitize(svg.outerHTML, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_TAGS: ['foreignObject', 'div', 'span', 'p', 'br'],
    ADD_ATTR: ['style'],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:#|data:image\/(?:png|gif|jpeg|webp);base64,)/iu,
    FORBID_TAGS: ['embed', 'iframe', 'image', 'object', 'script', 'style'],
  });
  const cleanedHost = document.createElement('div');
  cleanedHost.innerHTML = cleaned;
  const cleanedSvg = cleanedHost.querySelector<SVGSVGElement>('svg');
  if (
    !cleanedSvg ||
    cleanedHost.querySelectorAll('svg').length !== 1 ||
    cleanedSvg.getAttribute('viewBox') !== rawViewBox
  ) {
    throw new Error('Mermaid SVG sanitization changed the root viewBox.');
  }
  restrictForeignObjectContent(cleanedSvg);
  sanitizeInlineStyles(cleanedSvg);
  validateSanitizedSvg(cleanedSvg, rawViewBox);
  const removed = DOMPurify.removed.map((entry) => {
    if (!entry || typeof entry !== 'object') return 'unknown';
    if ('element' in entry && entry.element instanceof Element) {
      return `tag:${entry.element.tagName.toLowerCase()}`;
    }
    if (
      'attribute' in entry &&
      entry.attribute &&
      typeof entry.attribute === 'object' &&
      'name' in entry.attribute &&
      typeof entry.attribute.name === 'string'
    ) {
      return `attr:${entry.attribute.name.toLowerCase()}`;
    }
    return 'unknown';
  });
  return {
    svg: cleanedSvg.outerHTML,
    report: {
      tags: [...new Set(removed.filter((item) => item.startsWith('tag:')))],
      attributes: [
        ...new Set(removed.filter((item) => item.startsWith('attr:'))),
      ],
    },
  };
}

window.__publicationRenderMermaid = async (items, theme) => {
  mermaid.initialize(mermaidConfig(theme));
  const output: MermaidOutput[] = [];
  for (const item of items) {
    try {
      const rendered = await mermaid.render(item.id, item.source);
      const rawSummary = summarizeSvgMarkup(rendered.svg);
      const metrics = captureSvgMetrics(rendered.svg);
      let sanitized: {
        svg: string;
        report: MermaidSanitizationReport;
      };
      try {
        sanitized = sanitizeRenderedSvg(rendered.svg);
      } catch (error) {
        output.push({
          id: item.id,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'mermaid-svg-invalid',
        });
        continue;
      }
      const sanitizedMetrics = captureSvgMetrics(sanitized.svg);
      const sanitizedSummary = summarizeSvgMarkup(sanitized.svg);
      output.push({
        id: item.id,
        svg: sanitized.svg,
        rawSummary,
        sanitizedSummary,
        ...(metrics === undefined ? {} : { metrics }),
        ...(sanitizedMetrics === undefined ? {} : { sanitizedMetrics }),
        removed: sanitized.report,
      });
    } catch (error) {
      output.push({
        id: item.id,
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'mermaid-render-failed',
      });
    }
  }
  return output;
};

export {};
