// Publica a versão web da EJC Print na Vercel.
//
// Uso (na pasta principal do projeto):  npm run deploy:web
//
// 1. Gera o site estático em dist/ com o endereço da API de produção (Render).
// 2. Cria dist/vercel.json para as rotas da app não darem 404 ao recarregar.
// 3. Publica só a pasta dist/ na Vercel (o backend continua na Render).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API_PRODUCAO = 'https://ejcprint-1.onrender.com/api';

function executar(comando, argumentos, ambiente = {}) {
  const linha = [comando, ...argumentos].join(' ');
  console.log(`\n> ${linha}\n`);
  const resultado = spawnSync(linha, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...ambiente },
  });
  if (resultado.status !== 0) {
    console.error(`\nO comando falhou: ${comando} ${argumentos.join(' ')}`);
    process.exit(resultado.status ?? 1);
  }
}

// Variáveis já definidas no processo têm prioridade sobre .env/.env.local,
// por isso o site publicado aponta sempre para a Render, mesmo que o .env.local
// esteja a apontar para o backend local.
const apiUrl = process.env.EXPO_PUBLIC_API_URL_PRODUCAO || API_PRODUCAO;
console.log(`A gerar o site web com a API: ${apiUrl}`);
executar('npx', ['expo', 'export', '-p', 'web', '--output-dir', 'dist'], {
  EXPO_PUBLIC_API_URL: apiUrl,
});

// Google Search Console: prova que o site é nosso. O Expo regenera dist/index.html a
// cada publicação, por isso reinserimos a meta tag aqui. Não remover: o Google exige
// que ela continue no site mesmo depois de verificado.
const metaGoogle =
  '<meta name="google-site-verification" content="6CX4VF_Y9Tndd2fZ5J4xA3ubU5utjrgNE_SZl0WAhSc" />';
const caminhoIndex = join('dist', 'index.html');
if (existsSync(caminhoIndex)) {
  const html = readFileSync(caminhoIndex, 'utf8');
  if (!html.includes('google-site-verification')) {
    writeFileSync(caminhoIndex, html.replace('</head>', `${metaGoogle}</head>`));
    console.log('\nMeta tag de verificação do Google adicionada a dist/index.html.');
  }
}

// A Vercel nunca envia pastas chamadas "node_modules", mas o Expo coloca ícones e o
// motor da base de dados (wa-sqlite.wasm) em dist/assets/node_modules/. Sem isto o
// site fica preso em "A preparar a base de dados...". Mudamos o nome da pasta e
// atualizamos os caminhos no código gerado.
function ficheirosDe(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? ficheirosDe(caminho) : [caminho];
  });
}
const pastaModulos = join('dist', 'assets', 'node_modules');
if (existsSync(pastaModulos)) {
  renameSync(pastaModulos, join('dist', 'assets', 'vendor'));
  for (const ficheiro of ficheirosDe('dist').filter((f) => /\.(js|html|json|css)$/.test(f))) {
    const conteudo = readFileSync(ficheiro, 'utf8');
    if (conteudo.includes('/assets/node_modules/')) {
      writeFileSync(ficheiro, conteudo.split('/assets/node_modules/').join('/assets/vendor/'));
    }
  }
  console.log('\nRecursos movidos para dist/assets/vendor (a Vercel ignora pastas node_modules).');
}

// Garante que o site gerado usa mesmo a API de produção (a cache do Metro podia
// ter guardado outro endereço, por exemplo o do backend local).
const pastaJs = join('dist', '_expo', 'static', 'js', 'web');
const usaApiProducao = readdirSync(pastaJs)
  .filter((nome) => nome.endsWith('.js'))
  .some((nome) => readFileSync(join(pastaJs, nome), 'utf8').includes(apiUrl));
if (!usaApiProducao) {
  console.error(
    `\nO site gerado não está a usar ${apiUrl}.\n` +
    'Feche o servidor do Expo (Ctrl + C no terminal do "npx expo start") e corra:\n' +
    '  npx expo export -p web --output-dir dist --clear\n' +
    'e depois de novo: npm run deploy:web',
  );
  process.exit(1);
}
console.log(`\nConfirmado: o site usa ${apiUrl}`);

writeFileSync(
  join('dist', 'vercel.json'),
  JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/index.html' }] }, null, 2),
);
console.log('\nCriado dist/vercel.json');

// Ligação fixa ao projeto "dist" da Vercel (equipa chiba-service). O export do Expo
// apaga a pasta dist/, por isso recriamos a ligação a cada publicação: assim a Vercel
// não volta a fazer perguntas nem a criar projetos novos.
mkdirSync(join('dist', '.vercel'), { recursive: true });
writeFileSync(
  join('dist', '.vercel', 'project.json'),
  JSON.stringify({
    projectId: 'prj_0Lf8DET874ONkK0LJZzPTARfrBsO',
    orgId: 'team_V86fn3cBr4rAD4nDMamdauvx',
    projectName: 'dist',
  }),
);
// Nunca publicar ficheiros de ambiente (podem conter tokens).
for (const nome of readdirSync('dist')) {
  if (nome.startsWith('.env')) rmSync(join('dist', nome), { force: true });
}

executar('npx', ['vercel', 'deploy', 'dist', '--prod', '--yes']);
console.log('\nPublicação concluída.');
