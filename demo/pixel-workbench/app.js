const documentWidth = 1254;
const documentHeight = 1254;
const sleeveUrl = "/art-src/wizard-craft/wizard/casting-sleeve-candidate-v2.png";
const paletteColors = [
  "#f7fbff", "#d8efff", "#8dd7ff", "#4abfff", "#1d78e8", "#113eb2",
  "#080f3b", "#16102f", "#2e174d", "#7241c9", "#d79b55", "#7b421f",
  "#ff5d3a", "#e83245", "#ff83c7", "#00ff00", "#000000", "#ffffff",
];

const canvas = document.querySelector("#canvas");
const context = canvas.getContext("2d", { willReadFrequently: true });
context.imageSmoothingEnabled = false;
const viewport = document.querySelector("#viewport");
const status = document.querySelector("#status");
const layersList = document.querySelector("#layers");
const cursorPreview = document.querySelector("#cursor-preview");

const state = {
  layers: [],
  activeLayerId: null,
  tool: "pencil",
  brushSize: 1,
  color: "#f7fbff",
  zoom: 1,
  panX: 0,
  panY: 0,
  pointerDown: false,
  lastPoint: null,
  spaceDown: false,
  panStart: null,
  history: [],
  historyIndex: -1,
  restoring: false,
};

function createLayer(name, image = null) {
  const layerCanvas = document.createElement("canvas");
  layerCanvas.width = documentWidth;
  layerCanvas.height = documentHeight;
  const layerContext = layerCanvas.getContext("2d", { willReadFrequently: true });
  layerContext.imageSmoothingEnabled = false;
  if (image) layerContext.drawImage(image, 0, 0);
  return {
    id: crypto.randomUUID(),
    name,
    canvas: layerCanvas,
    visible: true,
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    flipX: false,
    flipY: false,
  };
}

function activeLayer() {
  return state.layers.find((layer) => layer.id === state.activeLayerId) ?? null;
}

function render() {
  context.clearRect(0, 0, documentWidth, documentHeight);
  for (const layer of state.layers) {
    if (!layer.visible) continue;
    context.save();
    context.globalAlpha = layer.opacity * (
      document.querySelector("#onion").checked && layer.id !== state.activeLayerId ? 0.25 : 1
    );
    const cx = documentWidth / 2 + layer.x;
    const cy = documentHeight / 2 + layer.y;
    context.translate(cx, cy);
    context.rotate((layer.rotation * Math.PI) / 180);
    context.scale(
      layer.scale * (layer.flipX ? -1 : 1),
      layer.scale * (layer.flipY ? -1 : 1),
    );
    context.drawImage(layer.canvas, -documentWidth / 2, -documentHeight / 2);
    context.restore();
  }
  updateCanvasTransform();
  renderLayersList();
  updateControls();
}

function updateCanvasTransform() {
  canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  const gridEnabled = document.querySelector("#grid").checked && state.zoom >= 4;
  canvas.style.backgroundImage = gridEnabled
    ? "linear-gradient(#ffffff16 1px, transparent 1px), linear-gradient(90deg, #ffffff16 1px, transparent 1px)"
    : "none";
  canvas.style.backgroundSize = `${state.zoom}px ${state.zoom}px`;
  document.querySelector("#zoom-output").value = `${Math.round(state.zoom * 100)}%`;
  document.querySelector("#zoom").value = String(Math.round(state.zoom * 100));
}

function renderLayersList() {
  layersList.replaceChildren();
  [...state.layers].reverse().forEach((layer) => {
    const item = document.createElement("li");
    item.className = `layer-item${layer.id === state.activeLayerId ? " active" : ""}`;
    const visible = document.createElement("button");
    visible.type = "button";
    visible.textContent = layer.visible ? "◉" : "○";
    visible.title = layer.visible ? "Hide layer" : "Show layer";
    visible.addEventListener("click", (event) => {
      event.stopPropagation();
      layer.visible = !layer.visible;
      pushHistory("Toggle layer");
      render();
    });
    const thumb = document.createElement("canvas");
    thumb.width = 48;
    thumb.height = 48;
    const thumbContext = thumb.getContext("2d");
    thumbContext.imageSmoothingEnabled = false;
    thumbContext.drawImage(layer.canvas, 0, 0, 48, 48);
    const copy = document.createElement("div");
    copy.className = "layer-copy";
    const name = document.createElement("strong");
    name.textContent = layer.name;
    const meta = document.createElement("small");
    meta.textContent = `${Math.round(layer.opacity * 100)}% · ${Math.round(layer.scale * 100)}%`;
    copy.append(name, meta);
    item.append(visible, thumb, copy);
    item.addEventListener("click", () => {
      state.activeLayerId = layer.id;
      render();
    });
    item.addEventListener("dblclick", () => {
      const next = prompt("Layer name", layer.name);
      if (next?.trim()) {
        layer.name = next.trim();
        pushHistory("Rename layer");
        render();
      }
    });
    layersList.append(item);
  });
}

