/**
 * SEO landing pages (/praticar/[slug]): one page per search people make on Google.
 * Written in Brazilian Portuguese for Brazilian searches. Keep every claim true:
 * no promises of fluency in X days, no "native speakers" guarantee.
 */
export type SeoPage = {
  slug: string;
  /** Host language this page matches (English name, as stored on profiles). */
  language: string;
  /** Short name used in links and lists. */
  name: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string[];
  whyTitle: string;
  why: { title: string; body: string }[];
  situationsTitle: string;
  situations: string[];
  tipsTitle: string;
  tips: string[];
  faq: { q: string; a: string }[];
  related: string[];
};

const commonFaq = {
  price: (lang: string) => ({
    q: `Quanto custa praticar ${lang} no HUMI?`,
    a: "Cada pessoa define o próprio preço por minuto, a partir de R$ 0,30. A cobrança é por segundo e só enquanto vocês dois estão conectados. Não tem mensalidade nem pacote: você coloca saldo com Pix ou cartão e usa quando quiser.",
  }),
  lesson: {
    q: "É uma aula com professor?",
    a: "Não. No HUMI é conversa livre com pessoas reais, sem material, sem prova e sem lição de casa. Muita gente usa como complemento do curso ou do aplicativo, para finalmente colocar em prática o que já estudou.",
  },
  level: {
    q: "Preciso ter um nível mínimo?",
    a: "Não. Você pode avisar no começo da conversa que está aprendendo e pedir para a pessoa falar mais devagar ou corrigir seus erros. Muitos hosts gostam justamente de ajudar quem está começando.",
  },
  safety: {
    q: "É seguro?",
    a: "O HUMI é só para maiores de 18 anos, as chamadas não são gravadas e você pode denunciar ou bloquear alguém com um toque, durante ou depois da chamada. As avaliações vêm de quem realmente conversou com o host.",
  },
};

