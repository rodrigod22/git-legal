<?php
// Git Dojo — entrada (Etapa 1H). Atende a dois casos:
//  - POST /_auth/login, vindo do formulário de /login/: confere usuário e senha no htpasswd, grava o
//    cookie da sessão e volta para o caminho pedido; na falha, volta para /login/?erro=1.
//  - /_auth/entrar, quando o Nginx recebe 401 do check.php e faz o redirecionamento interno (error_page 401)
//    para cá: manda o navegador para /login/?volta=<caminho pedido>, com o caminho codificado.
// O Nginx limita os pedidos a /_auth/login por IP (limit_req, zona gitdojo_login).
declare(strict_types=1);
require __DIR__ . '/sessao.php';

$agora = time();

if (($_SERVER['DOJO_ACAO'] ?? '') === 'entrar' || ($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    // DOJO_ACAO=entrar vem do location interno /_auth/entrar. REQUEST_URI é o pedido original, porque o
    // redirecionamento do error_page é interno; num GET direto a /_auth/login, volta vira "/".
    $volta = dojo_volta_segura($_SERVER['REQUEST_URI'] ?? '/');
    dojo_redireciona('/login/' . ($volta === '/' ? '' : '?volta=' . rawurlencode($volta)));
}

// Formulário de outro site não entra: se o navegador mandar Origin, tem de ser o próprio Dojo.
$origem = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
if ($origem !== '' && $origem !== 'https://' . $host) {
    http_response_code(403);
    dojo_sem_cache();
    exit;
}

$usuario = is_string($_POST['usuario'] ?? null) ? trim($_POST['usuario']) : '';
$senha = is_string($_POST['senha'] ?? null) ? $_POST['senha'] : '';
$volta = dojo_volta_segura(is_string($_POST['volta'] ?? null) ? $_POST['volta'] : '/');

$hash = dojo_usuario_valido($usuario) ? dojo_hash_do_usuario($usuario) : null;
// Usuário inexistente também calcula um hash, para o tempo de resposta não dizer quem existe.
$confere = $senha !== '' && strlen($senha) <= 1024 && dojo_senha_confere($senha, $hash ?? '$apr1$00000000$xxxxxxxxxxxxxxxxxxxxxx');

if (!$confere || $hash === null) {
    usleep(400000); // atraso fixo na falha; a mesma mensagem serve para usuário e senha
    // A âncora #erro mostra o aviso mesmo sem JavaScript (regra :target da tela de login).
    dojo_redireciona('/login/?erro=1' . ($volta === '/' ? '' : '&volta=' . rawurlencode($volta)) . '#erro');
}

dojo_grava_cookie(dojo_valor_do_cookie($usuario, $hash, $agora), $agora + DOJO_VALIDADE);
dojo_redireciona($volta);