function updateControls() {
  const layer = activeLayer();
  const disabled = !layer;
  for (const id of [
    "duplicate-layer", "layer-up", "layer-down", "delete-layer",
    "flip-x", "flip-y", "bake-transform", "remove-chroma",
    "export-layer", "layer-opacity",
  ]) document.querySelector(`#${id}`).disabled = disabled;
  if (!layer) return;
  document.querySelector("#layer-x").value = String(Math.round(layer.x));
  document.querySelector("#layer-y").value = String(Math.round(layer.y));
  document.querySelector("#layer-scale").value = String(Math.round(layer.scale * 100));
  document.querySelector("#layer-rotation").value = String(Math.round(layer.rotation));
  document.querySelector("#layer-opacity").value = String(Math.round(layer.opacity * 100));
  document.querySelector("#opacity-output").value = `${Math.round(layer.opacity * 100)}%`;
  document.querySelector("#undo").disabled = state.historyIndex <= 0;
  document.querySelector("#redo").disabled = state.historyIndex >= state.history.length - 1;
}

function serializeState() {
  return {
    activeLayerId: state.activeLayerId,
    layers: state.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      x: layer.x,
      y: layer.y,
      scale: layer.scale,
      rotation: layer.rotation,
      flipX: layer.flipX,
      flipY: layer.flipY,
      pixels: layer.canvas.toDataURL("image/png"),
    })),
  };
}

async function restoreState(snapshot) {
  state.restoring = true;
  const layers = [];
  for (const saved of snapshot.layers) {
    const image = await loadImage(saved.pixels);
    const layer = createLayer(saved.name);
    layer.id = saved.id;
    Object.assign(layer, {
      visible: saved.visible,
      opacity: saved.opacity,
      x: saved.x,
      y: saved.y,
      scale: saved.scale,
      rotation: saved.rotation,
      flipX: saved.flipX,
      flipY: saved.flipY,
    });
    layer.canvas.getContext("2d").drawImage(image, 0, 0);
    layers.push(layer);
  }
  state.layers = layers;
  state.activeLayerId = snapshot.activeLayerId;
  state.restoring = false;
  render();
}

function pushHistory(label) {
  if (state.restoring) return;
  state.history.splice(state.historyIndex + 1);
  state.history.push({ label, snapshot: serializeState() });
  if (state.history.length > 30) state.history.shift();
  state.historyIndex = state.history.length - 1;
  status.textContent = label;
  updateControls();
}

async function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  await restoreState(state.history[state.historyIndex].snapshot);
  status.textContent = `Undo: ${state.history[state.historyIndex].label}`;
}

async function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  await restoreState(state.history[state.historyIndex].snapshot);
  status.textContent = `Redo: ${state.history[state.historyIndex].label}`;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

async function addImportedImage(file) {
  const url = URL.createObjectURL(file);
  const image = await loadImage(url);
  URL.revokeObjectURL(url);
  const layer = createLayer(file.name.replace(/\.[^.]+$/, ""));
  const scale = Math.min(1, documentWidth / image.width, documentHeight / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  layer.canvas.getContext("2d").drawImage(
    image,
    Math.round((documentWidth - width) / 2),
    Math.round((documentHeight - height) / 2),
    width,
    height,
  );
  state.layers.push(layer);
  state.activeLayerId = layer.id;
}

function screenToDocument(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: Math.floor((clientX - rect.left - state.panX) / state.zoom),
    y: Math.floor((clientY - rect.top - state.panY) / state.zoom),
  };
}

function documentToLayer(point, layer) {
  const cx = documentWidth / 2;
  const cy = documentHeight / 2;
  let x = point.x - cx - layer.x;
  let y = point.y - cy - layer.y;
  const angle = (-layer.rotation * Math.PI) / 180;
  const rx = x * Math.cos(angle) - y * Math.sin(angle);
  const ry = x * Math.sin(angle) + y * Math.cos(angle);
  x = rx / layer.scale * (layer.flipX ? -1 : 1);
  y = ry / layer.scale * (layer.flipY ? -1 : 1);
  return { x: Math.floor(x + cx), y: Math.floor(y + cy) };
}

