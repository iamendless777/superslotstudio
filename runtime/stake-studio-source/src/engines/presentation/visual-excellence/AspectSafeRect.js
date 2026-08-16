function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} must be greater than zero.`);
  return number;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Fit an authored source into an overlay rectangle without stretching it.
 * The authored overlay still owns its offset and extent; aspect correction is
 * contained and centered inside those bounds.
 */
export function fitAspectPreservingRect(bounds, sourceAspectRatio = 1) {
  const x = finiteOr(bounds?.x, 0);
  const y = finiteOr(bounds?.y, 0);
  const width = positive(bounds?.width, 'Overlay bounds width');
  const height = positive(bounds?.height, 'Overlay bounds height');
  const aspectRatio = positive(sourceAspectRatio, 'Authored source aspect ratio');
  const boundsAspectRatio = width / height;
  const fittedWidth = aspectRatio >= boundsAspectRatio ? width : height * aspectRatio;
  const fittedHeight = aspectRatio >= boundsAspectRatio ? width / aspectRatio : height;
  return {
    x: x + (width - fittedWidth) / 2,
    y: y + (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
    aspectRatio: fittedWidth / fittedHeight,
    sourceAspectRatio: aspectRatio,
  };
}

export function createAspectPreservingOverlayRect({ cellRect, overlay = {}, sourceAspectRatio = 1 } = {}) {
  const cellX = finiteOr(cellRect?.x, 0);
  const cellY = finiteOr(cellRect?.y, 0);
  const cellWidth = positive(cellRect?.width, 'Motion cell width');
  const cellHeight = positive(cellRect?.height, 'Motion cell height');
  const left = finiteOr(overlay.left, 0);
  const top = finiteOr(overlay.top, 0);
  const widthPercent = Math.max(1, finiteOr(overlay.width, 100));
  const heightPercent = Math.max(1, finiteOr(overlay.height, 100));
  const bounds = {
    x: cellX + cellWidth * left / 100,
    y: cellY + cellHeight * top / 100,
    width: cellWidth * widthPercent / 100,
    height: cellHeight * heightPercent / 100,
  };
  return { bounds, safe: fitAspectPreservingRect(bounds, sourceAspectRatio) };
}
