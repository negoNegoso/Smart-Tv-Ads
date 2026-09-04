/**
 * Metadados e legendas das peças de divulgação.
 *
 * As imagens são geradas por `marketing/gerar.mjs`, que escreve os PNGs em
 * `public/divulgacao/`. Este arquivo não gera nada: só descreve o que existe
 * lá e diz onde cada peça deve ser postada. Ao adicionar uma peça no gerador,
 * adicione aqui também — `arquivo` é o nome sem extensão.
 *
 * O texto das legendas repete preço e telefone que vivem em
 * `landing-content.ts` e em `marketing/gerar.mjs`. Ao mudar o preço, os três
 * mudam juntos.
 */

export type PecaDivulgacao = {
  id: string;
  /** Nome do arquivo sem extensão, dentro de public/divulgacao/. */
  arquivo: string;
  publico: string;
  titulo: string;
  formato: string;
  dimensoes: string;
  ondePostar: string;
  /** Qual arquivo usar em cada destino. */
  recomendacao: string;
  legenda: string;
};

export const DIVULGACAO = {
  title: 'Divulgação',
  subtitle:
    'Peças prontas para postar. Baixe a imagem, copie a legenda e publique — o texto já está escrito.',
  avisos: [
    {
      titulo: 'Comece pelas peças de ponto',
      body:
        'A peça de anunciante promete uma rede de telas. Enquanto a rede está em formação, publique só as peças de ponto para juntar as primeiras telas.',
    },
    {
      titulo: 'No WhatsApp, envie como documento',
      body:
        'Enviada como foto, a imagem é recomprimida e perde nitidez. Use o clipe → Documento para a peça chegar intacta.',
    },
    {
      titulo: 'Alta para o Facebook, padrão para o WhatsApp',
      body:
        'O Facebook recomprime melhor a partir do arquivo maior. O WhatsApp trabalha melhor com o tamanho padrão.',
    },
  ],
  downloadAlta: 'Baixar alta (2x)',
  downloadPadrao: 'Baixar padrão',
  legendaLabel: 'Legenda pronta',
  copiar: 'Copiar legenda',
  copiado: 'Legenda copiada',
  pecas: [
    {
      id: 'ponto-feed',
      arquivo: 'ponto-feed',
      publico: 'Dono de ponto',
      titulo: 'Sua TV pode anunciar o seu negócio de graça',
      formato: 'Quadrado',
      dimensoes: '1080 × 1080',
      ondePostar: 'Post no Facebook e envio em grupos de WhatsApp',
      recomendacao: 'Facebook: alta (2x). Grupo de WhatsApp: padrão, como documento.',
      legenda:
        'Tem uma TV parada no seu estabelecimento?\n\n' +
        'A Smart Vale TV coloca ela para trabalhar. Você anuncia o seu próprio negócio na tela de graça, a programação roda sozinha o dia inteiro e o concorrente do seu ramo fica bloqueado automaticamente.\n\n' +
        'Sem mensalidade. Sem trabalho. Serve a TV que você já tem.\n\n' +
        'Chame no WhatsApp: (13) 99747-8695',
    },
    {
      id: 'ponto-story',
      arquivo: 'ponto-story',
      publico: 'Dono de ponto',
      titulo: 'Sua TV pode anunciar o seu negócio de graça',
      formato: 'Vertical',
      dimensoes: '1080 × 1920',
      ondePostar: 'Status do WhatsApp e Stories do Facebook e Instagram',
      recomendacao: 'Status do WhatsApp: padrão. Stories: alta (2x).',
      legenda:
        'TV parada no seu comércio? Ela pode anunciar o seu negócio de graça.\n\n' +
        'Smart Vale TV — sem mensalidade. (13) 99747-8695',
    },
    {
      id: 'anunciante-feed',
      arquivo: 'anunciante-feed',
      publico: 'Anunciante',
      titulo: 'Sua marca nas TVs do comércio da região',
      formato: 'Quadrado',
      dimensoes: '1080 × 1080',
      ondePostar: 'Post no Facebook e envio em grupos de WhatsApp',
      recomendacao: 'Facebook: alta (2x). Grupo de WhatsApp: padrão, como documento.',
      legenda:
        'Sua marca rodando nas TVs do comércio da região, por R$ 150 por mês.\n\n' +
        'Você aparece em todas as telas da rede, com até 3 artes e troca livre durante o mês. Cada peça leva um QR code próprio, e no fim do mês você recebe o relatório de exibições e leituras — anúncio a anúncio, não uma estimativa.\n\n' +
        'Fechando por mais tempo sai mais barato: R$ 135/mês no trimestral, R$ 120/mês no anual.\n\n' +
        'Chame no WhatsApp: (13) 99747-8695',
    },
    {
      id: 'anunciante-story',
      arquivo: 'anunciante-story',
      publico: 'Anunciante',
      titulo: 'Sua marca nas TVs do comércio da região',
      formato: 'Vertical',
      dimensoes: '1080 × 1920',
      ondePostar: 'Status do WhatsApp e Stories do Facebook e Instagram',
      recomendacao: 'Status do WhatsApp: padrão. Stories: alta (2x).',
      legenda:
        'Sua marca nas TVs do comércio da região por R$ 150/mês.\n\n' +
        'Com relatório de exibições e QR code próprio. (13) 99747-8695',
    },
  ] satisfies readonly PecaDivulgacao[],
} as const;
