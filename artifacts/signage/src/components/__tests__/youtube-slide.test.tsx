import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubeSlide } from '../youtube-slide';

/**
 * YT falso com o comportamento documentado da IFrame API: `new YT.Player(el)`
 * troca o elemento `el` por um iframe no pai dele, e `destroy()` tira o
 * iframe. É isso que quebrava vídeo seguido de vídeo: o segundo player era
 * criado no elemento que o primeiro já tinha tirado da página.
 */
class FakePlayer {
  iframe: HTMLIFrameElement;
  constructor(el: HTMLElement, opts: { videoId: string; events: { onReady?: (e: unknown) => void } }) {
    this.iframe = document.createElement('iframe');
    this.iframe.dataset.videoId = opts.videoId;
    el.parentNode?.replaceChild(this.iframe, el);
    const target = { playVideo() {}, getCurrentTime: () => 0, unMute() {}, setVolume() {}, seekTo() {} };
    queueMicrotask(() => opts.events.onReady?.({ target }));
  }
  destroy() {
    this.iframe.remove();
  }
}

beforeEach(() => {
  (window as unknown as { YT: unknown }).YT = { Player: FakePlayer, PlayerState: { ENDED: 0 } };
});
afterEach(() => {
  delete (window as unknown as { YT?: unknown }).YT;
});

function props(slideKey: string, videoId: string) {
  return {
    slideKey,
    videoId,
    audioMode: 'muted' as const,
    playbackMode: 'natural' as const,
    onEnded: vi.fn(),
    onUnplayable: vi.fn(),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('YouTubeSlide', () => {
  it('vídeo seguido de outro vídeo: o player novo aparece na página', async () => {
    const { rerender, container } = render(<YouTubeSlide {...props('42-a', 'aaa')} />);
    await flush();
    expect(container.querySelector('iframe[data-video-id="aaa"]')).not.toBeNull();

    rerender(<YouTubeSlide {...props('44-b', 'bbb')} />);
    await flush();
    expect(container.querySelector('iframe[data-video-id="aaa"]')).toBeNull();
    expect(container.querySelector('iframe[data-video-id="bbb"]')).not.toBeNull();
  });

  it('mesmo vídeo em ciclo novo (TV com um vídeo só) também recria na página', async () => {
    const { rerender, container } = render(<YouTubeSlide {...props('42-a-0', 'aaa')} />);
    await flush();
    rerender(<YouTubeSlide {...props('42-a-1', 'aaa')} />);
    await flush();
    expect(container.querySelectorAll('iframe[data-video-id="aaa"]')).toHaveLength(1);
  });
});
