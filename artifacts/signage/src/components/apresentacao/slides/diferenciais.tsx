import { LANDING } from '@/lib/landing-content';
import { SlideShell } from '../slide-shell';

export function SlideDiferenciais() {
  const { title, items } = LANDING.differentials;
  return (
    <SlideShell titulo={title}>
      <ul className="grid gap-6 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.title} className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-xl font-semibold text-foreground sm:text-2xl">{item.title}</h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">{item.body}</p>
          </li>
        ))}
      </ul>
    </SlideShell>
  );
}
