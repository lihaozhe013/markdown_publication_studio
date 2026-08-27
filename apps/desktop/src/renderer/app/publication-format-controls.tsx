import {
  PAGE_SIZE_DEFINITIONS,
  PageSizeIdSchema,
  type CoverAssetReference,
  type CoverSelection,
  type PageSizeId,
} from '@markdown-publication/shared';

export type CoverSlot = 'front' | 'back';

export const coverSlotLabels: Record<CoverSlot, string> = {
  front: 'Front cover',
  back: 'Back cover',
};

export function getCoverSizeError(
  covers: CoverSelection,
  pageSize: PageSizeId,
): string | undefined {
  const expected = PAGE_SIZE_DEFINITIONS[pageSize];
  for (const slot of ['front', 'back'] as const) {
    const asset = covers[slot];
    if (!asset || asset.kind !== 'pdf') continue;
    if (asset.widthPt === undefined || asset.heightPt === undefined) {
      return `${coverSlotLabels[slot]} PDF dimensions are unavailable. Choose it again.`;
    }
    if (
      Math.abs(asset.widthPt - expected.widthPt) > 0.5 ||
      Math.abs(asset.heightPt - expected.heightPt) > 0.5
    ) {
      return `${coverSlotLabels[slot]} PDF is ${asset.widthPt.toFixed(2)} × ${asset.heightPt.toFixed(2)} pt; ${pageSize} requires ${expected.widthPt.toFixed(2)} × ${expected.heightPt.toFixed(2)} pt.`;
    }
  }
  return undefined;
}

interface CoverAssetControlProps {
  asset: CoverAssetReference | undefined;
  disabled: boolean;
  slot: CoverSlot;
  onChoose: (slot: CoverSlot) => void;
  onClear: (slot: CoverSlot) => void;
}

function CoverAssetControl({
  asset,
  disabled,
  slot,
  onChoose,
  onClear,
}: CoverAssetControlProps): React.JSX.Element {
  return (
    <div className="cover-asset-control">
      <div className="cover-asset-heading">
        <span>{coverSlotLabels[slot]}</span>
        {asset ? (
          <button
            className="cover-clear-button"
            type="button"
            onClick={() => onClear(slot)}
            disabled={disabled}
          >
            Clear
          </button>
        ) : null}
      </div>
      {asset ? (
        <>
          <p className="cover-asset-name" title={asset.name}>
            {asset.name}
          </p>
          <p className="muted cover-asset-details">
            {asset.kind === 'pdf'
              ? `PDF · ${asset.widthPt?.toFixed(2)} × ${asset.heightPt?.toFixed(2)} pt`
              : 'PNG/JPEG · stretched to fill the page'}
          </p>
        </>
      ) : null}
      <button
        className="cover-choose-button"
        type="button"
        onClick={() => onChoose(slot)}
        disabled={disabled}
      >
        {asset ? 'Replace asset' : 'Choose image or PDF'}
      </button>
    </div>
  );
}

interface PublicationFormatControlsProps {
  covers: CoverSelection;
  disabled: boolean;
  pageSize: PageSizeId;
  onChooseCover: (slot: CoverSlot) => void;
  onClearCover: (slot: CoverSlot) => void;
  onPageSizeChange: (pageSize: PageSizeId) => void;
}

export function PublicationFormatControls({
  covers,
  disabled,
  pageSize,
  onChooseCover,
  onClearCover,
  onPageSizeChange,
}: PublicationFormatControlsProps): React.JSX.Element {
  const coverSizeError = getCoverSizeError(covers, pageSize);

  return (
    <>
      <div className="panel-block page-size-panel">
        <label className="eyebrow theme-label" htmlFor="page-size-select">
          PAGE SIZE
        </label>
        <select
          id="page-size-select"
          className="theme-select"
          value={pageSize}
          disabled={disabled}
          onChange={(event) => {
            const parsed = PageSizeIdSchema.safeParse(event.target.value);
            if (parsed.success) onPageSizeChange(parsed.data);
          }}
        >
          {(
            Object.values(PAGE_SIZE_DEFINITIONS) as readonly {
              id: PageSizeId;
              label: string;
            }[]
          ).map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.label}
            </option>
          ))}
        </select>
        <p className="muted page-size-help">
          Cover PDFs must match this portrait page size. Images are stretched to
          fill it.
        </p>
      </div>
      <div className="panel-block covers-panel">
        <p className="eyebrow">COVERS</p>
        <p className="muted covers-help">
          Applied to PDF export only. Choose one image or single-page PDF per
          slot.
        </p>
        <CoverAssetControl
          asset={covers.front}
          disabled={disabled}
          slot="front"
          onChoose={onChooseCover}
          onClear={onClearCover}
        />
        <CoverAssetControl
          asset={covers.back}
          disabled={disabled}
          slot="back"
          onChoose={onChooseCover}
          onClear={onClearCover}
        />
        {coverSizeError ? (
          <p className="diagnostic error cover-size-error">{coverSizeError}</p>
        ) : null}
      </div>
    </>
  );
}
