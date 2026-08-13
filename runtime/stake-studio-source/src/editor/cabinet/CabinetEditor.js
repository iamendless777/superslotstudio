/**
 * CabinetEditor — layered visual editor for game cabinet composition.
 * Drag/drop layers, position/scale/opacity, add effects, character rigging.
 */
export class CabinetEditor {
  constructor(container, project, onDirty) {
    this.container = container;
    this.project = project;
    this.onDirty = onDirty;
    this.selectedLayer = null;
    this.dragging = null;
    this.dragOffset = { x: 0, y: 0 };
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="cabinet-editor">
        <div class="cabinet-sidebar">
          <div class="sidebar-section">
            <h3>Layers</h3>
            <button class="btn-small" id="addLayer">+ Add Layer</button>
            <div class="layer-list" id="layerList"></div>
          </div>
          <div class="sidebar-section" id="layerProps" style="display:none">
            <h3>Properties</h3>
            <div class="prop-grid" id="propGrid"></div>
          </div>
          <div class="sidebar-section">
            <h3>Presets</h3>
            <div class="preset-grid">
              <button class="preset-btn" data-preset="standard-5x3">Standard 5x3</button>
              <button class="preset-btn" data-preset="large-6x5">Large 6x5</button>
              <button class="preset-btn" data-preset="cluster-7x7">Cluster 7x7</button>
              <button class="preset-btn" data-preset="megaways-6x7">Megaways 6x7</button>
            </div>
          </div>
        </div>
        <div class="cabinet-canvas-wrap">
          <div class="canvas-toolbar">
            <button class="tool-btn active" data-tool="select" title="Select">&#9654;</button>
            <button class="tool-btn" data-tool="move" title="Move">&#8853;</button>
            <span class="toolbar-sep"></span>
            <select id="canvasZoom">
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1" selected>100%</option>
              <option value="1.5">150%</option>
            </select>
            <span class="toolbar-sep"></span>
            <button class="tool-btn" id="toggleGrid" title="Toggle grid">&#9638;</button>
            <span class="toolbar-sep"></span>
            <select id="viewportPreset">
              <option value="1280x800">Desktop (1280x800)</option>
              <option value="375x812">Mobile (375x812)</option>
              <option value="400x300">Mini-player (400x300)</option>
              <option value="768x1024">Tablet (768x1024)</option>
            </select>
          </div>
          <div class="cabinet-canvas" id="cabinetCanvas">
            <div class="canvas-stage" id="canvasStage"></div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.renderLayers();
    this.renderStage();
  }

