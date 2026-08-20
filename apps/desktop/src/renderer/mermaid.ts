import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import {
  compareMermaidGeometry,
  type MermaidGeometryReport,
  type MermaidGeometrySignature,
  type MermaidSvgMetrics,
} from '@markdown-publication/shared';

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
  styledMetrics?: MermaidSvgMetrics;
  sanitizedMetrics?: MermaidSvgMetrics;
  restoredMetrics?: MermaidSvgMetrics;
  geometry?: MermaidGeometryReport;
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

type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral';

declare global {
  interface Window {
    __publicationRenderMermaid?: (
      items: MermaidInput[],
      theme: MermaidTheme,
    ) => Promise<MermaidOutput[]>;
  }
}

const svgComputedStyleProperties = [
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
  'opacity',
  'overflow',
  'paint-order',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-decoration',
  'text-rendering',
  'visibility',
  'white-space',
];

const htmlComputedStyleProperties = [
  'background-color',
  'border-bottom-color',
  'border-bottom-style',
  'border-bottom-width',
  'border-left-color',
  'border-left-style',
  'border-left-width',
  'border-right-color',
  'border-right-style',
  'border-right-width',
  'border-top-color',
  'border-top-style',
  'border-top-width',
  'box-sizing',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'opacity',
  'overflow',
  'overflow-wrap',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'vertical-align',
  'visibility',
  'white-space',
  'word-break',
];

const allowedInlineStyleProperties = new Set([
  ...svgComputedStyleProperties,
  ...htmlComputedStyleProperties,
  'aspect-ratio',
  'height',
  'max-height',
  'max-width',
  'margin',
  'min-height',
  'min-width',
  'width',
]);

