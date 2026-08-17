/**
 * Thin wrapper around PreviewPanel that injects Motion template playback.
 * Avoids editing the large PreviewPanel.js surface.
 */
import { PreviewPanel as BasePreviewPanel } from './PreviewPanel.js?orchestration=20260815-40';
import { playMotionTemplate } from '../../engines/presentation/playMotionTemplate.js';

export class PreviewPanel extends BasePreviewPanel {
  render() {
    super.render();
    this.injectMotionControls();
  }

  injectMotionControls() {
    if (this.disposed) return;
    const trigger = this.container.querySelector('#previewAnimationTrigger');
    if (!trigger) return;
    if (this.container.querySelector('#previewMotionPlay')) return;

    const label = document.createElement('label');
    label.className = 'preview-mode';
    label.innerHTML = `Motion
      <select id="previewMotionTemplate">
        <option value="classic-nine">classic-nine</option>
        <option value="cluster-hex">cluster-hex</option>
      </select>`;

    const button = document.createElement('button');
    button.className = 'tool-btn';
    button.id = 'previewMotionPlay';
    button.type = 'button';
    button.textContent = 'Play Motion';

    trigger.insertAdjacentElement('afterend', label);
    label.insertAdjacentElement('afterend', button);

    button.addEventListener('click', () => {
      void this.playMotionStylePreview();
    });
  }

  async playMotionStylePreview() {
    if (this.spinning) return;
    const templateId =
      this.container.querySelector('#previewMotionTemplate')?.value || 'classic-nine';
    this.motionPlayback?.stop?.();
    try {
      this.motionPlayback = await playMotionTemplate(templateId, {
        project: this.project,
        onAnimState: (state) => this.setAnimationState(state),
        onTumbleAction: (action, phase, cue) => {
          this.recordPlaybackEvent('motionCue', {
            action,
            phase,
            cue: cue?.cue,
            depth: cue?.depth,
          });
          const cells = Array.isArray(cue?.cells) ? cue.cells : [];
          if (cells.length && (action === 'clear-tile' || action === 'win-highlight' || phase === 'remove' || phase === 'win')) {
            const positions = cells
              .map((cell) => String(cell).split(':').map(Number))
              .filter(([reel, row]) => Number.isFinite(reel) && Number.isFinite(row));
            if (positions.length) this.pulseMechanicCells(positions, 'is-mechanic-target');
          }
        },
        onLog: (line) => console.log('[motion]', line),
        executePresentation: (item, payload) =>
          this.executeDirectorCue(item, payload, { event: item.channel }),
      });
    } catch (error) {
      console.error('Motion preview failed', error);
      window.alert(error.message || String(error));
    }
  }

  destroy() {
    this.motionPlayback?.stop?.();
    this.motionPlayback = null;
    super.destroy();
  }
}
