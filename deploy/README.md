# Publicação do Git Dojo na VPS Contabo

O Dojo é publicado por **git push direto no servidor**, no mesmo modelo dos outros apps da VPS (`169.58.43.129`, Ubuntu 24.04, Nginx). Como o build é estático, não há PHP, banco nem fila: o hook faz o build com Node e copia `dist/` para a raiz do site.

| O quê | Onde |
|---|---|
| Endereço | `http://gitdojo.rpatecnologia.com.br` (HTTPS pelo Certbot quando o DNS existir) |
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
npm run check:offline -- "$env:TEMP\git-dojo-check" http://gitdojo.rpatecnologia.com.br/
npm run check:video   -- "$env:TEMP\git-dojo-check" http://gitdojo.rpatecnologia.com.br/
```

O primeiro bloqueia toda requisição fora do host do Dojo e confere fontes, telas e `localStorage`; o segundo confere a janela do vídeo de abertura e os arquivos de vídeo servidos. Enquanto o DNS não existir, defina `CHROME_ARGS` para o Chrome resolver o nome direto no IP:

```powershell
$env:CHROME_ARGS = "--host-resolver-rules=MAP gitdojo.rpatecnologia.com.br 169.58.43.129"
```

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

Depende de um registro A `gitdojo.rpatecnologia.com.br → 169.58.43.129` no DNS da empresa. Depois de propagado (`nslookup -type=A gitdojo.rpatecnologia.com.br 8.8.8.8`):

```bash
sudo certbot --nginx -d gitdojo.rpatecnologia.com.br --redirect -m rodrigogat8@gmail.com --agree-tos -n
```

O Certbot edita o vhost e adiciona o redirecionamento de HTTP para HTTPS. A renovação é automática (timer do Certbot já ativo na VPS).

## Cuidados

- **Trocar o endereço zera o progresso dos alunos**: o `localStorage` é por origem (esquema, host e porta). Mudar de HTTP para HTTPS também muda a origem, por isso o ideal é ligar o HTTPS **antes** do piloto.
- O vhost serve `.vtt` como `text/vtt` (o `mime.types` do Ubuntu não traz esse tipo), `.mp4` como `video/mp4` com suporte a `Range`, e manda o navegador guardar `assets/` por um ano e nunca guardar `index.html`.
- Se um push falhar no meio do hook, o site continua com a versão anterior: o `rsync` só roda depois do build terminar.
