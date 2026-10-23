// Função serverless da Vercel: recebe o pedido do site, chama o Gemini com a chave
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

async function callGemini(key, prompt) {
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 50000);

  // Modelos "thinking" ficam lentos se pensarem muito. Pedimos pouco raciocínio (thinkingLevel low).
  // Se o modelo não aceitar esse campo (erro 400), repetimos sem ele.
  const post = (withThinking) =>
    fetch(url, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: Object.assign(
          { temperature: 1.0, maxOutputTokens: 4096 },
          withThinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}
        ),
      }),
    });

  let r;
  try {
    r = await post(true);
    if (r.status === 400) r = await post(false);
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') return { status: 504, error: 'O Gemini demorou demais para responder. Tente de novo.' };
    return { status: 502, error: 'Não consegui falar com o Gemini agora. Tente de novo em instantes.' };
  }

  let detail = '';
  if (!r.ok) {
    try {
      const j = await r.clone().json();
      detail = j && j.error && j.error.message ? ' Detalhe: ' + String(j.error.message).slice(0, 200) : '';
    } catch (e) { /* sem detalhe */ }
  }

  if (r.status === 429) { clearTimeout(timer); return { status: 429, error: 'Limite gratuito da IA atingido. Espere um pouco e tente de novo.' + detail }; }
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    clearTimeout(timer);
    return { status: 502, error: 'O Gemini recusou o pedido. Confira se a chave GEMINI_API_KEY está correta e ativa.' + detail };
  }
  if (r.status === 404) {
    clearTimeout(timer);
    return { status: 502, error: 'Modelo do Gemini não encontrado. Defina GEMINI_MODEL na Vercel com um modelo disponível.' + detail };
  }
  if (!r.ok) { clearTimeout(timer); return { status: 502, error: 'O Gemini respondeu com erro (' + r.status + '). Tente de novo.' + detail }; }

  let data = {};
  try {
    data = await r.json();
  } catch (e) {
    clearTimeout(timer);
    return { status: 502, error: 'A resposta do Gemini veio incompleta. Tente de novo.' };
  }
  clearTimeout(timer);
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = Array.isArray(parts) ? parts.filter((x) => !x.thought).map((x) => x.text || '').join('') : '';
  if (!text.trim()) return { status: 502, error: 'A IA não devolveu texto desta vez. Tente de novo.' };
  return { status: 200, text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'O servidor ainda não tem a chave da IA. Cadastre GEMINI_API_KEY na Vercel e faça um novo deploy.',
    });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const tone = TONES.includes(body.tone) ? body.tone : TONES[0];
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 1500) : '';

  let prompt;
  if (body.mode === 'rewrite') {
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
    prompt = buildVariationsPrompt(n, tone, examples, source, ask);
  }

  const out = await callGemini(key, prompt);
  if (out.error) return res.status(out.status).json({ error: out.error });
  return res.status(200).json({ text: out.text });
};