const safeCssValue =
  /^(?!.*(?:expression\s*\(|javascript\s*:|@import|url\s*\(\s*(?!#[\w.:-]+\s*\))[^)]*\)))/isu;
const svgNamespace = 'http://www.w3.org/2000/svg';
const unsafeMermaidSvgTagNames = [
  'animate',
  'animatecolor',
  'animatemotion',
  'animatetransform',
  'embed',
  'iframe',
  'image',
  'object',
  'script',
  'set',
];

const geometryAttributeNames = new Set([
  'alignment-baseline',
  'clip-path',
  'clippathunits',
  'cx',
  'cy',
  'd',
  'filter',
  'filterunits',
  'fx',
  'fy',
  'gradienttransform',
  'gradientunits',
  'height',
  'marker-end',
  'marker-mid',
  'marker-start',
  'markerheight',
  'markerunits',
  'markerwidth',
  'mask',
  'maskcontentunits',
  'maskunits',
  'offset',
  'orient',
  'points',
  'preserveaspectratio',
  'patterncontentunits',
  'patterntransform',
  'patternunits',
  'primitiveunits',
  'r',
  'refx',
  'refy',
  'result',
  'rx',
  'ry',
  'stddeviation',
  'transform',
  'transform-origin',
  'viewbox',
  'width',
  'x',
  'x1',
  'x2',
  'y',
  'y1',
  'y2',
]);

interface ForeignObjectRecord {
  attributes: Array<{ name: string; value: string }>;
  innerHtml: string;
}

interface SanitizedMermaidSvg {
  svg: string;
  report: MermaidSanitizationReport;
  styledMetrics?: MermaidSvgMetrics;
  sanitizedMetrics?: MermaidSvgMetrics;
  restoredMetrics?: MermaidSvgMetrics;
  geometry: MermaidGeometryReport;
}

function assertSafeViewBox(viewBox: string): void {
  const values = viewBox
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (
    values.length !== 4 ||
    values.some((value) => !Number.isFinite(value)) ||
    (values[2] ?? 0) <= 0 ||
    (values[3] ?? 0) <= 0
  ) {
    throw new Error('Mermaid SVG has an invalid viewBox.');
  }
}

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
      'htmlLabels',
      'flowchart',
      'sequence',
      'dompurifyConfig',
    ],
    ...(theme === undefined ? {} : { theme }),
    htmlLabels: true,
    flowchart: { htmlLabels: true, useMaxWidth: true, wrappingWidth: 200 },
    sequence: { useMaxWidth: true },
    dompurifyConfig: {
      ADD_TAGS: ['foreignObject', 'div', 'span', 'p', 'br'],
      ALLOW_DATA_ATTR: true,
      ALLOWED_URI_REGEXP: /^(?:#|data:image\/(?:png|gif|jpeg|webp);base64,)/iu,
    },
  };
}

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
  const elements = [
    svg,
    ...svg.querySelectorAll<HTMLElement | SVGElement>('*'),
  ];
  for (const element of elements) {
    const computed = window.getComputedStyle(element);
    const properties =
      element instanceof HTMLElement
        ? htmlComputedStyleProperties
        : svgComputedStyleProperties;
    for (const property of properties) {
      const value = computed.getPropertyValue(property).trim();
      if (value && safeCssValue.test(value)) {
        element.style.setProperty(property, value);
      }
    }
  }
  for (const style of svg.querySelectorAll('style')) style.remove();
}

function validateSafeElementAttributes(element: Element): void {
  for (const attribute of [...element.attributes]) {
    if (/^on/iu.test(attribute.name)) {
      throw new Error('Mermaid SVG contains an event handler attribute.');
    }
    if (
      ['href', 'xlink:href', 'src'].includes(attribute.name.toLowerCase()) &&
      !attribute.value.startsWith('#')
    ) {
      throw new Error('Mermaid SVG contains an external resource reference.');
    }
  }
}

function validateSafeInlineStyle(style: string): void {
  if (!safeCssValue.test(style)) {
    throw new Error('Mermaid SVG contains unsafe inline CSS.');
  }
}

function validateSvgBeforeStyleBake(svg: SVGSVGElement): void {
  const elements = [
    svg,
    ...svg.querySelectorAll<HTMLElement | SVGElement>('*'),
  ];
  if (
    elements.some((element) =>
      unsafeMermaidSvgTagNames.includes(element.tagName.toLowerCase()),
    )
  ) {
    throw new Error('Mermaid SVG contains an unsafe element.');
  }
  for (const element of elements) {
    validateSafeElementAttributes(element);
    validateSafeInlineStyle(element.getAttribute('style') ?? '');
  }
  for (const style of svg.querySelectorAll('style')) {
    if (!safeCssValue.test(style.textContent ?? '')) {
      throw new Error('Mermaid SVG contains an unsafe stylesheet.');
    }
  }
}

function collectGeometrySignature(
  svg: SVGSVGElement,
): MermaidGeometrySignature {
  const entries: string[] = [];
  let geometryAttributeCount = 0;
  for (const element of [svg, ...svg.querySelectorAll<SVGElement>('*')]) {
    if (element.namespaceURI !== svgNamespace) continue;
    const attributes = [...element.attributes]
      .filter((attribute) =>
        geometryAttributeNames.has(attribute.name.toLowerCase()),
      )
      .filter((attribute) => {
        if (element !== svg) return true;
        return !['height', 'preserveaspectratio', 'width'].includes(
          attribute.name.toLowerCase(),
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    geometryAttributeCount += attributes.length;
    entries.push(
      [
        element.tagName.toLowerCase(),
        ...attributes.map(
          (attribute) => `${attribute.name.toLowerCase()}=${attribute.value}`,
        ),
      ].join('|'),
    );
  }
  return {
    elementCount: entries.length,
    geometryAttributeCount,
    entries,
  };
}

function extractForeignObjects(
  svg: SVGSVGElement,
): Map<string, ForeignObjectRecord> {
  const records = new Map<string, ForeignObjectRecord>();
  for (const [index, foreignObject] of [
    ...svg.querySelectorAll('foreignObject'),
  ].entries()) {
    const id = `mermaid-foreign-object-${index}`;
    const marker = document.createElementNS(svgNamespace, 'g');
    marker.setAttribute('data-publication-foreign-object-id', id);
    records.set(id, {
      attributes: [...foreignObject.attributes]
        .filter((attribute) =>
          ['x', 'y', 'width', 'height', 'transform', 'style'].includes(
            attribute.name,
          ),
        )
        .map((attribute) => ({
          name: attribute.name,
          value: attribute.value,
        })),
      innerHtml: foreignObject.innerHTML,
    });
    foreignObject.replaceWith(marker);
  }
  return records;
}

function restoreForeignObjects(
  svg: SVGSVGElement,
  records: Map<string, ForeignObjectRecord>,
  htmlPurifier: typeof DOMPurify,
): void {
  const htmlSanitizer = {
    ALLOWED_TAGS: ['div', 'span', 'p', 'br'],
    ALLOWED_ATTR: ['class', 'style'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^$/u,
    FORBID_TAGS: ['iframe', 'object', 'embed', 'script', 'style'],
  };
  for (const marker of [
    ...svg.querySelectorAll<SVGGElement>(
      'g[data-publication-foreign-object-id]',
    ),
  ]) {
    const id = marker.getAttribute('data-publication-foreign-object-id');
    const record = id === null ? undefined : records.get(id);
    if (!record) throw new Error('Mermaid foreignObject marker is empty.');

    const restored = document.createElementNS(svgNamespace, 'foreignObject');
    for (const attribute of record.attributes) {
      if (
        ['x', 'y', 'width', 'height', 'transform', 'style'].includes(
          attribute.name,
        ) &&
        safeCssValue.test(attribute.value)
      ) {
        restored.setAttribute(attribute.name, attribute.value);
      }
    }
    const content = htmlPurifier.sanitize(record.innerHtml, htmlSanitizer);
    const contentHost = document.createElement('div');
    contentHost.innerHTML = content;
    restored.append(...contentHost.childNodes);
    marker.replaceWith(restored);
  }
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

function validateSanitizedSvg(root: SVGSVGElement, rawViewBox: string): void {
  const viewBox = root.getAttribute('viewBox') ?? root.getAttribute('viewbox');
  if (viewBox !== rawViewBox) {
    throw new Error('Mermaid SVG sanitization changed the root viewBox.');
  }
  for (const element of [root, ...root.querySelectorAll<HTMLElement>('*')]) {
    validateSafeElementAttributes(element);
    validateSafeInlineStyle(element.getAttribute('style') ?? '');
  }
}

function collectRemovedEntries(
  purifier: typeof DOMPurify,
): MermaidSanitizationReport {
  const removed = purifier.removed.map((entry) => {
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
    tags: [...new Set(removed.filter((item) => item.startsWith('tag:')))],
    attributes: [
      ...new Set(removed.filter((item) => item.startsWith('attr:'))),
    ],
  };
}

function mergeSanitizationReports(
  ...reports: MermaidSanitizationReport[]
): MermaidSanitizationReport {
  return {
    tags: [...new Set(reports.flatMap((report) => report.tags))],
    attributes: [...new Set(reports.flatMap((report) => report.attributes))],
  };
}

function sanitizeRenderedSvg(svgMarkup: string): SanitizedMermaidSvg {
  const host = document.createElement('div');
  host.style.cssText =
    'position:absolute;left:-100000px;top:0;width:900px;pointer-events:none;';
  host.innerHTML = svgMarkup;
  const svg = host.querySelector<SVGSVGElement>('svg');
  if (!svg || host.querySelectorAll('svg').length !== 1) {
    throw new Error('Mermaid returned an invalid SVG root.');
  }
  const rawViewBox = svg.getAttribute('viewBox');
  if (!rawViewBox) throw new Error('Mermaid SVG is missing a viewBox.');
  assertSafeViewBox(rawViewBox);
  validateSvgBeforeStyleBake(svg);
  document.body.append(host);
  try {
    svg.classList.add('mermaid-diagram');
    bakeComputedStyles(svg);
    const styledMetrics = captureSvgMetrics(svg.outerHTML);
    const styledSignature = collectGeometrySignature(svg);
    const foreignObjects = extractForeignObjects(svg);
    const svgPurifier = DOMPurify(window);
    const htmlPurifier = DOMPurify(window);
    svgPurifier.clearConfig();
    htmlPurifier.clearConfig();
    svgPurifier.sanitize(svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      NAMESPACE: svgNamespace,
      IN_PLACE: true,
      ADD_TAGS: ['use'],
      ALLOW_DATA_ATTR: true,
      FORBID_TAGS: [...unsafeMermaidSvgTagNames, 'style'],
    });
    const sanitizedMetrics = captureSvgMetrics(svg.outerHTML);
    const svgRemoved = collectRemovedEntries(svgPurifier);
    const cleanedSvg = svg;
    const sanitizedViewBox =
      cleanedSvg.getAttribute('viewBox') ?? cleanedSvg.getAttribute('viewbox');
    if (sanitizedViewBox !== rawViewBox) {
      if (sanitizedViewBox === null) {
        cleanedSvg.setAttribute('viewBox', rawViewBox);
      } else {
        throw new Error('Mermaid SVG sanitization changed the root viewBox.');
      }
    } else {
      cleanedSvg.setAttribute('viewBox', rawViewBox);
      cleanedSvg.removeAttribute('viewbox');
    }
    cleanedSvg.setAttribute('width', '100%');
    cleanedSvg.removeAttribute('height');
    restoreForeignObjects(cleanedSvg, foreignObjects, htmlPurifier);
    const htmlRemoved = collectRemovedEntries(htmlPurifier);
    sanitizeInlineStyles(cleanedSvg);
    validateSanitizedSvg(cleanedSvg, rawViewBox);
    const restoredMetrics = captureSvgMetrics(cleanedSvg.outerHTML);
    const restoredSignature = collectGeometrySignature(cleanedSvg);
    const geometry = compareMermaidGeometry(
      styledSignature,
      restoredSignature,
      styledMetrics,
      restoredMetrics,
    );
    return {
      svg: cleanedSvg.outerHTML,
      report: mergeSanitizationReports(svgRemoved, htmlRemoved),
      ...(styledMetrics === undefined ? {} : { styledMetrics }),
      ...(sanitizedMetrics === undefined ? {} : { sanitizedMetrics }),
      ...(restoredMetrics === undefined ? {} : { restoredMetrics }),
      geometry,
    };
  } finally {
    host.remove();
  }
}

window.__publicationRenderMermaid = async (items, theme) => {
  mermaid.initialize(mermaidConfig(theme));
  await document.fonts.ready;
  const output: MermaidOutput[] = [];
  for (const item of items) {
    try {
      const rendered = await mermaid.render(item.id, item.source);
      const rawSummary = summarizeSvgMarkup(rendered.svg);
      const metrics = captureSvgMetrics(rendered.svg);
      let sanitized: SanitizedMermaidSvg;
      try {
        sanitized = sanitizeRenderedSvg(rendered.svg);
      } catch (error) {
        output.push({
          id: item.id,
          error: error instanceof Error ? error.message : String(error),
          errorCode: 'mermaid-svg-invalid',
          rawSummary,
          ...(metrics === undefined ? {} : { metrics }),
        });
        continue;
      }
      if (!sanitized.geometry.preserved) {
        output.push({
          id: item.id,
          error: `Mermaid SVG geometry was not preserved: ${sanitized.geometry.firstDifference ?? 'content bounds changed'}.`,
          errorCode: 'mermaid-svg-invalid',
          rawSummary,
          sanitizedSummary: summarizeSvgMarkup(sanitized.svg),
          ...(metrics === undefined ? {} : { metrics }),
          ...(sanitized.styledMetrics === undefined
            ? {}
            : { styledMetrics: sanitized.styledMetrics }),
          ...(sanitized.sanitizedMetrics === undefined
            ? {}
            : { sanitizedMetrics: sanitized.sanitizedMetrics }),
          ...(sanitized.restoredMetrics === undefined
            ? {}
            : { restoredMetrics: sanitized.restoredMetrics }),
          geometry: sanitized.geometry,
          removed: sanitized.report,
        });
        continue;
      }
      const sanitizedSummary = summarizeSvgMarkup(sanitized.svg);
      output.push({
        id: item.id,
        svg: sanitized.svg,
        rawSummary,
        sanitizedSummary,
        ...(metrics === undefined ? {} : { metrics }),
        ...(sanitized.styledMetrics === undefined
          ? {}
          : { styledMetrics: sanitized.styledMetrics }),
        ...(sanitized.sanitizedMetrics === undefined
          ? {}
          : { sanitizedMetrics: sanitized.sanitizedMetrics }),
        ...(sanitized.restoredMetrics === undefined
          ? {}
          : { restoredMetrics: sanitized.restoredMetrics }),
        geometry: sanitized.geometry,
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
