/** Presentation helpers for the export completion dialog. */

export type ExportKind = 'pdf' | 'html';

export interface ExportOutputSummary {
  fileName: string;
  directory: string;
}

export function exportKindLabel(kind: ExportKind): string {
  return kind === 'pdf' ? 'PDF' : 'HTML';
}

/** Split an output path into the file name and the folder that holds it. */
export function describeExportOutput(outputPath: string): ExportOutputSummary {
  const separator = Math.max(
    outputPath.lastIndexOf('/'),
    outputPath.lastIndexOf('\\'),
  );
  if (separator <= 0) {
    return { fileName: outputPath, directory: '' };
  }
  return {
    fileName: outputPath.slice(separator + 1),
    directory: outputPath.slice(0, separator),
  };
}
