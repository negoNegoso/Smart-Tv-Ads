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

// Node 25 ships com global localStorage que sombra jsdom: jsdom não inicializa
// localStorage.setItem/removeItem/clear corretamente em Node 22+. O ambiente de
// testes precisa de Storage funcional (session-hint e prerender-html usam).
// Stub com Map-backed storage, exposto via Object.defineProperty para evitar
// shadowing pelo global Node 25.
if (typeof globalThis !== 'undefined') {
  const store = new Map<string, string>();
  const storageImpl: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageImpl,
    configurable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storageImpl,
      configurable: true,
    });
  }
}

afterEach(() => {
  cleanup();
});
