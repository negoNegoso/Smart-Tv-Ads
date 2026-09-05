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

afterEach(() => {
  cleanup();
});
