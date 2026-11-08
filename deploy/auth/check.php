<?php
// Git Dojo — subrequisição do auth_request do Nginx (Etapa 1H). Responde 204 quando o cookie da sessão é
// válido (assinatura, validade e usuário ainda presente no htpasswd) e 401 quando não é; com 401, o Nginx
// redireciona o navegador para a tela de login.
declare(strict_types=1);
require __DIR__ . '/sessao.php';

$usuario = dojo_usuario_da_sessao($_COOKIE[DOJO_COOKIE] ?? null, time());
dojo_sem_cache();
if ($usuario === null) {
    http_response_code(401);
    exit;
}
header('X-Dojo-Usuario: ' . $usuario);
http_response_code(204);
