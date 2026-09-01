import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LANDING } from '@/lib/landing-content';

export function Faq() {
  return (
    <section id="duvidas" className="scroll-mt-20 border-b border-zinc-200">
      <div className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {LANDING.faq.title}
        </h2>

        <Accordion type="single" collapsible className="mt-8">
          {LANDING.faq.items.map((item, index) => (
            <AccordionItem key={item.q} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base font-medium text-zinc-900">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-zinc-600">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