function drawPixelLine(from, to) {
  const layer = activeLayer();
  if (!layer) return;
  const layerContext = layer.canvas.getContext("2d", { willReadFrequently: true });
  const start = documentToLayer(from, layer);
  const end = documentToLayer(to, layer);
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const steps = Math.max(dx, dy, 1);
  if (state.tool === "eraser") {
    layerContext.globalCompositeOperation = "destination-out";
    layerContext.fillStyle = "#000";
  } else {
    layerContext.globalCompositeOperation = "source-over";
    layerContext.fillStyle = state.color;
  }
  for (let index = 0; index <= steps; index += 1) {
    const x = Math.round(start.x + ((end.x - start.x) * index) / steps);
    const y = Math.round(start.y + ((end.y - start.y) * index) / steps);
    layerContext.fillRect(
      x - Math.floor(state.brushSize / 2),
      y - Math.floor(state.brushSize / 2),
      state.brushSize,
      state.brushSize,
    );
  }
  layerContext.globalCompositeOperation = "source-over";
  render();
}

function pickColor(point) {
  const pixel = context.getImageData(point.x, point.y, 1, 1).data;
  const hex = `#${[pixel[0], pixel[1], pixel[2]]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
  setColor(hex);
  status.textContent = `Picked ${hex}`;
}

function setColor(value) {
  state.color = value.toLowerCase();
  document.querySelector("#color").value = state.color;
  document.querySelector("#color-value").textContent = state.color;
}

function fitView() {
  const rect = viewport.getBoundingClientRect();
  state.zoom = Math.min((rect.width - 40) / documentWidth, (rect.height - 40) / documentHeight);
  state.panX = (rect.width - documentWidth * state.zoom) / 2;
  state.panY = (rect.height - documentHeight * state.zoom) / 2;
  render();
}

function bakeTransform() {
  const layer = activeLayer();
  if (!layer) return;
  const baked = document.createElement("canvas");
  baked.width = documentWidth;
  baked.height = documentHeight;
  const bakedContext = baked.getContext("2d");
  bakedContext.imageSmoothingEnabled = false;
  bakedContext.translate(documentWidth / 2 + layer.x, documentHeight / 2 + layer.y);
  bakedContext.rotate((layer.rotation * Math.PI) / 180);
  bakedContext.scale(
    layer.scale * (layer.flipX ? -1 : 1),
    layer.scale * (layer.flipY ? -1 : 1),
  );
  bakedContext.drawImage(layer.canvas, -documentWidth / 2, -documentHeight / 2);
  layer.canvas = baked;
  Object.assign(layer, { x: 0, y: 0, scale: 1, rotation: 0, flipX: false, flipY: false });
  pushHistory("Baked layer transform");
  render();
}

function removeChroma() {
  const layer = activeLayer();
  if (!layer) return;
  bakeTransform();
  const layerContext = layer.canvas.getContext("2d", { willReadFrequently: true });
  const image = layerContext.getImageData(0, 0, documentWidth, documentHeight);
  const key = document.querySelector("#key-color").value;
  const tolerance = Number(document.querySelector("#tolerance").value);
  const target = [
    Number.parseInt(key.slice(1, 3), 16),
    Number.parseInt(key.slice(3, 5), 16),
    Number.parseInt(key.slice(5, 7), 16),
  ];
  for (let index = 0; index < image.data.length; index += 4) {
    const distance = Math.hypot(
      image.data[index] - target[0],
      image.data[index + 1] - target[1],
      image.data[index + 2] - target[2],
    );
    if (distance <= tolerance) image.data[index + 3] = 0;
    else if (distance <= tolerance * 2) {
      image.data[index + 3] = Math.round(
        image.data[index + 3] * ((distance - tolerance) / tolerance),
      );
    }
  }
  layerContext.putImageData(image, 0, 0);
  pushHistory("Removed chroma key");
  render();
}

function downloadCanvas(sourceCanvas, filename) {
  sourceCanvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, "image/png");
}

function bindControls() {
  document.querySelectorAll(".tool").forEach((button) => {
    button.addEventListener("click", () => {
      state.tool = button.dataset.tool;
      document.querySelectorAll(".tool").forEach((item) =>
        item.classList.toggle("active", item === button));
      viewport.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
    });
  });
  document.querySelector("#brush-size").addEventListener("input", (event) => {
    state.brushSize = Number(event.target.value);
    document.querySelector("#brush-output").value = `${state.brushSize} px`;
  });
  document.querySelector("#color").addEventListener("input", (event) => setColor(event.target.value));
  document.querySelector("#key-color").addEventListener("input", (event) => {
    document.querySelector("#key-value").textContent = event.target.value;
  });
  document.querySelector("#tolerance").addEventListener("input", (event) => {
    document.querySelector("#tolerance-output").value = event.target.value;
  });
  document.querySelector("#zoom").addEventListener("input", (event) => {
    state.zoom = Number(event.target.value) / 100;
    render();
  });
  document.querySelector("#grid").addEventListener("change", render);
  document.querySelector("#onion").addEventListener("change", render);
  document.querySelectorAll("[data-bg]").forEach((button) => {
    button.addEventListener("click", () => {
      viewport.className = `viewport ${button.dataset.bg}`;
      document.querySelectorAll("[data-bg]").forEach((item) =>
        item.classList.toggle("active", item === button));
    });
  });
  document.querySelector("#reset-view").addEventListener("click", fitView);
  document.querySelector("#undo").addEventListener("click", undo);
  document.querySelector("#redo").addEventListener("click", redo);
  document.querySelector("#new-layer").addEventListener("click", () => {
    const layer = createLayer(`Paint layer ${state.layers.length}`);
    state.layers.push(layer);
    state.activeLayerId = layer.id;
    pushHistory("Added paint layer");
    render();
  });
  document.querySelector("#import-image").addEventListener("change", async (event) => {
    for (const file of event.target.files) await addImportedImage(file);
    event.target.value = "";
    pushHistory("Imported image layer");
    render();
  });
  document.querySelector("#duplicate-layer").addEventListener("click", () => {
    const layer = activeLayer();
    if (!layer) return;
    const copy = createLayer(`${layer.name} copy`);
    copy.canvas.getContext("2d").drawImage(layer.canvas, 0, 0);
    Object.assign(copy, {
      visible: layer.visible,
      opacity: layer.opacity,
      x: layer.x + 12,
      y: layer.y + 12,
      scale: layer.scale,
      rotation: layer.rotation,
      flipX: layer.flipX,
      flipY: layer.flipY,
    });
    state.layers.push(copy);
    state.activeLayerId = copy.id;
    pushHistory("Duplicated layer");
    render();
  });
  document.querySelector("#delete-layer").addEventListener("click", () => {
    const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
    if (index < 0) return;
    state.layers.splice(index, 1);
    state.activeLayerId = state.layers.at(-1)?.id ?? null;
    pushHistory("Deleted layer");
    render();
  });
  document.querySelector("#layer-up").addEventListener("click", () => moveLayer(1));
  document.querySelector("#layer-down").addEventListener("click", () => moveLayer(-1));
  for (const [id, key, transform] of [
    ["layer-x", "x", Number],
    ["layer-y", "y", Number],
    ["layer-scale", "scale", (value) => Number(value) / 100],
    ["layer-rotation", "rotation", Number],
  ]) {
    document.querySelector(`#${id}`).addEventListener("change", (event) => {
      const layer = activeLayer();
      if (!layer) return;
      layer[key] = transform(event.target.value);
      pushHistory(`Changed ${key}`);
      render();
    });
  }
  document.querySelector("#layer-opacity").addEventListener("input", (event) => {
    const layer = activeLayer();
    if (!layer) return;
    layer.opacity = Number(event.target.value) / 100;
    render();
  });
  document.querySelector("#layer-opacity").addEventListener("change", () => pushHistory("Changed opacity"));
  document.querySelector("#flip-x").addEventListener("click", () => flipLayer("flipX"));
  document.querySelector("#flip-y").addEventListener("click", () => flipLayer("flipY"));
  document.querySelector("#bake-transform").addEventListener("click", bakeTransform);
  document.querySelector("#remove-chroma").addEventListener("click", removeChroma);
  document.querySelector("#export-layer").addEventListener("click", () => {
    const layer = activeLayer();
    if (!layer) return;
    bakeTransform();
    downloadCanvas(layer.canvas, `${layer.name.replace(/\s+/g, "-").toLowerCase()}.png`);
  });
  document.querySelector("#export-composite").addEventListener("click", () =>
    downloadCanvas(canvas, "wizard-craft-pixel-forge-composite.png"));
}

