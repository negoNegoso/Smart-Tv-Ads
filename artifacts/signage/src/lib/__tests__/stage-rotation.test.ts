import { describe, expect, it } from 'vitest';
import { stageStyle } from '../stage-rotation';

describe('stageStyle', () => {
  it('TV deitada ocupa a tela, sem giro', () => {
    expect(stageStyle('landscape')).toEqual({ position: 'absolute', inset: 0 });
    expect(stageStyle(undefined)).toEqual({ position: 'absolute', inset: 0 });
  });

  it('portrait_right troca largura e altura e gira 90°', () => {
    expect(stageStyle('portrait_right')).toEqual({
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '100vh',
      height: '100vw',
      transform: 'translate(-50%, -50%) rotate(90deg)',
    });
  });

  it('portrait_left gira -90°', () => {
    expect(stageStyle('portrait_left').transform).toBe('translate(-50%, -50%) rotate(-90deg)');
  });
});