export const SEO_PAGES: SeoPage[] = [
  {
    slug: "ingles",
    language: "English",
    name: "Inglês",
    title: "Praticar inglês conversando com pessoas reais",
    description: "Pratique inglês conversando por vídeo ou áudio com pessoas reais, sem aula e sem pacote. Pague só pelos minutos que usar, a partir de R$ 0,30 por minuto.",
    eyebrow: "Praticar inglês",
    h1: "Pratique inglês conversando com pessoas reais",
    intro: [
      "Você estuda inglês há anos, entende séries e músicas, mas trava na hora de falar? Isso é muito comum: falar é uma habilidade que só se desenvolve falando, e quase ninguém tem com quem praticar no dia a dia.",
      "No HUMI você escolhe alguém que fala inglês, liga por vídeo ou áudio e conversa sobre o que quiser, pelo tempo que quiser. Sem aula, sem roteiro e sem pagar um pacote inteiro: 10 minutos já fazem diferença.",
    ],
    whyTitle: "Por que conversar é o que destrava o inglês",
    why: [
      { title: "Você treina o que trava", body: "Ouvir, pensar e responder na hora, sem tempo de traduzir. É exatamente isso que um curso ou um app não treina." },
      { title: "Sem vergonha de errar", body: "É uma conversa leve, não uma prova. Você pode pedir para a pessoa repetir, falar devagar ou corrigir quando quiser." },
      { title: "No seu bolso e no seu tempo", body: "Paga por minuto, sem mensalidade. Dá para encaixar uma conversa curta no almoço ou antes de dormir." },
    ],
    situationsTitle: "Para quem é",
    situations: [
      "Quem estuda inglês, mas nunca conversa com ninguém",
      "Quem vai viajar e quer chegar falando com mais confiança",
      "Quem usa inglês no trabalho e quer perder o medo de reuniões",
      "Quem já fez curso e não quer perder o que aprendeu",
    ],
    tipsTitle: "Dicas para a sua primeira conversa em inglês",
    tips: [
      "Comece dizendo seu nível: “I'm learning English, can you speak a bit slower?”",
      "Escolha um assunto que você gosta (séries, games, viagem) — fica muito mais fácil falar.",
      "Peça correções no fim, não no meio de cada frase, para a conversa fluir.",
      "Comece com 5 a 10 minutos e vá aumentando. A frequência vale mais que a duração.",
    ],
    faq: [
      commonFaq.price("inglês"),
      { q: "Com quem eu vou conversar?", a: "Com pessoas reais que falam inglês, de vários países. Cada perfil mostra os idiomas, interesses, preço e avaliações, e você escolhe com quem quer falar." },
      commonFaq.lesson,
      commonFaq.level,
      commonFaq.safety,
    ],
    related: ["conversacao-em-ingles", "ingles-para-entrevista", "espanhol"],
  },
  {
    slug: "conversacao-em-ingles",
    language: "English",
    name: "Conversação em inglês",
    title: "Conversação em inglês online, por minuto",
    description: "Conversação em inglês online por vídeo ou áudio com pessoas reais. Sem pacote e sem mensalidade: pague por minuto, com Pix ou cartão.",
    eyebrow: "Conversação em inglês",
    h1: "Conversação em inglês online, sem pacote e sem mensalidade",
    intro: [
      "Aula de conversação costuma vir em pacote fechado, com horário marcado e preço alto. No HUMI é diferente: você conversa com uma pessoa real na hora que quiser e paga só os minutos que usar.",
      "É ideal para manter o inglês em dia, treinar o listening com sotaques diferentes ou simplesmente ganhar confiança para falar.",
    ],
    whyTitle: "Como funciona a conversação no HUMI",
    why: [
      { title: "Você escolhe com quem falar", body: "Veja quem está online, os interesses de cada um e as avaliações de quem já conversou." },
      { title: "Vídeo ou áudio", body: "Prefere sem câmera? Muitas pessoas oferecem chamadas só de áudio, mais leves e sem pressão." },
      { title: "Cobrança por segundo", body: "O relógio só corre enquanto vocês dois estão conectados. Se a chamada não conectar, não paga nada." },
    ],
    situationsTitle: "Ideias de assunto para treinar",
    situations: [
      "Contar como foi seu dia ou sua semana",
      "Comentar uma série, filme ou jogo que você está acompanhando",
      "Planejar uma viagem imaginária para o país da outra pessoa",
      "Treinar situações do trabalho, como se apresentar numa reunião",
    ],
    tipsTitle: "Como aproveitar melhor cada conversa",
    tips: [
      "Anote 3 palavras ou expressões novas por conversa e use na próxima.",
      "Converse com pessoas de países diferentes para acostumar o ouvido com vários sotaques.",
      "Se travar, descreva com outras palavras em vez de voltar para o português.",
      "Volte a falar com quem você gostou: a conversa fica mais natural a cada vez.",
    ],
    faq: [
      commonFaq.price("conversação em inglês"),
      { q: "Preciso marcar horário?", a: "Não precisa. Se a pessoa estiver online, é só ligar. Se preferir, também dá para agendar um horário com antecedência." },
      commonFaq.level,
      { q: "Posso conversar só por áudio?", a: "Pode. No perfil de cada pessoa aparece se ela oferece áudio, vídeo ou os dois, e o preço de cada um." },
      commonFaq.safety,
    ],
    related: ["ingles", "ingles-para-entrevista", "frances"],
  },
  {
    slug: "ingles-para-entrevista",
    language: "English",
    name: "Inglês para entrevista",
    title: "Treinar inglês para entrevista de emprego",
    description: "Treine para entrevista de emprego em inglês conversando com pessoas reais: simule perguntas, pratique sua apresentação e perca o nervosismo. Pague por minuto.",
    eyebrow: "Inglês para entrevista",
    h1: "Treine sua entrevista de emprego em inglês antes do dia",
    intro: [
      "Entrevista em inglês deixa qualquer um nervoso — mesmo quem tem bom nível. O que mais ajuda é ensaiar em voz alta, com outra pessoa, as perguntas que quase sempre aparecem.",
      "No HUMI você chama alguém que fala inglês, explica a vaga e pede para simular a entrevista. Repita quantas vezes precisar, pagando só pelos minutos de conversa.",
    ],
    whyTitle: "Por que ensaiar com uma pessoa real",
    why: [
      { title: "Perguntas que você não espera", body: "Ensaiar sozinho é diferente de responder alguém na hora. A conversa real mostra onde você trava." },
      { title: "Feedback na hora", body: "Peça para a pessoa dizer o que ficou confuso e como soaria mais natural." },
      { title: "Confiança no dia", body: "Quem já falou sobre si mesmo em inglês algumas vezes chega bem mais tranquilo na entrevista." },
    ],
    situationsTitle: "O que vale treinar",
    situations: [
      "“Tell me about yourself” — sua apresentação em 1 a 2 minutos",
      "Suas experiências e resultados em projetos anteriores",
      "Pontos fortes, pontos a melhorar e por que você quer a vaga",
      "Perguntas que você vai fazer para a empresa no final",
    ],
    tipsTitle: "Dicas para a simulação",
    tips: [
      "Mande a descrição da vaga no chat da chamada antes de começar.",
      "Peça para a pessoa agir como recrutadora e fazer perguntas de surpresa.",
      "Grave suas respostas principais por escrito depois e ajuste o que travou.",
      "Faça duas ou três simulações em dias diferentes antes da entrevista.",
    ],
    faq: [
      commonFaq.price("inglês para entrevista"),
      { q: "A pessoa é recrutadora ou professora?", a: "Não necessariamente. São pessoas que falam inglês e topam conversar. Alguns perfis mencionam experiência com trabalho, recrutamento ou ensino — vale ler o perfil e as avaliações antes de escolher." },
      { q: "Quanto tempo de conversa preciso?", a: "Uma simulação completa costuma levar de 15 a 30 minutos. Como a cobrança é por minuto, você decide o tamanho." },
      commonFaq.safety,
    ],
    related: ["ingles", "conversacao-em-ingles", "espanhol"],
  },
  {
    slug: "espanhol",
    language: "Spanish",
    name: "Espanhol",
    title: "Praticar espanhol conversando com pessoas reais",
    description: "Pratique espanhol conversando por vídeo ou áudio com pessoas reais. Perca o portunhol e ganhe confiança, pagando só os minutos que usar.",
    eyebrow: "Praticar espanhol",
    h1: "Pratique espanhol e deixe o portunhol para trás",
    intro: [
      "Para quem fala português, o espanhol parece fácil — até a hora de conversar de verdade. Os falsos amigos, a velocidade e os sotaques diferentes fazem muita gente travar ou cair no portunhol.",
      "No HUMI você conversa com quem fala espanhol, por vídeo ou áudio, sobre o que quiser. É o jeito mais direto de acostumar o ouvido e ganhar fluidez.",
    ],
    whyTitle: "Por que praticar conversando",
    why: [
      { title: "Ouvido para sotaques diferentes", body: "O espanhol muda bastante de um país para outro. Conversar com pessoas diferentes acostuma o ouvido." },
      { title: "Menos portunhol", body: "Na conversa você percebe na hora as palavras que parecem iguais mas não são." },
      { title: "Prático e barato", body: "Sem pacote: uma conversa curta de vez em quando já mantém o espanhol vivo." },
    ],
    situationsTitle: "Para quem é",
    situations: [
      "Quem vai viajar para a Argentina, o Chile, o México ou a Espanha",
      "Quem trabalha com clientes ou colegas de países hispânicos",
      "Quem estudou espanhol na escola e quer recuperar",
      "Quem quer um segundo idioma para o currículo",
    ],
    tipsTitle: "Dicas para conversar em espanhol",
    tips: [
      "Peça para a pessoa avisar quando você usar uma palavra em português sem perceber.",
      "Pergunte expressões típicas do país dela — é a parte mais divertida.",
      "Cuidado com falsos amigos clássicos como “exquisito”, “embarazada” e “polvo”.",
      "Converse sobre a cultura e a comida do país: o vocabulário vem junto.",
    ],
    faq: [
      commonFaq.price("espanhol"),
      { q: "Vou conversar com pessoas de qual país?", a: "Depende de quem estiver disponível. Cada perfil mostra o país e os idiomas da pessoa, então você pode escolher, por exemplo, alguém da Argentina ou do México." },
      commonFaq.lesson,
      commonFaq.level,
      commonFaq.safety,
    ],
    related: ["ingles", "italiano", "frances"],
  },
  {
    slug: "frances",
    language: "French",
    name: "Francês",
    title: "Praticar francês online conversando",
    description: "Pratique francês online conversando por vídeo ou áudio com pessoas reais, sem aula e sem mensalidade. Pague por minuto, com Pix ou cartão.",
    eyebrow: "Praticar francês",
    h1: "Pratique francês conversando, no seu ritmo",
    intro: [
      "Francês é um idioma em que a pronúncia e o ouvido fazem toda a diferença — e isso só melhora conversando. Mas encontrar alguém para praticar costuma ser difícil e caro.",
      "No HUMI você liga para quem fala francês e conversa por alguns minutos, quando quiser. Perfeito para quem está estudando, vai viajar ou planeja morar fora.",
    ],
    whyTitle: "Por que conversar faz diferença no francês",
    why: [
      { title: "Pronúncia de verdade", body: "Sons nasais e letras que não se pronunciam ficam muito mais claros ouvindo e repetindo numa conversa." },
      { title: "Francês do dia a dia", body: "Na conversa aparecem as expressões que os livros não ensinam." },
      { title: "Sem compromisso", body: "Sem pacote e sem horário fixo. Converse quando tiver tempo." },
    ],
    situationsTitle: "Para quem é",
    situations: [
      "Quem estuda francês e quer praticar a fala",
      "Quem vai viajar para a França, a Bélgica, a Suíça ou o Canadá",
      "Quem está se preparando para morar ou estudar fora",
      "Quem ama a cultura francófona e quer conversar sobre ela",
    ],
    tipsTitle: "Dicas para a primeira conversa em francês",
    tips: [
      "Comece com frases simples de apresentação e peça para a pessoa falar devagar.",
      "Peça para repetir palavras difíceis e imite a pronúncia.",
      "Escolha temas que você domina em português, como seu trabalho ou seus hobbies.",
      "Conversas curtas e frequentes rendem mais do que uma longa por mês.",
    ],
    faq: [
      commonFaq.price("francês"),
      commonFaq.lesson,
      commonFaq.level,
      commonFaq.safety,
    ],
    related: ["italiano", "espanhol", "ingles"],
  },
  {
    slug: "italiano",
    language: "Italian",
    name: "Italiano",
    title: "Praticar italiano online conversando",
    description: "Pratique italiano conversando por vídeo ou áudio com pessoas reais. Ideal para quem tem família italiana, vai viajar ou está estudando. Pague por minuto.",
    eyebrow: "Praticar italiano",
    h1: "Pratique italiano conversando com pessoas reais",
    intro: [
      "Muitos brasileiros têm família italiana e sonham em falar o idioma dos avós, fazer a cidadania ou viajar pela Itália. O italiano é próximo do português, mas a conversa exige prática.",
      "No HUMI você conversa com quem fala italiano, por vídeo ou áudio, sobre o que quiser. Sem aula e sem pacote — só conversa de verdade.",
    ],
    whyTitle: "Por que praticar conversando",
    why: [
      { title: "Parecido, mas diferente", body: "A semelhança com o português ajuda, mas também confunde. A conversa mostra onde estão as diferenças." },
      { title: "Cultura e idioma juntos", body: "Comida, cidades, futebol, música: conversar sobre a Itália é o melhor jeito de aprender." },
      { title: "Pague só o que usar", body: "Uma conversa curta por semana já mantém o italiano em dia." },
    ],
    situationsTitle: "Para quem é",
    situations: [
      "Quem tem raízes italianas e quer se reconectar com o idioma",
      "Quem está no processo de cidadania italiana",
      "Quem vai viajar ou morar na Itália",
      "Quem estuda italiano e quer praticar a fala",
    ],
    tipsTitle: "Dicas para conversar em italiano",
    tips: [
      "Pergunte sobre a região da pessoa: cada uma tem expressões e sotaque próprios.",
      "Use os gestos sem medo — fazem parte da conversa italiana.",
      "Peça para a pessoa corrigir palavras que você “aportuguesar”.",
      "Fale de comida: é o assunto favorito e rende muito vocabulário.",
    ],
    faq: [
      commonFaq.price("italiano"),
      commonFaq.lesson,
      commonFaq.level,
      commonFaq.safety,
    ],
    related: ["espanhol", "frances", "ingles"],
  },
  {
    slug: "alemao",
    language: "German",
    name: "Alemão",
    title: "Praticar alemão conversando com pessoas reais",
    description: "Pratique alemão conversando por vídeo ou áudio com pessoas reais. Sem aula e sem mensalidade: pague só pelos minutos de conversa.",
    eyebrow: "Praticar alemão",
    h1: "Pratique alemão conversando, sem pressão",
    intro: [
      "Alemão tem fama de difícil, e grande parte da dificuldade está em falar: montar as frases na hora, a pronúncia e a coragem de tentar. A melhor forma de destravar é conversando.",
      "No HUMI você chama alguém que fala alemão e conversa no seu ritmo, por vídeo ou áudio. Ótimo para quem estuda, trabalha com empresas alemãs ou pensa em morar fora.",
    ],
    whyTitle: "Por que conversar ajuda no alemão",
    why: [
      { title: "Frases saindo mais rápido", body: "Montar frases na hora é um treino — quanto mais você conversa, mais natural fica." },
      { title: "Ouvido acostumado", body: "Ouvir pessoas reais ajuda a entender o alemão falado, que é bem diferente do livro." },
      { title: "No seu tempo", body: "Converse alguns minutos quando puder, sem pacote nem mensalidade." },
    ],
    situationsTitle: "Para quem é",
    situations: [
      "Quem estuda alemão e quer praticar a conversação",
      "Quem trabalha ou quer trabalhar com empresas alemãs",
      "Quem planeja estudar ou morar na Alemanha, na Áustria ou na Suíça",
      "Quem quer manter o alemão vivo depois do curso",
    ],
    tipsTitle: "Dicas para conversar em alemão",
    tips: [
      "Avise que está aprendendo e peça frases mais curtas e simples.",
      "Não tenha medo de errar o artigo: a conversa continua e você aprende.",
      "Prepare algumas frases sobre você antes da primeira chamada.",
      "Peça para a pessoa ensinar expressões do dia a dia que não estão nos livros.",
    ],
    faq: [
      commonFaq.price("alemão"),
      commonFaq.lesson,
      commonFaq.level,
      commonFaq.safety,
    ],
    related: ["ingles", "frances", "italiano"],
  },
];

export const seoPageBySlug = (slug: string) => SEO_PAGES.find((p) => p.slug === slug);
