<?php
// Git Dojo — quem está logado (Etapa 1H). O Dojo pergunta aqui para decidir se mostra o botão "Sair":
// 200 com {"usuario": "..."} quando a sessão é válida, 401 sem corpo quando não é. O Nginx não protege
// esta rota com auth_request, para a resposta ser sempre JSON ou 401, e nunca a tela de login.
declare(strict_types=1);
require __DIR__ . '/sessao.php';

$usuario = dojo_usuario_da_sessao($_COOKIE[DOJO_COOKIE] ?? null, time());
dojo_sem_cache();
if ($usuario === null) {
    http_response_code(401);
    exit;
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['usuario' => $usuario]);
