const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeRenderedMetrics(metrics = {}) {
  return {
    sampledPixels: Math.max(0, finite(metrics.sampledPixels)),
    visiblePixels: Math.max(0, finite(metrics.visiblePixels)),
    alphaMass: Math.max(0, finite(metrics.alphaMass)),
    widthFraction: Math.max(0, finite(metrics.widthFraction)),
    heightFraction: Math.max(0, finite(metrics.heightFraction)),
    boundsAreaFraction: Math.max(0, finite(metrics.boundsAreaFraction)),
    occupancy: Math.max(0, finite(metrics.occupancy)),
    centroidX: finite(metrics.centroidX, 0.5),
    centroidY: finite(metrics.centroidY, 0.5),
    edgeTouchFraction: Math.max(0, finite(metrics.edgeTouchFraction)),
    components: Math.max(0, Math.round(finite(metrics.components))),
    largestComponentShare: Math.max(0, finite(metrics.largestComponentShare)),
    thumbnail: Array.isArray(metrics.thumbnail)
      ? metrics.thumbnail.slice(0, 256).map(value => Math.max(0, Math.min(255, Math.round(finite(value)))))
      : [],
  };
}

export function analyzeRenderedPixels({ pixels, width, height } = {}) {
  const data = pixels || [];
  const sourceWidth = Math.max(0, Math.round(finite(width)));
  const sourceHeight = Math.max(0, Math.round(finite(height)));
  if (!sourceWidth || !sourceHeight || data.length < sourceWidth * sourceHeight * 4) return normalizeRenderedMetrics();
  const stride = Math.max(1, Math.ceil(Math.max(sourceWidth, sourceHeight) / 128));
  const gridWidth = Math.ceil(sourceWidth / stride);
  const gridHeight = Math.ceil(sourceHeight / stride);
  const mask = new Uint8Array(gridWidth * gridHeight);
  const thumbnail = new Array(256).fill(0);
  const thumbnailSamples = new Uint16Array(256);
  let visiblePixels = 0;
  let alphaMass = 0;
  let minX = gridWidth;
  let minY = gridHeight;
  let maxX = -1;
  let maxY = -1;
  let centroidX = 0;
  let centroidY = 0;
  let edgeVisible = 0;
  let edgeSamples = 0;
  for (let gridY = 0; gridY < gridHeight; gridY++) {
    const sourceY = Math.min(sourceHeight - 1, gridY * stride);
    for (let gridX = 0; gridX < gridWidth; gridX++) {
      const sourceX = Math.min(sourceWidth - 1, gridX * stride);
      const alpha = finite(data[(sourceY * sourceWidth + sourceX) * 4 + 3]);
      alphaMass += alpha / 255;
      const thumbnailX = Math.min(15, Math.floor(gridX / Math.max(1, gridWidth) * 16));
      const thumbnailY = Math.min(15, Math.floor(gridY / Math.max(1, gridHeight) * 16));
      const thumbnailIndex = thumbnailY * 16 + thumbnailX;
      thumbnail[thumbnailIndex] += alpha;
      thumbnailSamples[thumbnailIndex]++;
      const visible = alpha > 16;
      const edge = gridX === 0 || gridY === 0 || gridX === gridWidth - 1 || gridY === gridHeight - 1;
      if (edge) {
        edgeSamples++;
        if (visible) edgeVisible++;
      }
      if (!visible) continue;
      const index = gridY * gridWidth + gridX;
      mask[index] = 1;
      visiblePixels++;
      minX = Math.min(minX, gridX);
      minY = Math.min(minY, gridY);
      maxX = Math.max(maxX, gridX);
      maxY = Math.max(maxY, gridY);
      centroidX += gridX;
      centroidY += gridY;
    }
  }
  let components = 0;
  let largestComponent = 0;
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue;
    components++;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = start;
    mask[start] = 2;
    while (head < tail) {
      const current = queue[head++];
      size++;
      const x = current % gridWidth;
      const y = Math.floor(current / gridWidth);
      const neighbours = [
        x > 0 ? current - 1 : -1,
        x + 1 < gridWidth ? current + 1 : -1,
        y > 0 ? current - gridWidth : -1,
        y + 1 < gridHeight ? current + gridWidth : -1,
      ];
      for (const next of neighbours) {
        if (next >= 0 && mask[next] === 1) {
          mask[next] = 2;
          queue[tail++] = next;
        }
      }
    }
    largestComponent = Math.max(largestComponent, size);
  }
  const boundsWidth = visiblePixels ? maxX - minX + 1 : 0;
  const boundsHeight = visiblePixels ? maxY - minY + 1 : 0;
  const boundsArea = boundsWidth * boundsHeight;
  const sampledPixels = gridWidth * gridHeight;
  return normalizeRenderedMetrics({
    sampledPixels,
    visiblePixels,
    alphaMass: alphaMass / Math.max(1, sampledPixels),
    widthFraction: boundsWidth / Math.max(1, gridWidth),
    heightFraction: boundsHeight / Math.max(1, gridHeight),
    boundsAreaFraction: boundsArea / Math.max(1, sampledPixels),
    occupancy: visiblePixels / Math.max(1, boundsArea),
    centroidX: visiblePixels ? centroidX / visiblePixels / Math.max(1, gridWidth - 1) : 0.5,
    centroidY: visiblePixels ? centroidY / visiblePixels / Math.max(1, gridHeight - 1) : 0.5,
    edgeTouchFraction: edgeVisible / Math.max(1, edgeSamples),
    components,
    largestComponentShare: largestComponent / Math.max(1, visiblePixels),
    thumbnail: thumbnail.map((sum, index) => sum / Math.max(1, thumbnailSamples[index])),
  });
}

export function compareRenderedThumbnails(left = [], right = []) {
  if (left.length !== 256 || right.length !== 256) return 1;
  return left.reduce((sum, value, index) => sum + Math.abs(finite(value) - finite(right[index])), 0) / (256 * 255);
}
