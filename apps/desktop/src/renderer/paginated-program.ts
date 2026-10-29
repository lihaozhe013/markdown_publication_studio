import type {
  LayoutOverflowReport,
  LayoutPageReport,
  PaginationApplyOptions,
  PaginationApplyReport,
  PaginationPassReport,
  PaginationProgramOptions,
} from '@markdown-publication/shared';

declare global {
  interface Window {
    /** Lay out the loaded publication into fixed page boxes. */
    __publicationPaginate?: (
      options: PaginationProgramOptions,
    ) => Promise<PaginationPassReport>;
    /** Apply resolved labels, folios, and templates, then serialize. */
    __publicationApply?: (
      options: PaginationApplyOptions,
    ) => PaginationApplyReport;
  }
}

interface PagedPreviewer {
  preview(
    content?: unknown,
    stylesheets?: unknown,
    renderTo?: unknown,
  ): Promise<{ total: number }>;
}

interface PagedRuntime {
  Previewer: new () => PagedPreviewer;
  Handler: new () => object;
  registerHandlers(handlers: unknown): void;
}

/** Lay out the loaded publication into fixed page boxes. */
async function paginateProgram(
  options: PaginationProgramOptions,
): Promise<PaginationPassReport> {
  const runtime = (window as unknown as { Paged?: PagedRuntime }).Paged;
  if (!runtime) throw new Error('The pagination engine is not available.');
  const diagnostics: PaginationPassReport['diagnostics'] = [];

  const baseStyle = document.createElement('style');
  baseStyle.dataset.publicationPagination = 'true';
  baseStyle.textContent = `
    html { background: ${options.screenBackground}; }
    body, body.markdown-body { width: auto !important; max-width: none !important;
      margin: 0 !important; padding: 0 !important; background: transparent !important; }
    .markdown-body .chapter, .markdown-body .publication-toc {
      width: auto !important; max-width: none !important; margin: 0 !important;
      padding: 0 !important; box-shadow: none !important; background: transparent !important; }
    .publication-page-break { display: block !important; break-after: page !important; }
    .publication-page-template { display: block !important; break-before: page !important;
      height: 0 !important; margin: 0 !important; padding: 0 !important; }
    .publication-toc { break-after: page; }
    .publication-toc .publication-toc-page {
      display: inline-block; flex: 0 0 ${options.tocPageColumnWidthEm}em;
      width: ${options.tocPageColumnWidthEm}em; text-align: right; white-space: nowrap;
      font-variant-numeric: tabular-nums; overflow-wrap: normal; }
    .publication-folio { position: absolute; left: 0; right: 0; bottom: 6mm;
      text-align: center; line-height: 1; pointer-events: none;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pagedjs_pages { display: flex; flex-direction: column; align-items: center;
      gap: 24px; padding: 24px 0; margin: 0; }
    .pagedjs_page { background: ${options.pageBackground}; margin: 0 !important;
      box-shadow: 0 12px 40px rgb(16 35 58 / 14%); flex: 0 0 auto;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pagedjs_pagebox { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print {
      @page { size: ${options.pageSize}; margin: 0 !important; }
      html, body { background: #fff !important; }
      .pagedjs_pages { gap: 0 !important; padding: 0 !important; display: block !important; }
      .pagedjs_page { box-shadow: none !important; margin: 0 !important;
        break-after: page; page-break-after: always; }
      .pagedjs_page:last-child { break-after: auto; page-break-after: auto; }
    }
  `;
  document.head.append(baseStyle);

  for (const span of document.querySelectorAll<HTMLElement>(
    '[data-toc-page-for]',
  )) {
    const target = span.dataset.tocPageFor;
    if (target && options.prefillLabels[target] !== undefined) {
      span.textContent = options.prefillLabels[target] ?? '';
    }
  }

  // Template markers start a page; the engine may drop the marker element while
  // chunking, so tag the following content with the template it belongs to.
  for (const marker of document.querySelectorAll<HTMLElement>(
    '.publication-page-template',
  )) {
    const declared = marker.dataset.pageTemplate;
    const owner =
      declared === 'section' ||
      marker.classList.contains('publication-page-template--section')
        ? 'section'
        : declared === 'default'
          ? 'default'
          : 'invalid';
    for (
      let node = marker.nextElementSibling;
      node;
      node = node.nextElementSibling
    ) {
      (node as HTMLElement).dataset.pageTemplateOwner = owner;
    }
  }

  const paginationStyles = [
    {
      // Break rules must reach the engine as parsed stylesheets; Paged.js reads
      // them while chunking, before the artifact styles apply.
      'publication-pagination.css': `@page {
        size: ${options.pageSize};
        margin: ${options.pageMarginTop} ${options.pageMarginRight} ${options.pageMarginBottom} ${options.pageMarginLeft};
      }
      .publication-page-break { display: block; break-after: page; }
      .publication-page-template { display: block; break-before: page; height: 0; }
      .publication-toc { break-after: page; }
      .code-block, .code-block pre, .code-block code, pre.shiki {
        break-inside: auto; white-space: pre-wrap; overflow-wrap: anywhere;
      }`,
    },
  ];

  class RepeatTableHeaders extends runtime.Handler {
    private readonly headers = new Map<string, HTMLElement>();

    afterParsed(content: HTMLElement): void {
      for (const table of content.querySelectorAll<HTMLTableElement>(
        'table[data-ref]',
      )) {
        const header = table.querySelector(':scope > thead');
        if (header) {
          this.headers.set(
            table.dataset.ref ?? '',
            header.cloneNode(true) as HTMLElement,
          );
        }
      }
    }

    afterOverflowAdded(content: HTMLElement): void {
      for (const table of content.querySelectorAll<HTMLTableElement>(
        'table[data-ref]',
      )) {
        const current = table.querySelector(':scope > thead');
        if (current && getComputedStyle(current).visibility === 'visible') {
          continue;
        }
        current?.remove();
        const original = this.headers.get(table.dataset.ref ?? '');
        if (!original) continue;
        const header = original.cloneNode(true) as HTMLElement;
        for (const node of [header, ...header.querySelectorAll('*')]) {
          node.removeAttribute('id');
          node.removeAttribute('data-id');
          node.removeAttribute('data-ref');
        }
        header.dataset.repeatedHeader = 'true';
        table.insertBefore(header, table.firstChild);
      }
    }
  }
  runtime.registerHandlers(RepeatTableHeaders);

  const previewer = new runtime.Previewer();
  const flow = await previewer.preview(undefined, paginationStyles);

  // Paged.js omits duplicate IDs on cloned blocks. Restore deterministic
  // heading anchors so contents links and PDF destinations stay clickable.
  const pages = [...document.querySelectorAll<HTMLElement>('.pagedjs_page')];
  const hasId = (id: string): boolean =>
    pages.some((page) => page.querySelector(`[id="${CSS.escape(id)}"]`));
  for (const heading of pages.flatMap((page) => [
    ...page.querySelectorAll<HTMLElement>('[data-toc-id]'),
  ])) {
    const id = heading.dataset.tocId;
    if (!id || hasId(id)) continue;
    heading.id = id;
  }

  const pageOf = (id: string): number =>
    pages.findIndex((page) => page.querySelector(`[id="${CSS.escape(id)}"]`)) +
    1;
  const anchorPages: Record<string, number> = {};
  for (const span of document.querySelectorAll<HTMLElement>(
    '[data-toc-page-for]',
  )) {
    const target = span.dataset.tocPageFor;
    if (!target || anchorPages[target] !== undefined) continue;
    anchorPages[target] = pageOf(target);
  }

  const geometry = JSON.stringify(
    pages.flatMap((page) =>
      [...page.querySelectorAll('[data-toc="true"] a')].map((anchor) => {
        const rect = anchor.getBoundingClientRect();
        return [
          Math.round(rect.x * 100),
          Math.round(rect.y * 100),
          Math.round(rect.width * 100),
          Math.round(rect.height * 100),
        ];
      }),
    ),
  );

  const overflow = collectOverflow(pages);
  const pageReports: LayoutPageReport[] = [];
  const reportedTemplates = new Set<string>();
  let template: 'default' | 'section' = 'default';
  for (const page of pages) {
    const owner = page.querySelector<HTMLElement>('[data-page-template-owner]')
      ?.dataset.pageTemplateOwner;
    if (owner === 'section' || owner === 'default') {
      template = owner;
    } else if (owner === 'invalid' && !reportedTemplates.has('invalid')) {
      reportedTemplates.add('invalid');
      diagnostics.push({
        severity: 'warning',
        code: 'page-template-unknown',
        message:
          'Unknown page template; the default template was used. Use a lowercase template name such as {section}.',
        details: { template: 'invalid' },
      });
    }
    const kind = page.querySelector('[data-toc="true"]') ? 'toc' : 'body';
    pageReports.push({
      kind,
      template: kind === 'toc' ? 'toc' : template,
    });
  }
  for (const item of overflow.slice(0, 20)) {
    diagnostics.push({
      severity: 'warning',
      code: 'layout-overflow',
      message: `Page ${item.page} content extends past the printable content box.`,
      details: {
        page: item.page,
        tag: item.tag,
        text: item.text,
        width: item.width,
        height: item.height,
      },
    });
  }

  return {
    pageCount: pages.length || flow.total,
    pages: pageReports,
    anchorPages,
    geometry,
    overflow,
    diagnostics,
  };
}

