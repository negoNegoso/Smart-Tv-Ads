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
    { href: '#planos', label: 'Planos' },
    { href: '#duvidas', label: 'Dúvidas' },
  ],
  header: {
    navLabel: 'Seções',
    loginLabel: 'Entrar',
  },
  hero: {
    title: 'Anuncie nas telas do comércio da região — ou coloque a sua para trabalhar.',
    subtitle:
      'A Smart Vale TV leva anúncios para TVs instaladas dentro de estabelecimentos. Quem anuncia entra na rotina do cliente; quem tem um ponto anuncia o próprio negócio de graça na tela.',
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
        description:
          'Sua TV passa a anunciar o seu negócio de graça, e o concorrente fica de fora dela.',
        cta: 'Falar no WhatsApp',
        message: 'Olá! Tenho um ponto e quero colocar a Smart Vale TV na minha tela.',
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
            title: 'A tela entra no ar',
            body: 'Serve a TV que você já tem. Se o ponto não tiver uma, a gente resolve o equipamento.',
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
  /**
   * Plano único de propósito: a rede é pequena e vender "onde aparece" não
   * diferencia nada enquanto todo mundo aparece em todas as telas. O que varia
   * é só o prazo. Nada aqui promete frequência ou tempo de tela — o sistema não
   * tem conceito de cota no loop, então o banner não pode vender uma.
   */
  plans: {
    title: 'Planos',
    subtitle: 'Um plano para quem anuncia. Nada a pagar para quem tem o ponto.',
    advertiser: {
      eyebrow: 'Para quem quer aparecer',
      title: 'Anunciante',
      price: 'R$ 150',
      period: '/mês',
      note: 'Em todas as telas da rede.',
      features: [
        'Sua marca em todas as telas da rede',
        'Até 3 artes, com troca livre durante o mês',
        'QR code próprio em cada peça',
        'Relatório mensal de exibições e leituras, peça a peça',
        'Imagem ou vídeo — a gente publica para você',
      ],
      termsLabel: 'Fechando por mais tempo, sai mais barato:',
      terms: [
        { label: 'Mensal', value: 'R$ 150/mês' },
        { label: 'Trimestral', value: 'R$ 135/mês', hint: 'R$ 405 no período' },
        { label: 'Anual', value: 'R$ 120/mês', hint: 'economia de R$ 360' },
      ],
      cta: 'Quero anunciar',
      message: 'Olá! Quero anunciar na Smart Vale TV pelo plano de R$ 150/mês.',
    },
    host: {
      eyebrow: 'Para quem tem um espaço',
      title: 'Ponto parceiro',
      price: 'Grátis',
      period: '',
      note: 'Sem mensalidade e sem trabalho.',
      features: [
        'Anuncie o seu próprio negócio de graça na tela',
        'Concorrente do seu ramo bloqueado automaticamente',
        'A programação roda sozinha, o dia inteiro',
        'Serve a TV que você já tem; se não tiver, a gente resolve',
        'Você entra só com o espaço e a energia',
      ],
      termsLabel: '',
      terms: [],
      cta: 'Quero ser ponto',
      message: 'Olá! Tenho um ponto e quero ser parceiro da Smart Vale TV.',
    },
  },
  faq: {
    title: 'Dúvidas',
    items: [
      {
        q: 'Preciso comprar a TV?',
        a: 'Não. Se o seu ponto já tem uma TV, usamos ela. Se não tem, a gente resolve o equipamento. Você cede o espaço e a energia.',
      },
      {
        q: 'Quanto custa anunciar?',
        a: 'R$ 150 por mês, com a sua marca em todas as telas da rede. No trimestral sai R$ 135 por mês e no anual R$ 120 por mês.',
      },
      {
        q: 'Ser ponto custa alguma coisa?',
        a: 'Não. Não tem mensalidade. Você ainda anuncia o próprio negócio de graça na tela e o concorrente direto fica bloqueado.',
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
