// Publica a versão web da EJC Print na Vercel.
//
// Uso (na pasta principal do projeto):  npm run deploy:web
//
// 1. Gera o site estático em dist/ com o endereço da API de produção (Render).
// 2. Cria dist/vercel.json para as rotas da app não darem 404 ao recarregar.
// 3. Publica só a pasta dist/ na Vercel (o backend continua na Render).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API_PRODUCAO = 'https://ejcprint-1.onrender.com/api';

function executar(comando, argumentos, ambiente = {}) {
  console.log(`\n> ${comando} ${argumentos.join(' ')}\n`);
  const resultado = spawnSync(comando, argumentos, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
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

executar('npx', ['vercel', 'deploy', 'dist', '--prod']);
console.log('\nPublicação concluída.');