function moveLayer(delta) {
  const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= state.layers.length) return;
  [state.layers[index], state.layers[target]] = [state.layers[target], state.layers[index]];
  pushHistory("Changed layer order");
  render();
}

function flipLayer(key) {
  const layer = activeLayer();
  if (!layer) return;
  layer[key] = !layer[key];
  pushHistory(key === "flipX" ? "Flipped horizontal" : "Flipped vertical");
  render();
}

function bindPointer() {
  viewport.addEventListener("pointerdown", (event) => {
    viewport.setPointerCapture(event.pointerId);
    state.pointerDown = true;
    const point = screenToDocument(event.clientX, event.clientY);
    if (state.tool === "pan" || state.spaceDown || event.button === 1) {
      state.panStart = { clientX: event.clientX, clientY: event.clientY, x: state.panX, y: state.panY };
      viewport.style.cursor = "grabbing";
      return;
    }
    if (point.x < 0 || point.y < 0 || point.x >= documentWidth || point.y >= documentHeight) return;
    if (state.tool === "picker") {
      pickColor(point);
      return;
    }
    state.lastPoint = point;
    drawPixelLine(point, point);
  });
  viewport.addEventListener("pointermove", (event) => {
    const point = screenToDocument(event.clientX, event.clientY);
    document.querySelector("#coordinates").textContent = `x ${point.x} · y ${point.y}`;
    cursorPreview.style.display = state.tool === "pencil" || state.tool === "eraser" ? "block" : "none";
    cursorPreview.style.left = `${event.clientX - viewport.getBoundingClientRect().left - (state.brushSize * state.zoom) / 2}px`;
    cursorPreview.style.top = `${event.clientY - viewport.getBoundingClientRect().top - (state.brushSize * state.zoom) / 2}px`;
    cursorPreview.style.width = `${Math.max(2, state.brushSize * state.zoom)}px`;
    cursorPreview.style.height = `${Math.max(2, state.brushSize * state.zoom)}px`;
    if (!state.pointerDown) return;
    if (state.panStart) {
      state.panX = state.panStart.x + event.clientX - state.panStart.clientX;
      state.panY = state.panStart.y + event.clientY - state.panStart.clientY;
      updateCanvasTransform();
      return;
    }
    if ((state.tool === "pencil" || state.tool === "eraser") && state.lastPoint) {
      drawPixelLine(state.lastPoint, point);
      state.lastPoint = point;
    }
  });
  const endPointer = () => {
    if (state.pointerDown && state.lastPoint) pushHistory(state.tool === "eraser" ? "Erased pixels" : "Drew pixels");
    state.pointerDown = false;
    state.lastPoint = null;
    state.panStart = null;
    viewport.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
  };
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);
  viewport.addEventListener("pointerleave", () => { cursorPreview.style.display = "none"; });
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const before = screenToDocument(event.clientX, event.clientY);
    state.zoom = Math.min(16, Math.max(0.25, state.zoom * (event.deltaY < 0 ? 1.25 : 0.8)));
    state.panX = event.clientX - rect.left - before.x * state.zoom;
    state.panY = event.clientY - rect.top - before.y * state.zoom;
    render();
  }, { passive: false });
}