/** Apply resolved labels, folios, and templates, then serialize the artifact. */
function applyProgram(options: PaginationApplyOptions): PaginationApplyReport {
  const pages = [...document.querySelectorAll<HTMLElement>('.pagedjs_page')];
  if (pages.length !== options.folios.length) {
    throw new Error(
      `Layout produced ${pages.length} pages but ${options.folios.length} folios were planned.`,
    );
  }

  for (const span of document.querySelectorAll<HTMLElement>(
    '[data-toc-page-for]',
  )) {
    const target = span.dataset.tocPageFor;
    if (target && options.labels[target] !== undefined) {
      span.textContent = options.labels[target] ?? '';
    }
  }
  const geometry = JSON.stringify(
    pages.flatMap((page) =>
      [...page.querySelectorAll('[data-toc="true"] a')].map((anchor) => {
        const rect = anchor.getBoundingClientRect();
        return [
          Math.round(rect.x * 100),
          Math.round(rect.y * 100),
          Math.round(rect.width * 100),
          Math.round(rect.height * 100),
        ];
      }),
    ),
  );

  pages.forEach((page, index) => {
    const box = page.querySelector<HTMLElement>('.pagedjs_pagebox');
    if (!box) return;
    const template = options.templates[index] ?? 'default';
    const background =
      options.templateBackgrounds[template] ?? options.pageBackground;
    box.style.backgroundColor = background;
    const folio = options.folios[index];
    if (!folio) return;
    const element = document.createElement('div');
    element.className = 'publication-folio';
    element.dataset.pageNumber = String(index + 1);
    element.textContent = folio;
    element.style.fontFamily = options.folioFontFamily;
    element.style.fontSize = `${options.folioFontSizePt}pt`;
    element.style.fontWeight = String(options.folioFontWeight);
    element.style.fontStyle = options.folioFontStyle;
    element.style.color = options.folioColor;
    box.append(element);
  });

  // The engine keeps the unrendered source in an inert template; drop it so the
  // artifact carries one copy of the content and no duplicate source anchors.
  document.querySelector('template[data-ref="pagedjs-content"]')?.remove();

  document.documentElement.dataset.publicationPaginated = 'true';
  document.documentElement.dataset.publicationPageCount = String(pages.length);

  const overflow = collectOverflow(pages);
  const html = `<!doctype html>\n${document.documentElement.outerHTML}`;
  return {
    html,
    geometryStable: geometry === options.geometry,
    overflow,
  };
}

/** Detect content that visibly escapes the printable content box. */
function collectOverflow(
  pages: readonly HTMLElement[],
): LayoutOverflowReport[] {
  const reports: LayoutOverflowReport[] = [];
  pages.forEach((page, index) => {
    const content = page.querySelector<HTMLElement>('.pagedjs_page_content');
    if (!content) return;
    const bounds = content.getBoundingClientRect();
    const candidates = content.querySelectorAll<HTMLElement>(
      'h1,h2,h3,h4,p,pre,table,img,svg.mermaid-diagram,.math-block',
    );
    for (const node of candidates) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (
        rect.left >= bounds.left - 1 &&
        rect.right <= bounds.right + 1 &&
        rect.top >= bounds.top - 1 &&
        rect.bottom <= bounds.bottom + 1
      ) {
        continue;
      }
      reports.push({
        page: index + 1,
        tag: node.tagName,
        text: (node.textContent ?? '').trim().slice(0, 80),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        offsetLeft: Math.round(rect.left - bounds.left),
        offsetTop: Math.round(rect.top - bounds.top),
      });
    }
  });
  return reports;
}

window.__publicationPaginate = paginateProgram;
window.__publicationApply = applyProgram;
