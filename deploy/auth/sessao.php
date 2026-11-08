<?php
// Git Dojo — funções comuns da tela de login (Etapa 1H).
// Instalado em /var/www/gitdojo/auth/ (fora da raiz pública) pelo hook post-receive; o Nginx chama
// check.php, login.php, logout.php e me.php por FastCGI, e todos incluem este arquivo.
//
// Cadastro: o mesmo /etc/nginx/gitdojo.htpasswd de antes (uma linha "login:$apr1$..." por dev).
// Sessão: cookie assinado "usuario|expira|assinatura", sem nada guardado no servidor. A assinatura é um
// HMAC-SHA256 com a chave de /var/www/gitdojo/auth/chave (gerada na VPS, nunca versionada) e cobre também
// o hash da senha: apagar a linha de alguém ou trocar a senha derruba as sessões dessa pessoa na hora.
declare(strict_types=1);

defined('DOJO_HTPASSWD') || define('DOJO_HTPASSWD', '/etc/nginx/gitdojo.htpasswd');
defined('DOJO_CHAVE') || define('DOJO_CHAVE', __DIR__ . '/chave');
const DOJO_COOKIE = 'gitdojo_sessao';
const DOJO_VALIDADE = 30 * 24 * 3600; // 30 dias

/** Hash da senha de um usuário no htpasswd, ou null. Vale a última linha do usuário, se houver mais de uma. */
function dojo_hash_do_usuario(string $usuario): ?string
{
    $linhas = @file(DOJO_HTPASSWD, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($linhas === false) {
        return null;
    }
    $achado = null;
    foreach ($linhas as $linha) {
        $partes = explode(':', trim($linha), 2);
        if (count($partes) === 2 && $partes[0] === $usuario && $partes[1] !== '') {
            $achado = $partes[1];
        }
    }
    return $achado;
}

/** Login aceito: letras, números, ponto, hífen e sublinhado (o separador do cookie é "|"). */
function dojo_usuario_valido(string $usuario): bool
{
    return preg_match('/^[A-Za-z0-9._-]{1,64}$/', $usuario) === 1;
}

/** APR1-MD5 (formato $apr1$ do Apache e do `openssl passwd -apr1`), que o PHP não verifica nativamente. */
function dojo_apr1(string $senha, string $sal): string
{
    $sal = substr($sal, 0, 8);
    $tamanho = strlen($senha);
    $texto = $senha . '$apr1$' . $sal;
    $bin = md5($senha . $sal . $senha, true);
    for ($i = $tamanho; $i > 0; $i -= 16) {
        $texto .= substr($bin, 0, min(16, $i));
    }
    for ($i = $tamanho; $i > 0; $i >>= 1) {
        $texto .= ($i & 1) ? "\0" : $senha[0];
    }
    $bin = md5($texto, true);
    for ($i = 0; $i < 1000; $i++) {
        $rodada = ($i & 1) ? $senha : $bin;
        if ($i % 3) {
            $rodada .= $sal;
        }
        if ($i % 7) {
            $rodada .= $senha;
        }
        $rodada .= ($i & 1) ? $bin : $senha;
        $bin = md5($rodada, true);
    }
    $alfabeto = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    $saida = '';
    foreach ([[0, 6, 12], [1, 7, 13], [2, 8, 14], [3, 9, 15], [4, 10, 5]] as [$a, $b, $c]) {
        $v = (ord($bin[$a]) << 16) | (ord($bin[$b]) << 8) | ord($bin[$c]);
        for ($k = 0; $k < 4; $k++, $v >>= 6) {
            $saida .= $alfabeto[$v & 0x3f];
        }
    }
    $v = ord($bin[11]);
    for ($k = 0; $k < 2; $k++, $v >>= 6) {
        $saida .= $alfabeto[$v & 0x3f];
    }
    return '$apr1$' . $sal . '$' . $saida;
}

/** Confere a senha contra o hash do htpasswd: $apr1$ (o formato em uso) ou bcrypt ($2y$). */
function dojo_senha_confere(string $senha, string $hash): bool
{
    if (str_starts_with($hash, '$apr1$')) {
        $sal = explode('$', $hash)[2] ?? '';
        return $sal !== '' && hash_equals($hash, dojo_apr1($senha, $sal));
    }
    if (str_starts_with($hash, '$2y$') || str_starts_with($hash, '$2b$')) {
        return password_verify($senha, $hash);
    }
    return false;
}

function dojo_chave(): string
{
    $chave = @file_get_contents(DOJO_CHAVE);
    if ($chave === false || strlen(trim($chave)) < 32) {
        // Sem chave não há como assinar nem conferir sessões: falha fechada (o Nginx devolve 500).
        http_response_code(500);
        error_log('Git Dojo: chave da sessão ausente ou curta em ' . DOJO_CHAVE);
        exit;
    }
    return trim($chave);
}

function dojo_assinatura(string $usuario, int $expira, string $hash): string
{
    return hash_hmac('sha256', $usuario . '|' . $expira . '|' . $hash, dojo_chave());
}

/** Monta o valor do cookie para um usuário cujo hash já foi conferido. */
function dojo_valor_do_cookie(string $usuario, string $hash, int $agora): string
{
    $expira = $agora + DOJO_VALIDADE;
    return $usuario . '|' . $expira . '|' . dojo_assinatura($usuario, $expira, $hash);
}

/** Usuário da sessão, se o cookie for válido: assinatura, validade e linha no htpasswd. */
function dojo_usuario_da_sessao(?string $valor, int $agora): ?string
{
    if ($valor === null || $valor === '' || strlen($valor) > 256) {
        return null;
    }
    $partes = explode('|', $valor);
    if (count($partes) !== 3) {
        return null;
    }
    [$usuario, $expira, $assinatura] = $partes;
    if (!dojo_usuario_valido($usuario) || !ctype_digit($expira) || (int) $expira <= $agora) {
        return null;
    }
    $hash = dojo_hash_do_usuario($usuario);
    if ($hash === null) {
        return null;
    }
    return hash_equals(dojo_assinatura($usuario, (int) $expira, $hash), $assinatura) ? $usuario : null;
}

/** Grava (ou apaga, com $valor vazio) o cookie da sessão: Secure, HttpOnly, SameSite=Lax, caminho "/". */
function dojo_grava_cookie(string $valor, int $expira): void
{
    setcookie(DOJO_COOKIE, $valor, [
        'expires' => $expira,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/**
 * Caminho para onde voltar depois do login. Só aceita caminho relativo ao próprio site: começa com uma
 * barra e não com duas (nem com barra invertida), sem caracteres de controle, e fora de /_auth/ e /login.
 * Qualquer outra coisa vira "/", contra redirecionamento aberto.
 */
function dojo_volta_segura(?string $volta): string
{
    if (!is_string($volta) || $volta === '' || strlen($volta) > 1024) {
        return '/';
    }
    if ($volta[0] !== '/' || (isset($volta[1]) && ($volta[1] === '/' || $volta[1] === '\\'))) {
        return '/';
    }
    if (preg_match('/[\x00-\x20\x7f\\\\]/', $volta) === 1) {
        return '/';
    }
    if (preg_match('#^/(_auth(/|$)|login(/|$|\?))#', $volta) === 1) {
        return '/';
    }
    return $volta;
}

function dojo_sem_cache(): void
{
    header('Cache-Control: no-store');
}

function dojo_redireciona(string $destino): void
{
    dojo_sem_cache();
    header('Location: ' . $destino, true, 303);
    exit;
}
