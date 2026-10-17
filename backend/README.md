# EJC Print API

Backend NestJS separado do aplicativo Expo. O desenvolvimento local usa SQLite;
o deploy no Render usa MySQL e Cloudflare R2 para guardar comprovativos. O app
continua usando a sua base SQLite local durante a transição.

## Primeira execução

1. Copie `.env.example` para `.env`. A configuração padrão cria o ficheiro
   `prisma/dev.db` automaticamente. Defina `ADMIN_EMAIL`, gere
   `ADMIN_PASSWORD_HASH` e `ADMIN_SESSION_SECRET` com os comandos indicados
   no próprio ficheiro; nunca envie estes valores ao repositório.
2. Execute `npm install`.
3. Execute `npm run prisma:generate`.
4. Execute `npm run prisma:migrate -- --name init`.
5. Execute `npm run start:dev`.

## Desenvolvimento local e APK pela Internet

- O desenvolvimento local continua usando a URL definida em `../.env.local`.
   O perfil EAS `preview` também aponta para o computador e só funciona na mesma
   rede Wi-Fi, com o backend iniciado.
- O perfil EAS `online` gera um APK interno sem permitir HTTP em texto simples.
   Antes do build, configure `EXPO_PUBLIC_API_URL` no ambiente **Production** do
   EAS com a URL HTTPS pública do backend, terminada em `/api`. Não gere esse APK
   enquanto a variável apontar para `192.168.x.x` ou outro endereço local.
- Hospede o backend num servidor acessível pela Internet. O computador local
   poderá ficar desligado. Use o perfil com
   `npx eas-cli build --platform android --profile online` depois de configurar
   e testar o endpoint público.
- Para manter os dados SQLite após reinícios, hospede num servidor com volume
   persistente. Esse volume precisa guardar o ficheiro indicado por
   `DATABASE_URL` e a pasta `storage/payment-proofs`; faça backups regulares.
- O SQLite do aplicativo continua guardando dados locais para uso offline.
   Para clientes e administrador partilharem pedidos, o backend precisa estar
   acessível para sincronização; o SQLite local de cada aparelho/navegador não é
   compartilhado automaticamente.

## Render, MySQL e comprovativos

O Blueprint `../render.yaml` configura o backend no Render. Em produção, defina
`DATABASE_URL` com a URL MySQL do provedor escolhido e configure uma base MySQL
antes do primeiro deploy. O schema e migrations MySQL ficam em
`prisma/mysql`; o schema e migrations locais SQLite ficam em `prisma`.

Os comprovativos usam Cloudflare R2 pela API compatível com S3. Crie um bucket
privado e uma chave API com acesso apenas a esse bucket. Configure no Render
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET_NAME`.
O backend recusa iniciar em produção se as credenciais R2 estiverem incompletas
ou ausentes. Localmente, sem essas variáveis, os comprovativos continuam em
`storage/payment-proofs`.

Antes de apontar um APK para o Render:

1. Faça cópia de segurança da base SQLite local e dos ficheiros existentes.
2. Crie a base MySQL e configure `DATABASE_URL` e as quatro variáveis R2 no
   Dashboard do Render; não coloque credenciais no repositório.
3. Aplique as migrations MySQL pelo comando de arranque do Render. Migrations
   SQLite não devem ser executadas na base MySQL.
4. Transfira os dados SQLite para MySQL e carregue os comprovativos existentes
   para o bucket R2; atualizar apenas a variável não migra os dados.
5. Teste login, pedidos e upload/consulta de comprovativos na URL HTTPS.
6. Defina `EXPO_PUBLIC_API_URL=https://<dominio-publico>/api` no ambiente
   Production do EAS e só então gere o perfil `online`.

Com o servidor iniciado, os primeiros endpoints são:

- `POST /api/orders`
- `POST /api/orders/:id/document` (multipart `document`, PDF/DOC/DOCX, até 20 MB)
- `GET /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/:id/document`
- `PATCH /api/orders/:id/status`

Criar pedidos e enviar o respetivo documento permanecem públicos para permitir o
fluxo do cliente. Consultar pedidos/documentos e alterar estados exigem sessão
administrativa. A app do administrador sincroniza a lista remota com o SQLite
local ao abrir a tela ou atualizar manualmente; estados alterados ficam pendentes
localmente se a rede estiver indisponível e são reenviados depois.

O servidor recalcula o total e as folhas necessárias; portanto, não aceita
esses valores calculados diretamente do cliente. Os valores monetários são
gravados em centavos para evitar erros de arredondamento. Documentos são guardados
localmente durante desenvolvimento e no bucket privado R2 em produção. As telas
administrativas importam pagamentos pendentes remotos antes de os listar; ao
aprovar ou rejeitar, a decisão é sincronizada de volta ao servidor. Os estados
do pedido só avançam para produção/entrega depois das regras de pagamento atuais.

