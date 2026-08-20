export interface SvgMarkupSummary {
  byteLength: number;
  elementCount: number;
  elements: string;
  attributeCount: number;
  attributes: string;
  viewBox?: string;
  width?: string;
  height?: string;
  style?: string;
}

function summarizeNames(values: Iterable<string>): string {
  return [...new Set(values)].sort().join(',');
}

function rootSvgAttribute(svg: string, name: string): string | undefined {
  const attributes = svg.match(/<svg\b([^>]*)>/iu)?.[1];
  if (!attributes) return undefined;
  return attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'iu'),
  )?.[1];
}

export function summarizeSvgMarkup(svg: string): SvgMarkupSummary {
  const elementNames = [...svg.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>/giu)].map(
    (match) => match[1]?.toLowerCase() ?? '',
  );
  const attributeNames = [
    ...svg.matchAll(/\s([:\w-]+)\s*=\s*(?:"[^"]*"|'[^']*')/gu),
  ].map((match) => match[1]?.toLowerCase() ?? '');

  const viewBox = rootSvgAttribute(svg, 'viewBox');
  const width = rootSvgAttribute(svg, 'width');
  const height = rootSvgAttribute(svg, 'height');
  const style = rootSvgAttribute(svg, 'style');
  return {
    byteLength: new TextEncoder().encode(svg).byteLength,
    elementCount: elementNames.length,
    elements: summarizeNames(elementNames.filter(Boolean)),
    attributeCount: attributeNames.length,
    attributes: summarizeNames(attributeNames.filter(Boolean)),
    ...(viewBox === undefined ? {} : { viewBox }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(style === undefined ? {} : { style }),
  };
}

function namesIn(
  summary: SvgMarkupSummary,
  property: 'elements' | 'attributes',
) {
  return new Set(summary[property].split(',').filter(Boolean));
}

export function removedSvgStructure(
  before: SvgMarkupSummary,
  after: SvgMarkupSummary,
): { elements: string; attributes: string } {
  const afterElements = namesIn(after, 'elements');
  const afterAttributes = namesIn(after, 'attributes');
  return {
    elements: [...namesIn(before, 'elements')]
      .filter((name) => !afterElements.has(name))
      .join(','),
    attributes: [...namesIn(before, 'attributes')]
      .filter((name) => !afterAttributes.has(name))
      .join(','),
  };
}

export function katexFontAssetSummary(stylesheet: string): {
  relativeFontUrlCount: number;
  dataFontUrlCount: number;
  fontFamilies: string;
} {
  const fontUrls = [...stylesheet.matchAll(/url\(([^)]+)\)/giu)].map(
    (match) => match[1]?.trim() ?? '',
  );
  const fontFamilies = [...stylesheet.matchAll(/font-family:([^;{}]+)/giu)].map(
    (match) => match[1]?.replaceAll('"', '').trim() ?? '',
  );
  return {
    relativeFontUrlCount: fontUrls.filter((url) => !url.startsWith('data:'))
      .length,
    dataFontUrlCount: fontUrls.filter((url) => url.startsWith('data:')).length,
    fontFamilies: summarizeNames(fontFamilies.filter(Boolean)),
  };
}