  bindEvents() {
    document.getElementById('addLayer').addEventListener('click', () => this.addLayer());

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => this.applyPreset(btn.dataset.preset));
    });

    document.getElementById('canvasZoom').addEventListener('change', (e) => {
      document.getElementById('canvasStage').style.transform = `scale(${e.target.value})`;
    });

    document.getElementById('viewportPreset').addEventListener('change', (e) => {
      const [w, h] = e.target.value.split('x').map(Number);
      this.project.theme.cabinet.width = w;
      this.project.theme.cabinet.height = h;
      this.renderStage();
      this.onDirty();
    });

    document.getElementById('toggleGrid').addEventListener('click', () => {
      document.getElementById('canvasStage').classList.toggle('show-grid');
    });
  }

  addLayer(overrides = {}) {
    const layer = {
      id: crypto.randomUUID(),
      name: overrides.name || `Layer ${this.project.theme.cabinet.layers.length + 1}`,
      type: overrides.type || 'image',
      src: overrides.src || '',
      x: overrides.x || 0,
      y: overrides.y || 0,
      width: overrides.width || this.project.theme.cabinet.width,
      height: overrides.height || this.project.theme.cabinet.height,
      opacity: overrides.opacity ?? 1,
      zIndex: this.project.theme.cabinet.layers.length,
      visible: true,
      locked: false,
      effects: [],
      blendMode: 'normal',
    };
    this.project.theme.cabinet.layers.push(layer);
    this.renderLayers();
    this.renderStage();
    this.selectLayer(layer.id);
    this.onDirty();
  }

  selectLayer(id) {
    this.selectedLayer = id;
    this.renderLayers();
    this.renderProps();

    document.querySelectorAll('.stage-layer').forEach(el => {
      el.classList.toggle('selected', el.dataset.layerId === id);
    });
  }

  renderLayers() {
    const list = document.getElementById('layerList');
    const layers = [...this.project.theme.cabinet.layers].sort((a, b) => b.zIndex - a.zIndex);

    list.innerHTML = layers.map(layer => `
      <div class="layer-item ${layer.id === this.selectedLayer ? 'selected' : ''} ${layer.locked ? 'locked' : ''}" data-id="${layer.id}">
        <button class="layer-vis" data-action="visibility" title="Toggle visibility">${layer.visible ? '&#9673;' : '&#9675;'}</button>
        <span class="layer-name">${layer.name}</span>
        <span class="layer-type">${layer.type}</span>
        <button class="layer-lock" data-action="lock" title="Toggle lock">${layer.locked ? '&#128274;' : '&#128275;'}</button>
        <button class="layer-del" data-action="delete" title="Delete">&#10005;</button>
      </div>
    `).join('');

    list.querySelectorAll('.layer-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.dataset.action) return;
        this.selectLayer(item.dataset.id);
      });

      item.querySelector('[data-action="visibility"]').addEventListener('click', () => {
        const layer = this.getLayer(item.dataset.id);
        layer.visible = !layer.visible;
        this.renderLayers();
        this.renderStage();
        this.onDirty();
      });

      item.querySelector('[data-action="lock"]').addEventListener('click', () => {
        const layer = this.getLayer(item.dataset.id);
        layer.locked = !layer.locked;
        this.renderLayers();
        this.onDirty();
      });

      item.querySelector('[data-action="delete"]').addEventListener('click', () => {
        this.project.theme.cabinet.layers = this.project.theme.cabinet.layers.filter(l => l.id !== item.dataset.id);
        if (this.selectedLayer === item.dataset.id) this.selectedLayer = null;
        this.renderLayers();
        this.renderStage();
        this.renderProps();
        this.onDirty();
      });
    });
  }

  renderProps() {
    const panel = document.getElementById('layerProps');
    const grid = document.getElementById('propGrid');
    if (!this.selectedLayer) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    const layer = this.getLayer(this.selectedLayer);
    if (!layer) return;

    grid.innerHTML = `
      <label>Name <input type="text" data-prop="name" value="${layer.name}"></label>
      <label>Type
        <select data-prop="type">
          <option value="image" ${layer.type === 'image' ? 'selected' : ''}>Image</option>
          <option value="reel-area" ${layer.type === 'reel-area' ? 'selected' : ''}>Reel Area</option>
          <option value="character" ${layer.type === 'character' ? 'selected' : ''}>Character</option>
          <option value="ui" ${layer.type === 'ui' ? 'selected' : ''}>UI Element</option>
          <option value="effect" ${layer.type === 'effect' ? 'selected' : ''}>Effect Zone</option>
          <option value="frame" ${layer.type === 'frame' ? 'selected' : ''}>Frame/Border</option>
          <option value="overlay" ${layer.type === 'overlay' ? 'selected' : ''}>Overlay</option>
        </select>
      </label>
      <label>Image <input type="file" accept="image/*" data-prop="src"></label>
      <div class="prop-row">
        <label>X <input type="number" data-prop="x" value="${layer.x}"></label>
        <label>Y <input type="number" data-prop="y" value="${layer.y}"></label>
      </div>
      <div class="prop-row">
        <label>W <input type="number" data-prop="width" value="${layer.width}"></label>
        <label>H <input type="number" data-prop="height" value="${layer.height}"></label>
      </div>
      <label>Opacity <input type="range" min="0" max="1" step="0.05" data-prop="opacity" value="${layer.opacity}"> <span>${Math.round(layer.opacity * 100)}%</span></label>
      <label>Blend Mode
        <select data-prop="blendMode">
          ${['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'difference', 'exclusion', 'luminosity'].map(m =>
            `<option value="${m}" ${layer.blendMode === m ? 'selected' : ''}>${m}</option>`
          ).join('')}
        </select>
      </label>
      <label>Z-Index <input type="number" data-prop="zIndex" value="${layer.zIndex}"></label>
    `;

    grid.querySelectorAll('[data-prop]').forEach(input => {
      const prop = input.dataset.prop;
      input.addEventListener('change', (e) => {
        if (prop === 'src') {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            layer.src = ev.target.result;
            this.renderStage();
            this.onDirty();
          };
          reader.readAsDataURL(file);
          return;
        }
        const val = input.type === 'number' || input.type === 'range' ? parseFloat(input.value) : input.value;
        layer[prop] = val;
        this.renderStage();
        this.renderLayers();
        this.onDirty();
        if (prop === 'opacity') {
          input.nextElementSibling.textContent = `${Math.round(val * 100)}%`;
        }
      });
    });
  }

  renderStage() {
    const stage = document.getElementById('canvasStage');
    const cab = this.project.theme.cabinet;
    stage.style.width = `${cab.width}px`;
    stage.style.height = `${cab.height}px`;

    const layers = [...cab.layers].sort((a, b) => a.zIndex - b.zIndex);

    stage.innerHTML = layers.map(layer => {
      if (!layer.visible) return '';
      const style = [
        `position:absolute`,
        `left:${layer.x}px`,
        `top:${layer.y}px`,
        `width:${layer.width}px`,
        `height:${layer.height}px`,
        `opacity:${layer.opacity}`,
        `z-index:${layer.zIndex}`,
        `mix-blend-mode:${layer.blendMode || 'normal'}`,
        layer.id === this.selectedLayer ? 'outline:2px solid #00d4ff' : '',
      ].join(';');

      if (layer.src) {
        return `<div class="stage-layer" data-layer-id="${layer.id}" style="${style}">
          <img src="${layer.src}" style="width:100%;height:100%;object-fit:contain;pointer-events:none;">
        </div>`;
      }

      const colors = {
        'reel-area': 'rgba(0,100,255,0.15)',
        'character': 'rgba(255,100,0,0.15)',
        'ui': 'rgba(0,255,100,0.15)',
        'effect': 'rgba(255,0,255,0.15)',
        'frame': 'rgba(255,255,0,0.15)',
        'overlay': 'rgba(255,255,255,0.1)',
        'image': 'rgba(100,100,100,0.15)',
      };

      return `<div class="stage-layer" data-layer-id="${layer.id}" style="${style};background:${colors[layer.type] || colors.image};display:flex;align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,0.3)">
        <span style="color:rgba(255,255,255,0.5);font-size:11px">${layer.name}<br>${layer.type}</span>
      </div>`;
    }).join('');

    stage.querySelectorAll('.stage-layer').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        const id = el.dataset.layerId;
        const layer = this.getLayer(id);
        if (layer.locked) return;
        this.selectLayer(id);
        this.dragging = id;
        this.dragOffset = { x: e.clientX - layer.x, y: e.clientY - layer.y };
      });
    });

    stage.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const layer = this.getLayer(this.dragging);
      if (!layer) return;
      layer.x = Math.round(e.clientX - this.dragOffset.x);
      layer.y = Math.round(e.clientY - this.dragOffset.y);
      const el = stage.querySelector(`[data-layer-id="${this.dragging}"]`);
      if (el) {
        el.style.left = `${layer.x}px`;
        el.style.top = `${layer.y}px`;
      }
    });

    stage.addEventListener('mouseup', () => {
      if (this.dragging) {
        this.renderProps();
        this.onDirty();
        this.dragging = null;
      }
    });
  }

  applyPreset(preset) {
    this.project.theme.cabinet.layers = [];
    const w = this.project.theme.cabinet.width;
    const h = this.project.theme.cabinet.height;

    const layouts = {
      'standard-5x3': [
        { name: 'Background', type: 'image', x: 0, y: 0, width: w, height: h, zIndex: 0 },
        { name: 'Frame', type: 'frame', x: w * 0.1, y: h * 0.05, width: w * 0.8, height: h * 0.75, zIndex: 1 },
        { name: 'Cabinet', type: 'reel-area', x: w * 0.12, y: h * 0.08, width: w * 0.76, height: h * 0.69, zIndex: 2 },
        { name: 'Logo Overlay', type: 'overlay', x: w * 0.25, y: 0, width: w * 0.5, height: h * 0.12, zIndex: 3 },
        { name: 'Character', type: 'character', x: w * 0.85, y: h * 0.3, width: w * 0.15, height: h * 0.5, zIndex: 4 },
        { name: 'Win Display', type: 'ui', x: w * 0.3, y: h * 0.82, width: w * 0.4, height: h * 0.08, zIndex: 5 },
        { name: 'Controls', type: 'ui', x: w * 0.1, y: h * 0.9, width: w * 0.8, height: h * 0.1, zIndex: 6 },
        { name: 'Particle Layer', type: 'effect', x: 0, y: 0, width: w, height: h, zIndex: 7, opacity: 0 },
        { name: 'Win Overlay', type: 'effect', x: 0, y: 0, width: w, height: h, zIndex: 8, opacity: 0 },
        { name: 'UI Overlay', type: 'overlay', x: 0, y: 0, width: w, height: h, zIndex: 9, opacity: 0 },
      ],
      'large-6x5': [
        { name: 'Background', type: 'image', x: 0, y: 0, width: w, height: h, zIndex: 0 },
        { name: 'Frame', type: 'frame', x: w * 0.05, y: h * 0.05, width: w * 0.9, height: h * 0.78, zIndex: 1 },
        { name: 'Cabinet', type: 'reel-area', x: w * 0.07, y: h * 0.08, width: w * 0.86, height: h * 0.72, zIndex: 2 },
        { name: 'Logo Overlay', type: 'overlay', x: w * 0.25, y: 0, width: w * 0.5, height: h * 0.1, zIndex: 3 },
        { name: 'Multiplier Display', type: 'ui', x: w * 0.4, y: h * 0.01, width: w * 0.2, height: h * 0.06, zIndex: 4 },
        { name: 'Character Left', type: 'character', x: -w * 0.02, y: h * 0.2, width: w * 0.12, height: h * 0.6, zIndex: 5 },
        { name: 'Character Right', type: 'character', x: w * 0.9, y: h * 0.2, width: w * 0.12, height: h * 0.6, zIndex: 5 },
        { name: 'Controls', type: 'ui', x: w * 0.1, y: h * 0.88, width: w * 0.8, height: h * 0.12, zIndex: 6 },
        { name: 'Particle Layer', type: 'effect', x: 0, y: 0, width: w, height: h, zIndex: 7, opacity: 0 },
        { name: 'Win Overlay', type: 'effect', x: 0, y: 0, width: w, height: h, zIndex: 8, opacity: 0 },
      ],
    };

    layouts['cluster-7x7'] = layouts['large-6x5'];
    layouts['megaways-6x7'] = layouts['large-6x5'];

    const preset_layers = layouts[preset] || layouts['standard-5x3'];
    preset_layers.forEach(l => this.addLayer(l));

    this.renderLayers();
    this.renderStage();
    this.onDirty();
  }

  getLayer(id) {
    return this.project.theme.cabinet.layers.find(l => l.id === id);
  }
}
