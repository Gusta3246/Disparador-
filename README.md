# Disparador de WhatsApp

Site de página única (`index.html`) com uma função no servidor (`api/gerar.js`) que gera variações de mensagem com o OpenRouter. A chave da IA fica só na Vercel e nunca aparece no navegador nem no GitHub.

## Estrutura

```
index.html       o app
api/gerar.js     função que chama o OpenRouter com a chave secreta
vercel.json      tempo máximo da função
package.json     versão do Node
.env.example     modelo das variáveis (sem chave real)
```

## Publicar

### 1. GitHub
1. Entre em github.com e clique em **New repository**. Nome sugerido: `disparador-whatsapp`. Marque **Private**.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Arraste todo o conteúdo desta pasta (incluindo a pasta `api`) e clique em **Commit changes**.
   - Confira que o repositório mostra `index.html`, `api/gerar.js`, `package.json` e `vercel.json`.
   - Se o `.gitignore` e o `.env.example` não aparecerem no envio pelo navegador, pode seguir sem eles.

### 2. Vercel
1. Entre em vercel.com com sua conta do GitHub.
2. **Add New > Project**, escolha o repositório e clique em **Import**.
3. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Nome | Valor |
   |---|---|
   | `OPENROUTER_API_KEY` | a chave criada em openrouter.ai/keys |
   | `OPENROUTER_MODEL` (opcional) | modelo no formato `provedor/modelo` (padrão `google/gemini-2.5-flash`) |
   | `ACCESS_CODE` | uma senha que você inventar (impede que outras pessoas usem sua cota) |

4. Clique em **Deploy**.
5. Se você cadastrou as variáveis depois do primeiro deploy, vá em **Deployments > ... > Redeploy** para elas valerem.

### 3. Usar
Abra o endereço que a Vercel gerou, vá em **Mais variações com IA**, digite a senha de acesso e clique em **Gerar com IA**. As versões novas entram no fim do texto da mensagem.

## Problemas comuns

- **"O servidor ainda não tem a chave da IA"**: falta `OPENROUTER_API_KEY` ou faltou o Redeploy.
- **"Senha de acesso incorreta"**: a senha digitada é diferente de `ACCESS_CODE`.
- **"O OpenRouter recusou a chave"**: a chave está errada ou foi desativada. Gere outra em openrouter.ai/keys.
- **"Modelo não encontrado"**: cadastre `OPENROUTER_MODEL` na Vercel com um ID válido de openrouter.ai/models.
- **"Sem créditos no OpenRouter"**: adicione saldo em openrouter.ai/credits ou escolha um modelo gratuito (ID terminado em `:free`).
- **"Limite de uso da IA atingido"**: espere alguns minutos.

## Segurança

- Nunca cole a chave em arquivo do projeto, em mensagem ou em print. Se ela vazar, apague e crie outra em openrouter.ai/keys.
- O texto da mensagem e a lista de contatos ficam no navegador. Só o texto-modelo vai ao servidor quando você usa a IA.
- Abrir o `index.html` direto do computador (sem a Vercel) funciona para todo o resto, mas o botão de IA só funciona no site publicado.
