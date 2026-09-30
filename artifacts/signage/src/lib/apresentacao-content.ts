/**
 * Texto da apresentação comercial (/apresentacao).
 *
 * Só o que é novo mora aqui. Planos, como funciona e diferenciais vêm de
 * LANDING: preço mudado num lugar só aparece igual no site e na reunião.
 */
export const APRESENTACAO = {
  navegacao: {
    indice: 'Índice',
    fecharIndice: 'Fechar índice',
    slide: 'Slide',
    progresso: 'Progresso da apresentação',
  },
  blocos: {
    comum: 'Visão geral',
    anunciante: 'Para quem anuncia',
    ponto: 'Para quem tem um ponto',
    fechamento: 'Próximo passo',
  },
  capa: {
    tagline: 'Anúncios nas telas do comércio do Vale do Ribeira',
  },
  problema: {
    eyebrow: 'O problema',
    titulo: 'Anunciar perto do cliente ainda é difícil',
    itens: [
      {
        titulo: 'Panfleto vai pro lixo',
        corpo: 'Custa impressão e entrega, e quase ninguém lê até o fim.',
      },
      {
        titulo: 'Rede social é disputada',
        corpo: 'O seu post briga com todo mundo, e quem vê pode nem estar na sua cidade.',
      },
      {
        titulo: 'Mídia tradicional custa caro',
        corpo: 'Rádio e outdoor cobram preço de cidade grande para falar com a região inteira.',
      },
    ],
  },
  solucao: {
    eyebrow: 'A solução',
    titulo: 'A sua marca dentro do comércio da região',
    corpo:
      'TVs instaladas nos estabelecimentos passam os anúncios o dia inteiro, onde o cliente já está. Esta é a programação no ar agora.',
  },
  rede: {
    eyebrow: 'A rede hoje',
    cidadesComParceiros: 'cidades com pontos parceiros',
  },
  resultado: {
    eyebrow: 'Para quem anuncia',
    titulo: 'Você acompanha cada peça',
    corpo: 'Exibições registradas pela própria TV e leituras do QR code, anúncio a anúncio.',
    selo: 'Dados de exemplo',
    periodo: 'Últimos 30 dias',
    colunas: { peca: 'Peça', exibicoes: 'Exibições', leituras: 'Leituras do QR' },
    pecas: [
      { nome: 'Promoção de pizza', exibicoes: 4320, leituras: 87 },
      { nome: 'Cardápio da semana', exibicoes: 3910, leituras: 52 },
      { nome: 'Delivery grátis', exibicoes: 2750, leituras: 64 },
    ],
  },
  planoAnunciante: { eyebrow: 'Para quem anuncia' },
  planoPonto: { eyebrow: 'Para quem tem um ponto' },
  fechamento: {
    titulo: 'Vamos conversar',
    corpo: 'Aponte a câmera do celular e fale com a gente no WhatsApp.',
    message: 'Olá! Vi a apresentação da Smart Vale TV.',
    qrLabel: 'QR code para falar com a Smart Vale TV no WhatsApp',
    linkLabel: 'Abrir o WhatsApp',
  },
} as const;

export type Bloco = keyof typeof APRESENTACAO.blocos;
