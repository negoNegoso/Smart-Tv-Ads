import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { LANDING } from '@/lib/landing-content';

export function Faq() {
  return (
    <section id="duvidas" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto max-w-3xl px-5 py-14 md:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {LANDING.faq.title}
        </h2>

        <Accordion type="single" collapsible className="mt-8">
          {LANDING.faq.items.map((item, index) => (
            <AccordionItem key={item.q} value={`item-${index}`}>
              <AccordionTrigger className="text-left text-base font-medium text-foreground">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
