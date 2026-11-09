# Publicação do Git Dojo na VPS Contabo

O Dojo é publicado por **git push direto no servidor**, no mesmo modelo dos outros apps da VPS (`169.58.43.129`, Ubuntu 24.04, Nginx). O build é estático, sem banco nem fila: o hook faz o build com Node e copia `dist/` para a raiz do site. O único PHP são quatro scripts pequenos da tela de login, fora da raiz pública.

| O quê | Onde |
|---|---|
| Endereço | `https://gitdojo.rpatecnologia.com.br` (HTTP redireciona; certificado Let's Encrypt com renovação automática) |
| Raiz do site | `/var/www/gitdojo/public` (conteúdo de `dist/` mais `versao.txt`) |
| Repositório bare | `/home/deployer/repos/gitdojo.git` |
| Checkout e build | `/home/deployer/build/gitdojo` |
| Vhost Nginx | `/etc/nginx/sites-available/gitdojo.conf` (cópia de [nginx-gitdojo.conf](nginx-gitdojo.conf)) |
| Limite de tentativas e formato do log | `/etc/nginx/conf.d/gitdojo-limits.conf` (cópia de [nginx-gitdojo-limits.conf](nginx-gitdojo-limits.conf)) |
| Tela de login | `/var/www/gitdojo/public/login/` (cópia de [login/](login/), feita pelo hook) |
| Scripts do login | `/var/www/gitdojo/auth/` (cópia de [auth/](auth/), feita pelo hook) e a `chave` das sessões, gerada na VPS |
| Hook | `/home/deployer/repos/gitdojo.git/hooks/post-receive` (cópia de [post-receive](post-receive)) |
| Logs | `/var/log/nginx/gitdojo-access.log` e `gitdojo-error.log` |

## Dia a dia

Na raiz do projeto, no PC:

```powershell
git push production master
```

O remoto `production` é `deployer@169.58.43.129:/home/deployer/repos/gitdojo.git`. O hook roda `npm ci`, `npm run build` e sincroniza `dist/`; a saída aparece no terminal do push. Para saber qual commit está no ar: `git ls-remote production master` ou abrir `/versao.txt` no site.

## Conferir depois de publicar

Da máquina de desenvolvimento, com o Chrome instalado:

```powershell
$env:DOJO_USUARIO = "rodrigo"; $env:DOJO_SENHA = "<senha>"
npm run check:offline -- "$env:TEMP\git-dojo-check" https://gitdojo.rpatecnologia.com.br/
npm run check:video   -- "$env:TEMP\git-dojo-check" https://gitdojo.rpatecnologia.com.br/
```

O primeiro bloqueia toda requisição fora do host do Dojo e confere fontes, telas e `localStorage`; o segundo confere a janela do vídeo de abertura e os arquivos de vídeo servidos. Todos os roteiros de `scripts/` aceitam o endereço como último argumento e entram pela tela de login com `DOJO_USUARIO` e `DOJO_SENHA` (função `entraNoSite` de `scripts/lib-missoes.mjs`); `check:a11y` e `check:reflow` também conferem a própria tela de login. Se um dia for preciso testar um host sem DNS, `CHROME_ARGS` passa argumentos ao Chrome, por exemplo `--host-resolver-rules=MAP host 169.58.43.129`.

Com `curl`, o login grava o cookie num arquivo:

```bash
curl -c cookies.txt -b cookies.txt -d "usuario=<login>&senha=<senha>" https://gitdojo.rpatecnologia.com.br/_auth/login
curl -b cookies.txt https://gitdojo.rpatecnologia.com.br/versao.txt
```

## Logins

Um usuário por dev, em `/etc/nginx/gitdojo.htpasswd` (dono `root`, grupo `www-data`, permissão 640). Cadastrados em 08/11/2026: `rodrigo`, `ana`, `mario`, `leandro` e `maicon`. Para incluir alguém, na VPS:

```bash
echo "login:$(openssl passwd -apr1)" | sudo tee -a /etc/nginx/gitdojo.htpasswd   # pede a senha duas vezes
```

Para remover alguém ou trocar a senha, apague a linha da pessoa com `sudo nano /etc/nginx/gitdojo.htpasswd` (e, para trocar, rode o comando acima de novo). Não precisa recarregar o Nginx. Apagar a linha ou trocar a senha derruba na hora as sessões abertas dessa pessoa. Se houver duas linhas do mesmo login, vale a última. O progresso de cada pessoa continua no navegador dela, não na conta.

## Tela de login

Desde 08/11/2026 (Etapa 1H) quem abre o site sem sessão vê a tela de login do Dojo em `/login/`, e não mais a janela de senha do navegador. Como funciona:

- O vhost usa `auth_request`: todo pedido passa antes por `/_auth/check` (`check.php`), que responde 204 com sessão válida e 401 sem. Com 401, `/_auth/entrar` manda o navegador para `/login/?volta=<caminho pedido>`. Ficam livres sem login `/login/`, `/_auth/login`, `/_auth/logout`, `/_auth/me` (que respondem por conta própria) e o desafio do Certbot. `/assets/`, `/videos/` e `/versao.txt` exigem sessão.
- O formulário faz POST para `/_auth/login` (`login.php`), que confere a senha no mesmo `htpasswd` (verificação APR1-MD5 própria, porque o PHP não conhece o formato `$apr1$`, e comparação com `hash_equals`), grava o cookie e volta ao caminho pedido. Usuário inexistente e senha errada têm a mesma mensagem e o mesmo atraso. `volta` só aceita caminho deste site (começa com uma barra e não com duas). O Nginx limita o `/_auth/login` a 10 tentativas por minuto por IP, com folga de 5; o excesso recebe 429.
- A sessão é o cookie `gitdojo_sessao` (`usuario|expira|assinatura`, HMAC-SHA256), `Secure`, `HttpOnly`, `SameSite=Lax`, válido por 30 dias. Nada fica guardado no servidor. A assinatura cobre o hash da senha, por isso apagar a linha ou trocar a senha encerra as sessões da pessoa.
- A chave da assinatura fica em `/var/www/gitdojo/auth/chave` (640, `deployer:www-data`). O hook a gera no primeiro push e nunca a sobrescreve; ela não vai para o Git. Para derrubar a sessão de todo mundo de uma vez, apague esse arquivo e faça um push (ou gere outra chave com `head -c 32 /dev/urandom | od -An -tx1 | tr -d ' 
'`).
- O botão "Sair" da barra do topo leva a `/_auth/logout`, que apaga o cookie e volta para a tela de login com um aviso. Ele só aparece quando `/_auth/me` responde com o usuário logado; no Vite local não aparece.
- O log de acesso usa o formato `gitdojo`, com o usuário da sessão na segunda coluna.

Se o login quebrar depois de mexer no vhost, volte a cópia anterior na hora, porque ninguém entra: `sudo cp /etc/nginx/sites-available/gitdojo.conf.antes-login /etc/nginx/sites-available/gitdojo.conf && sudo nginx -t && sudo systemctl reload nginx` (essa cópia, ainda com `auth_basic`, foi guardada na instalação da tela de login).

## Instalar do zero (feito em 08/11/2026)

Como `deployer`, na VPS:

```bash
sudo mkdir -p /var/www/gitdojo/public && sudo chown -R deployer:www-data /var/www/gitdojo
git init --bare /home/deployer/repos/gitdojo.git
# copiar deploy/post-receive para /home/deployer/repos/gitdojo.git/hooks/post-receive e dar chmod +x
# copiar deploy/nginx-gitdojo.conf para /etc/nginx/sites-available/gitdojo.conf
# copiar deploy/nginx-gitdojo-limits.conf para /etc/nginx/conf.d/gitdojo-limits.conf
sudo ln -s /etc/nginx/sites-available/gitdojo.conf /etc/nginx/sites-enabled/gitdojo.conf
sudo nginx -t && sudo systemctl reload nginx
```

No PC: `git remote add production deployer@169.58.43.129:/home/deployer/repos/gitdojo.git` e `git push production master`. O primeiro push cria `/var/www/gitdojo/auth/` com os scripts e a chave. O PHP 8.3-FPM (`/run/php/php8.3-fpm.sock`, usuário `www-data`) já existia na VPS para os outros apps; o Dojo não muda a configuração dele.

## HTTPS

Ligado em 08/11/2026, depois que o registro A `gitdojo.rpatecnologia.com.br → 169.58.43.129` foi criado:

```bash
sudo certbot --nginx -d gitdojo.rpatecnologia.com.br --redirect -m rodrigogat8@gmail.com --agree-tos -n
```

O Certbot editou o vhost (blocos "managed by Certbot") e adicionou o redirecionamento de HTTP para HTTPS; o cabeçalho HSTS foi acrescentado à mão. O certificado expira em 06/02/2027 e renova sozinho pelo timer do Certbot. Depois de qualquer mudança no vhost, copie-o de volta para `deploy/nginx-gitdojo.conf`, para a cópia versionada continuar igual à do servidor.

## Cuidados

- **Trocar o endereço zera o progresso dos alunos**: o `localStorage` é por origem (esquema, host e porta). Não mude o domínio nem volte para HTTP depois que os devs começarem a usar.
- O vhost serve `.vtt` como `text/vtt` (o `mime.types` do Ubuntu não traz esse tipo), `.mp4` como `video/mp4` com suporte a `Range`, e manda o navegador guardar `assets/` por um ano e nunca guardar `index.html`.
- Se um push falhar no meio do hook, o site continua com a versão anterior: o `rsync` só roda depois do build terminar.
- `deploy/login/` é copiada para `dist/login/` pelo hook antes do `rsync --delete`; se ela saísse do repositório, a tela de login sumiria do site no push seguinte e ninguém entraria.
