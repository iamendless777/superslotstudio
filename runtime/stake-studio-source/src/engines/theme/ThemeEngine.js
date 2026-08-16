export class ThemeEngine {
  constructor(project) {
    this.project = project;
  }

  getCabinetLayers() {
    return [...this.project.theme.cabinet.layers].sort((a, b) => a.zIndex - b.zIndex);
  }

  getVisibleLayers() {
    return this.getCabinetLayers().filter(l => l.visible);
  }

  getLayersByType(type) {
    return this.getCabinetLayers().filter(l => l.type === type);
  }

  getSymbolsByTier(tier) {
    return (this.project.theme.symbols || []).filter(s => s.tier === tier);
  }

  getPayTable() {
    return (this.project.theme.symbols || [])
      .filter(s => s.tier !== 'special')
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.tier] ?? 3) - (order[b.tier] ?? 3);
      })
      .map(s => ({ id: s.id, name: s.name, tier: s.tier, payouts: s.payouts }));
  }

  exportAssetManifest() {
    const assets = [];
    for (const layer of this.getCabinetLayers()) {
      if (layer.src) assets.push({ type: 'layer', name: layer.name, src: layer.src });
    }
    for (const sym of this.project.theme.symbols || []) {
      if (sym.src) assets.push({ type: 'symbol', name: sym.name, src: sym.src });
    }
    return assets;
  }
}