function bindKeyboard() {
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat) {
      state.spaceDown = true;
      viewport.style.cursor = "grab";
      event.preventDefault();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    const layer = activeLayer();
    if (!layer || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const amount = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") layer.x -= amount;
    if (event.key === "ArrowRight") layer.x += amount;
    if (event.key === "ArrowUp") layer.y -= amount;
    if (event.key === "ArrowDown") layer.y += amount;
    pushHistory("Nudged layer");
    render();
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      state.spaceDown = false;
      viewport.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
    }
  });
}

async function initialize() {
  document.querySelector("#document-size").textContent = `${documentWidth} × ${documentHeight}`;
  const palette = document.querySelector("#palette");
  paletteColors.forEach((color) => {
    const button = document.createElement("button");
    button.className = "swatch";
    button.type = "button";
    button.style.background = color;
    button.title = color;
    button.addEventListener("click", () => setColor(color));
    palette.append(button);
  });
  bindControls();
  bindPointer();
  bindKeyboard();
  try {
    const sleeve = await loadImage(sleeveUrl);
    const layer = createLayer("Approved left casting sleeve", sleeve);
    state.layers.push(layer);
    state.activeLayerId = layer.id;
    pushHistory("Loaded approved sleeve");
  } catch {
    const layer = createLayer("Paint layer 1");
    state.layers.push(layer);
    state.activeLayerId = layer.id;
    pushHistory("Created empty workspace");
    status.textContent = "Sleeve could not preload. Import it as an image layer.";
  }
  requestAnimationFrame(fitView);
}

initialize();
