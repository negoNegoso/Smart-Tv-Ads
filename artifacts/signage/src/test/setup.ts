import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom não implementa ResizeObserver, e o TrendChart (Task 7) usa o
// ResponsiveContainer do recharts, que exige essa API para medir o
// contêiner. Sem o stub, qualquer teste que renderize uma página com
// gráfico de verdade (não em loading) derruba a suíte com uma exceção não
// tratada, mesmo com as asserções corretas.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom não implementa matchMedia, e o useIsMobile (usado pelo menu lateral)
// assina mudanças por ele. O valor vem de window.innerWidth no próprio hook;
// o stub só precisa aceitar a assinatura. Teste que quer celular ajusta
// window.innerWidth antes de renderizar.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom não inicializa localStorage corretamente sem essa configuração
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage.setItem) {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: store.size,
  } as Storage;
}

afterEach(() => {
  cleanup();
});
