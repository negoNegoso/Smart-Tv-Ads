/**
 * Todo o texto da landing mora aqui.
 *
 * Copy e ordem de seção mudam muito mais que o layout: editar a página não
 * pode exigir abrir um componente. Nada de texto de interface dentro de .tsx
 * em components/landing.
 */
export const BRAND = 'Smart Vale TV';

/** Número internacional completo, como o wa.me exige (55 + DDD + número). */
export const WHATSAPP_NUMBER = '5513997478695';

export function whatsappUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const LANDING = {
  nav: [
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#diferenciais', label: 'Por que a gente' },
    { href: '#duvidas', label: 'Dúvidas' },
  ],
  hero: {
    title: 'Anuncie nas telas do comércio da região — ou coloque a sua para trabalhar.',
    subtitle:
      'A Smart Vale TV leva anúncios para TVs instaladas dentro de estabelecimentos. Quem anuncia entra na rotina do cliente; quem tem um ponto ganha com a tela que já está na parede.',
    doors: [
      {
        id: 'anunciante',
        eyebrow: 'Para quem quer aparecer',
        title: 'Quero anunciar',
        description: 'Sua marca rodando nas telas onde o seu público já passa todo dia.',
        cta: 'Falar no WhatsApp',
        message: 'Olá! Quero anunciar na Smart Vale TV.',
      },
      {
        id: 'ponto',
        eyebrow: 'Para quem tem um espaço',
        title: 'Tenho um ponto',
        description: 'A TV do seu estabelecimento passa a gerar receita, sem trabalho para você.',
        cta: 'Falar no WhatsApp',
        message: 'Olá! Tenho um ponto e quero receber uma TV da Smart Vale TV.',
      },
    ],
  },
  mockup: {
    caption: 'Seu anúncio aqui',
    qrLabel: 'SAIBA +',
  },
  stats: {
    plays30d: 'exibições nos últimos 30 dias',
    activeScreens: 'telas ativas',
    clients: 'estabelecimentos parceiros',
    segments: 'ramos atendidos',
  },
  howItWorks: {
    title: 'Como funciona',
    tracks: [
      {
        id: 'anunciante',
        title: 'Se você quer anunciar',
        steps: [
          {
            title: 'Escolha onde aparecer',
            body: 'Todas as telas, só um ramo de estabelecimento, ou telas escolhidas a dedo.',
          },
          {
            title: 'Mande a arte',
            body: 'Imagem ou vídeo. A gente publica na programação das telas combinadas.',
          },
          {
            title: 'Acompanhe o resultado',
            body: 'Exibições contadas por peça e leituras do QR code do seu anúncio.',
          },
        ],
      },
      {
        id: 'ponto',
        title: 'Se você tem um ponto',
        steps: [
          {
            title: 'A TV entra na parede',
            body: 'Você cede o espaço e a energia. O equipamento e a programação são nossos.',
          },
          {
            title: 'Ela roda sozinha',
            body: 'A programação chega pela internet do local e passa o dia inteiro, sem ninguém operar.',
          },
          {
            title: 'Seu concorrente não entra',
            body: 'Anúncio do mesmo ramo do seu negócio é bloqueado automaticamente na sua tela.',
          },
        ],
      },
    ],
  },
  differentials: {
    title: 'Por que a Smart Vale TV',
    items: [
      {
        title: 'QR code que prova o resultado',
        body: 'Cada campanha tem o seu QR. As leituras são contadas de verdade, com acesso de robô descartado.',
      },
      {
        title: 'Concorrente não divide a tela',
        body: 'Anúncio de um ramo não toca na TV de um estabelecimento do mesmo ramo. A regra é do sistema, não da boa vontade.',
      },
      {
        title: 'Você escolhe o alvo',
        body: 'Campanha para toda a rede, para um ramo específico ou para as telas que você escolher.',
      },
      {
        title: 'Relatório por peça',
        body: 'Exibições e leituras anúncio a anúncio, não só um número total no fim do mês.',
      },
    ],
  },
  faq: {
    title: 'Dúvidas',
    items: [
      {
        q: 'Preciso comprar a TV?',
        a: 'Não. Para ser ponto, você cede o espaço e a energia; o equipamento e a programação são nossos.',
      },
      {
        q: 'Quanto custa anunciar?',
        a: 'Depende de quantas telas e por quanto tempo. Chame no WhatsApp que a gente monta a proposta.',
      },
      {
        q: 'Como sei que meu anúncio apareceu mesmo?',
        a: 'Cada exibição fica registrada. Você recebe o número de exibições por peça, não uma estimativa.',
      },
      {
        q: 'Para que serve o QR code no anúncio?',
        a: 'Ele leva o cliente direto ao seu link e conta quantas pessoas leram.',
      },
      {
        q: 'Meu concorrente pode aparecer na minha loja?',
        a: 'Não. Anúncio do mesmo ramo do estabelecimento é bloqueado automaticamente.',
      },
      {
        q: 'Preciso de internet no ponto?',
        a: 'Sim. A TV usa a internet do local para receber a programação.',
      },
    ],
  },
  finalCta: {
    title: 'Vamos conversar',
    subtitle: 'Diga de que lado você está e a gente responde no WhatsApp.',
  },
  footer: {
    tagline: 'Anúncios em TVs dentro do comércio da região.',
    loginLabel: 'Entrar no painel',
    whatsappMessage: 'Olá! Vim pelo site da Smart Vale TV.',
  },
} as const;
