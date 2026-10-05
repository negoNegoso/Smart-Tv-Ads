import { BRAND, LANDING, WHATSAPP_NUMBER } from '@/lib/landing-content';
import { VALE_MUNICIPIOS } from '@/lib/mapa-vale';

type JsonLd = Record<string, unknown>;

/**
 * Dados estruturados (schema.org) da home, montados do mesmo texto que a
 * landing mostra, para nunca contarem uma história diferente da página.
 *
 * Organization e não LocalBusiness: LocalBusiness exige endereço físico, e a
 * rede não tem um público. A área de atuação vai em areaServed, cidade a
 * cidade, que é o que importa para a busca local.
 *
 * FAQPage: desde 2023 o Google só mostra FAQ como resultado rico para sites de
 * governo e saúde. Fica pelo Bing e pelos buscadores de IA, e porque as
 * respostas do accordion não saem no HTML pré-renderizado (accordion fechado
 * não renderiza o conteúdo).
 *
 * `sitePrefix` vazio (build sem domínio): sem url e sem logo, porque schema.org
 * espera URL absoluta e uma relativa seria pior que nenhuma.
 */
export function buildStructuredData(sitePrefix: string): JsonLd[] {
  const organization: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: `+${WHATSAPP_NUMBER}`,
      contactType: 'sales',
      areaServed: 'BR',
      availableLanguage: 'pt-BR',
    },
    areaServed: VALE_MUNICIPIOS.map((municipio) => ({
      '@type': 'City',
      name: municipio.nome,
      containedInPlace: { '@type': 'State', name: 'São Paulo' },
    })),
  };
  if (sitePrefix) {
    organization.url = `${sitePrefix}/`;
    organization.logo = `${sitePrefix}/apple-touch-icon.png`;
  }

  const faqPage: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: LANDING.faq.items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };

  return [organization, faqPage];
}

/**
 * Uma tag <script> por item. Um "</" dentro do JSON fecharia a tag no meio
 * (o parser de HTML não sabe que está dentro de uma string JSON); "<\/" é o
 * mesmo texto para o JSON e inofensivo para o HTML.
 */
export function serializeJsonLd(items: JsonLd[]): string {
  return items
    .map(
      (item) =>
        `<script type="application/ld+json">${JSON.stringify(item).replaceAll('</', '<\\/')}</script>`,
    )
    .join('\n');
}
