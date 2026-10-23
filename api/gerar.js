// Função serverless da Vercel: recebe o pedido do site, chama o OpenRouter com a chave
// guardada em variável de ambiente e devolve só o texto gerado.
// A chave NUNCA vai para o navegador.

const TONES = ['Natural e amigável', 'Mais direto e curto', 'Mais formal', 'Mais descontraído'];

const SYSTEM =
  'Você é redator de mensagens de WhatsApp em português do Brasil para um corretor de imóveis. ' +
  'Escreve de forma natural, humana e sem exageros.';

function buildVariationsPrompt(n, tone, examples, source, ask) {
  const format =
    '- Use exatamente os marcadores {primeiro_nome} e {saudacao}, com chaves, na abertura.\n' +
    '- Use variações no formato {opção 1|opção 2|opção 3} em várias palavras ou trechos, como nos exemplos. As opções de cada chave devem encaixar na mesma frase.\n' +
    '- Cada versão com 2 a 4 linhas curtas. No máximo 1 emoji. Sem promessas falsas e sem pressão.\n' +
    '- Estruturas de frase diferentes em cada versão.\n' +
    '- Responda SOMENTE com as versões, separadas por uma linha contendo apenas ---. Sem numeração, sem título, sem explicações.\n\n';

  if (source) {
    return (
      'Abaixo está o TEXTO-BASE escrito por um corretor. Reescreva-o criando ' + n + ' versões diferentes entre si, ' +
      'mais naturais, claras e simpáticas, para WhatsApp. Tom: ' + tone + '.\n' +
      (ask ? 'Pedido extra do corretor: ' + ask + '\n' : '') +
      '\nRegras:\n' +
      '- Mantenha o sentido e TODOS os fatos e valores do texto-base. Não invente informações, valores, prazos, endereços nem promessas.\n' +
      '- Se o texto-base não tiver saudação com o nome, abra com {saudacao} e {primeiro_nome}.\n' +
      format +
      'Exemplos só do formato dos marcadores e das variações (não copie o conteúdo deles):\n\n' + examples.join('\n---\n') +
      '\n\nTEXTO-BASE:\n"""\n' + source + '\n"""'
    );
  }
  return (
    'Crie ' + n + ' versões NOVAS e bem diferentes entre si da mensagem de abordagem de WhatsApp abaixo. Tom: ' + tone + '.\n' +
    (ask ? 'Pedido extra do corretor: ' + ask + '\n' : '') +
    '\nRegras:\n' +
    '- Mantenha o sentido, o nome Luis, "corretor da MRV" e a entrada a partir de R$ 500,00.\n' +
    format +
    'Exemplos do estilo desejado:\n\n' + examples.join('\n---\n')
  );
}

// Reescreve UMA mensagem já pronta (com nome, data, valores), sem marcadores.
function buildRewritePrompt(tone, source) {
  return (
    'Reescreva a mensagem de WhatsApp abaixo com outras palavras e outra estrutura de frase, mantendo o mesmo sentido. Tom: ' + tone + '.\n\n' +
    'Regras:\n' +
    '- Mantenha exatamente como estão: nomes, datas, horários, valores, nome do empreendimento e a apresentação do Luis, corretor da MRV.\n' +
    '- Não invente informações nem promessas.\n' +
    '- Tamanho parecido com o original. No máximo 1 emoji.\n' +
    '- Responda SOMENTE com a mensagem reescrita, sem aspas e sem explicações.\n\n' +
    'MENSAGEM:\n"""\n' + source + '\n"""'
  );
}

async function callOpenRouter(key, prompt, maxTokens) {
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50000);

  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
        // Opcionais: identificam seu app no painel do OpenRouter.
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://vercel.com',
        'X-Title': 'Disparador WhatsApp',
      },
      body: JSON.stringify({
        model,
        temperature: 1.0,
        max_tokens: maxTokens || 1500,
        // Pede pouco "raciocínio" (modelos que não suportam ignoram o campo). Deixa mais rápido.
        reasoning: { effort: 'low' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') return { status: 504, error: 'A IA demorou demais para responder. Tente de novo.' };
    return { status: 502, error: 'Não consegui falar com o OpenRouter agora. Tente de novo em instantes.' };
  }

  let detail = '';
  if (!r.ok) {
    try {
      const j = await r.clone().json();
      detail = j && j.error && j.error.message ? ' Detalhe: ' + String(j.error.message).slice(0, 200) : '';
    } catch (e) { /* sem detalhe */ }
  }
  clearTimeout(timer);

  if (r.status === 401) return { status: 502, error: 'O OpenRouter recusou a chave. Confira se OPENROUTER_API_KEY está correta e ativa.' + detail };
  if (r.status === 402) return { status: 502, error: 'Sem créditos no OpenRouter. Adicione saldo em openrouter.ai/credits ou use um modelo gratuito.' + detail };
  if (r.status === 429) return { status: 429, error: 'Limite de uso da IA atingido. Espere um pouco e tente de novo.' + detail };
  if (r.status === 400 || r.status === 404) return { status: 502, error: 'Modelo não encontrado ou pedido inválido. Confira OPENROUTER_MODEL na Vercel (formato provedor/modelo).' + detail };
  if (!r.ok) return { status: 502, error: 'O OpenRouter respondeu com erro (' + r.status + '). Tente de novo.' + detail };

  let data = {};
  try {
    data = await r.json();
  } catch (e) {
    return { status: 502, error: 'A resposta do OpenRouter veio incompleta. Tente de novo.' };
  }
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  const text = msg && typeof msg.content === 'string' ? msg.content : '';
  if (!text.trim()) return { status: 502, error: 'A IA não devolveu texto desta vez. Tente de novo.' };
  return { status: 200, text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'O servidor ainda não tem a chave da IA. Cadastre OPENROUTER_API_KEY na Vercel e faça um novo deploy.',
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const tone = TONES.includes(body.tone) ? body.tone : TONES[0];
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 1500) : '';

  let prompt, maxTokens;
  if (body.mode === 'rewrite') {
    maxTokens = 1200;
    if (!source) return res.status(400).json({ error: 'Não há mensagem para reescrever.' });
    prompt = buildRewritePrompt(tone, source);
  } else {
    const n = Math.min(15, Math.max(1, parseInt(body.n, 10) || 6));
    const ask = typeof body.ask === 'string' ? body.ask.trim().slice(0, 200) : '';
    const examples = (Array.isArray(body.examples) ? body.examples : [])
      .filter((x) => typeof x === 'string' && x.trim())
      .slice(0, 3)
      .map((x) => x.slice(0, 800));
    if (!examples.length) {
      return res.status(400).json({ error: 'Faltam exemplos de mensagem no texto-modelo.' });
    }
    maxTokens = Math.min(4096, 600 + n * 280);
    prompt = buildVariationsPrompt(n, tone, examples, source, ask);
  }

  const out = await callOpenRouter(key, prompt, maxTokens);
  if (out.error) return res.status(out.status).json({ error: out.error });
  return res.status(200).json({ text: out.text });
};
