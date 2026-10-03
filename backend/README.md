# EJC Print API

Backend NestJS separado do aplicativo Expo, também usando SQLite. O app atual
continua usando a sua base SQLite local; a integração com a API será feita por
etapas, mantendo-a como fallback durante a transição.

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

## Render e preservação de dados

O Blueprint `../render.yaml` configura um Web Service Node com disco persistente
montado em `/var/data`. Discos persistentes exigem um plano pago no Render,
aceitam apenas uma instância e podem causar alguns segundos de indisponibilidade
durante deploys. Guardar o Blueprint no repositório não cria nem cobra recursos.

No Render, `DATABASE_URL` usa `file:/var/data/ejcprint.db` e
`PAYMENT_PROOFS_DIR` usa `/var/data/payment-proofs`. Localmente, os padrões
continuam sendo `prisma/dev.db` e `storage/payment-proofs`.

Antes de apontar um APK para o Render:

1. Pare gravações no backend local e faça backup de `prisma/dev.db` e da pasta
   `storage/payment-proofs`.
2. Provisione o Blueprint e o disco; configure os segredos de administrador no
   Dashboard do Render.
3. Copie o banco e os comprovativos existentes para `/var/data` antes de
   enviar tráfego de clientes. Preserve o conteúdo de `prisma/migrations` para
   que `prisma migrate deploy` possa aplicar migrations pendentes.
4. Teste login, pedidos, comprovativos e reinício do serviço no endereço HTTPS.
5. Só então defina `EXPO_PUBLIC_API_URL=https://<dominio-publico>/api` no
   ambiente Production do EAS e gere o perfil `online`.

Não escale este backend para várias instâncias enquanto usar SQLite no disco
local do serviço.

Com o servidor iniciado, os primeiros endpoints são:

- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/status`

As rotas de consulta e alteração de pedidos exigem sessão administrativa. Criar
um pedido permanece público para permitir o fluxo do cliente.

O servidor recalcula o total e as folhas necessárias; portanto, não aceita
esses valores calculados diretamente do cliente. Os valores monetários são
gravados em centavos para evitar erros de arredondamento do SQLite. Documentos
ainda não são enviados nesta etapa: o modelo `Document` prepara o armazenamento
que será acrescentado em seguida.

## Acesso administrativo

`POST /api/payments` permanece público para permitir que o cliente comunique
um pagamento pendente. As operações de consulta e decisão — `GET /api/payments/:id`,
`GET /api/payments/pending`, `PATCH /api/payments/:id/approve` e
`PATCH /api/payments/:id/reject` — exigem um token obtido em
`POST /api/auth/admin/login`, enviado como `Authorization: Bearer <token>`.

O login principal é `POST /api/auth/login` e consulta utilizadores ADMIN
guardados no banco. O endpoint legado `POST /api/auth/admin/login` continua
disponível como recuperação enquanto o primeiro utilizador é criado. Depois de
obter essa sessão de recuperação, crie um utilizador com:

`POST /api/auth/admin/users` com `{ "name": "Nome", "email": "admin@example.com", "password": "uma-palavra-passe-forte" }`.

As palavras-passe dos utilizadores nunca são guardadas em texto simples.

O endpoint de criação aceita o campo multipart `proof` para imagens JPEG/PNG ou
PDF até 5 MB. O ficheiro é guardado em `storage/payment-proofs` e pode ser
consultado apenas por `GET /api/payments/:id/proof` com sessão de administrador.