## Migração manual de dados locais

Para migrar o stock e as despesas que continuam guardados em SQLite local, use o
script de importação manual:

```bash
cd ..
ADMIN_TOKEN="<token-admin>" EXPO_PUBLIC_API_URL="https://<dominio-publico>/api" \
node scripts/migrate-local-db.mjs --db "C:/caminho/para/ejcprint.db"
```

Também pode usar:

```bash
node scripts/migrate-local-db.mjs --db "C:/caminho/para/ejcprint.db" --api "https://<dominio-publico>/api" --token "<token-admin>"
```

Este utilitário importa apenas registos de `stock` e `despesas` para o backend,
com `externalReference` determinístico para evitar duplicados. Não elimina o
SQLite local; apenas centraliza os dados históricos mais sensíveis de forma
segura e reexecutável.

## Acesso administrativo

`POST /api/payments` permanece público para permitir que o cliente comunique
um pagamento pendente. O endpoint `POST /api/payments/admin/confirmed` exige
sessão de administrador e serve apenas para sincronizar pagamentos já confirmados
localmente pelo administrador, sem um comprovativo disponível no dispositivo.
As operações de consulta e decisão — `GET /api/payments/:id`,
`GET /api/payments/pending`, `PATCH /api/payments/:id/approve` e
`PATCH /api/payments/:id/reject` — exigem um token obtido em
`POST /api/auth/admin/login`, enviado como `Authorization: Bearer <token>`.

O histórico de alterações administrativas pode ser consultado em
`GET /api/inventory/audit?skip=0&take=100` com o mesmo token. A tabela de
auditoria é criada pela migration `20261015130000_add_admin_audit_log`; aplique
a migration correspondente ao banco usado pelo backend antes de publicar a
versão que expõe esta tela. A API limita cada página a 100 registos.

O custo da tinta usado em cada nova impressão é guardado no movimento de stock.
Antes de publicar a versão que permite editar o custo unitário dos materiais,
aplique também a migration `20261015150000_add_ink_unit_cost_to_stock_movement`
correspondente à base SQLite ou MySQL. Assim, as alterações de custo não
modificam os custos estimados que já ficaram guardados nas impressões anteriores.

Ao iniciar impressões, o backend desconta do material `Tinta Epson L3252` o
consumo estimado em frascos: 1/4.500 por página a preto e branco ou 3/7.500 por
página a cores, incluindo a reserva de 10% já usada nos custos estimados. O
material deve estar cadastrado em frascos. Se o stock de papel ou tinta for
insuficiente, a operação inteira é cancelada; se o botão for acionado novamente
para um pedido já iniciado, a chave única do movimento impede um segundo débito.
Não é necessária nova migration de base de dados para estes movimentos, pois
utilizam os campos de stock existentes.

Se a tinta ainda estiver noutra unidade, use **Configurar stock da tinta em
frascos** na gestão de stock, conte os frascos físicos e informe o custo por
frasco e o mínimo de reposição. O sistema não converte automaticamente pacotes
em frascos e essa configuração não cria uma compra nem uma saída no Caixa.

Pagamentos locais pendentes, sem comprovativo disponível e ainda sem registo no
servidor, são marcados localmente como rejeitados com a indicação de que o
comprovativo deve ser enviado novamente. Isso não confirma nem contabiliza o
pagamento; permite que o cliente faça uma nova submissão válida.

O login principal é `POST /api/auth/login` e consulta utilizadores ADMIN
guardados no banco. O endpoint legado `POST /api/auth/admin/login` continua
disponível como recuperação enquanto o primeiro utilizador é criado. Depois de
obter essa sessão de recuperação, crie um utilizador com:

`POST /api/auth/admin/users` com `{ "name": "Nome", "email": "admin@example.com", "password": "uma-palavra-passe-forte" }`.

As palavras-passe dos utilizadores nunca são guardadas em texto simples.

O endpoint de criação aceita o campo multipart `proof` para imagens JPEG/PNG ou
PDF até 5 MB. O ficheiro é guardado localmente durante desenvolvimento e no
bucket privado R2 em produção. Pode ser consultado apenas por
`GET /api/payments/:id/proof` com sessão de administrador.

## Política de privacidade

A política pública é servida sem autenticação em `GET /api/privacy`, usando o
conteúdo de `privacy-policy.html`. O endereço de produção é
`https://ejcprint-1.onrender.com/api/privacy`; mantenha-o atualizado na ficha da
Play Store se o domínio do serviço mudar. A aplicação também liga a esta página
na tela inicial e junto ao envio de um pedido.

Atualize a política sempre que mudarem os dados tratados, os fornecedores, os
contactos ou as práticas de retenção/eliminação. A declaração “Segurança dos
dados” da Play Console deve continuar consistente com o comportamento real do
app e dos serviços.
