# whats-middle

Middleware que conecta ao **WhatsApp** (via [open-wa](https://github.com/open-wa/wa-automate-nodejs)),
salva **todo o histórico de mensagens** (privadas e grupos) em um banco **SQLite** bem estruturado
e expõe um **dashboard estilo SaaS** para consultar tudo — ordenado por data/hora e pronto para
você pedir resumos por contato, número ou grupo.

## ✨ O que ele faz

- **Conecta ao WhatsApp** com QR Code (exibido no terminal **e** no dashboard).
- **Salva automaticamente** cada mensagem recebida (e enviada, se habilitado):
  - **Privadas** → nome do contato (se salvo) ou apenas o número, + mensagem, data/hora.
  - **Grupos** → nome do grupo, descrição, participantes (com nomes/números) e quem enviou cada mensagem.
- **Fotos de perfil**: baixa e exibe a foto do contato e do grupo. Contato não salvo aparece com o número.
- **Banco SQLite** indexado e ordenado por data/hora (`messages.timestamp`).
- **Dashboard SaaS**: login, visão geral com gráficos, lista de conversas, contatos, grupos,
  busca global, logs e configurações.
- **Logs detalhados** (arquivo + banco + visíveis no painel).
- **Exportação** de qualquer conversa em `.txt`/`.json` e botão **"Copiar p/ resumo"** —
  cole no Claude e peça o resumo.
- **Roda sob PM2**.

## 🧱 Stack

| Camada      | Tecnologia                          |
|-------------|-------------------------------------|
| WhatsApp    | `@open-wa/wa-automate`              |
| Banco       | `better-sqlite3` (SQLite)          |
| API/Servidor| `express`                          |
| Logs        | `winston`                          |
| Dashboard   | HTML + Tailwind (CDN) + Chart.js   |
| Processo    | `pm2`                              |

## 🚀 Instalação

> Requer **Node.js 18+**. Na primeira instalação o open-wa baixa o Chromium (pode demorar).

```bash
cd whats-middle
npm install
cp .env.example .env      # no Windows: copy .env.example .env
```

Edite o `.env` (porta, senha do painel, etc.). **Troque a senha padrão.**

## ▶️ Como rodar

### Direto (para parear/testar)
```bash
npm start
```
Abra **http://localhost:3333**, faça login (`admin` / `admin` por padrão) e vá em
**Configurações** para escanear o QR Code. Assim que conectar, as mensagens começam a ser salvas.

### Com PM2 (produção)
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 logs whats-middle      # acompanhar logs
pm2 save                   # persistir entre reboots
pm2 startup                # iniciar junto com o sistema
```

## 🔍 Pedindo resumos

1. Abra a conversa (privada ou grupo) no dashboard.
2. Clique em **Copiar p/ resumo** (ou **Exportar .txt**).
3. Cole aqui no Claude e peça, por exemplo:
   _"Resuma as mensagens do grupo Fornecedores China de ontem"_ ou
   _"Resuma o que o +55 11 9... me mandou esta semana"_.

As mensagens já vêm ordenadas por data/hora com remetente identificado.

## ⚙️ Configurações (`.env`)

| Variável            | Padrão        | Descrição                                            |
|---------------------|---------------|------------------------------------------------------|
| `PORT`              | `3333`        | Porta do dashboard.                                  |
| `AUTH_ENABLED`      | `true`        | Exige login no painel.                               |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `admin`/`admin` | Credenciais do painel.                   |
| `SESSION_ID`        | `whats-middle`| Identificador da sessão do WhatsApp.                 |
| `HEADLESS`          | `true`        | Roda o Chromium sem janela.                          |
| `CAPTURE_OUTGOING`  | `true`        | Também salva as mensagens **enviadas** por você.     |
| `SAVE_MEDIA`        | `true`        | Baixa e arquiva mídias recebidas.                    |
| `SAVE_MEDIA_TYPES`  | `image,sticker,ptt,audio,video,document` | Tipos de mídia salvos. |
| `SAVE_AVATARS`      | `true`        | Baixa fotos de perfil de contatos e grupos.          |
| `LOG_LEVEL`         | `info`        | Nível de log.                                        |

## 🗂️ Estrutura

```
whats-middle/
├── ecosystem.config.js      # PM2
├── src/
│   ├── index.js             # ponto de entrada (sobe servidor + WhatsApp)
│   ├── config.js            # leitura do .env
│   ├── logger.js            # winston (console + arquivo + banco)
│   ├── db/
│   │   ├── schema.sql        # estrutura do SQLite
│   │   ├── database.js       # conexão
│   │   └── models.js         # consultas/repos
│   ├── whatsapp/
│   │   ├── client.js         # conexão open-wa + estado/QR
│   │   ├── handlers.js       # salva mensagens, grupos, participantes
│   │   ├── avatars.js        # download de fotos de perfil
│   │   └── util.js           # parsing de número/id, previews
│   └── server/
│       ├── server.js         # API REST + dashboard
│       └── auth.js           # login por token
├── public/                  # dashboard (SPA)
└── data/                    # banco SQLite + mídias (gitignored)
```

## 🔐 Observações

- A pasta `data/` (banco e mídias) e o `.env` ficam fora do Git (`.gitignore`).
- Este projeto guarda **suas próprias** conversas para consulta pessoal. Respeite as leis de
  privacidade e os Termos do WhatsApp ao usá-lo.
- `open-wa` é uma automação não-oficial; use uma conta que você controla.

## 🧯 Problemas comuns

- **`better-sqlite3` não compila no Windows** → instale o _build tools_
  (`npm i -g windows-build-tools`) ou use uma versão de Node com prebuild disponível (18/20/22 LTS).
- **QR não aparece** → veja **Configurações** no painel ou os logs (`pm2 logs whats-middle`).
- **Reconectar** → botão **Reiniciar conexão** em Configurações, ou `pm2 restart whats-middle`.
# Yummis-connector
