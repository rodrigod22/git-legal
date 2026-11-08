# Publicação do Git Dojo na VPS Contabo

O Dojo é publicado por **git push direto no servidor**, no mesmo modelo dos outros apps da VPS (`169.58.43.129`, Ubuntu 24.04, Nginx). Como o build é estático, não há PHP, banco nem fila: o hook faz o build com Node e copia `dist/` para a raiz do site.

| O quê | Onde |
|---|---|
| Endereço | `https://gitdojo.rpatecnologia.com.br` (HTTP redireciona; certificado Let's Encrypt com renovação automática) |
| Raiz do site | `/var/www/gitdojo/public` (conteúdo de `dist/` mais `versao.txt`) |
| Repositório bare | `/home/deployer/repos/gitdojo.git` |
| Checkout e build | `/home/deployer/build/gitdojo` |
| Vhost Nginx | `/etc/nginx/sites-available/gitdojo.conf` (cópia de [nginx-gitdojo.conf](nginx-gitdojo.conf)) |
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

O primeiro bloqueia toda requisição fora do host do Dojo e confere fontes, telas e `localStorage`; o segundo confere a janela do vídeo de abertura e os arquivos de vídeo servidos. Os dois leem o login do site de `DOJO_USUARIO` e `DOJO_SENHA`. Se um dia for preciso testar um host sem DNS, `CHROME_ARGS` passa argumentos ao Chrome, por exemplo `--host-resolver-rules=MAP host 169.58.43.129`.

Os outros roteiros de `scripts/` ainda assumem o servidor de desenvolvimento em `127.0.0.1:5199` e não leem essas variáveis.

## Logins

Um usuário por dev, em `/etc/nginx/gitdojo.htpasswd` (dono `root`, grupo `www-data`, permissão 640). Cadastrados em 08/11/2026: `rodrigo`, `ana`, `mario`, `leandro` e `maicon`. Para incluir ou trocar a senha de alguém, na VPS:

```bash
echo "login:$(openssl passwd -apr1)" | sudo tee -a /etc/nginx/gitdojo.htpasswd   # pede a senha duas vezes
```

Para remover, apague a linha do arquivo com `sudo nano /etc/nginx/gitdojo.htpasswd`. Não precisa recarregar o Nginx. O progresso de cada pessoa continua no navegador dela, não na conta.

## Instalar do zero (feito em 08/11/2026)

Como `deployer`, na VPS:

```bash
sudo mkdir -p /var/www/gitdojo/public && sudo chown -R deployer:www-data /var/www/gitdojo
git init --bare /home/deployer/repos/gitdojo.git
# copiar deploy/post-receive para /home/deployer/repos/gitdojo.git/hooks/post-receive e dar chmod +x
# copiar deploy/nginx-gitdojo.conf para /etc/nginx/sites-available/gitdojo.conf
sudo ln -s /etc/nginx/sites-available/gitdojo.conf /etc/nginx/sites-enabled/gitdojo.conf
sudo nginx -t && sudo systemctl reload nginx
```

No PC: `git remote add production deployer@169.58.43.129:/home/deployer/repos/gitdojo.git` e `git push production master`.

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
