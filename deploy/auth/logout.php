<?php
// Git Dojo — saída (Etapa 1H): apaga o cookie da sessão e volta para a tela de login, com o aviso de saída.
// O progresso do aluno não é tocado: ele fica no localStorage do navegador.
declare(strict_types=1);
require __DIR__ . '/sessao.php';

dojo_grava_cookie('', 1);
dojo_redireciona('/login/?saiu=1#saiu');
