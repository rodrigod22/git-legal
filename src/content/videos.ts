/**
 * Vídeos de abertura dos módulos (Fase 2). Os arquivos ficam em public/videos/ e são
 * produzidos a partir de videos/compositions/<modulo>.html (HyperFrames, render local).
 * As legendas (.vtt) são geradas destes mesmos textos por scripts/gerar-legendas.ts,
 * e a transcrição do player vem daqui também: o que está escrito na tela é o que está aqui.
 */
export interface Cue {
  /** início e fim em segundos */
  start: number;
  end: number;
  text: string;
}

export interface ModuleVideo {
  moduleId: string;
  /** caminho relativo ao index.html do build (base "./") */
  file: string;
  poster: string;
  captions: string;
  /** duração em segundos */
  duration: number;
  /** tamanho aproximado em MB, para avisar antes de carregar */
  sizeMb: number;
  cues: Cue[];
}

const cues = (lista: [number, number, string][]): Cue[] => lista.map(([start, end, text]) => ({ start, end, text }));

function video(moduleId: string, sizeMb: number, lista: [number, number, string][]): ModuleVideo {
  return { moduleId, file: `videos/${moduleId}.mp4`, poster: `videos/${moduleId}.jpg`, captions: `videos/${moduleId}.vtt`, duration: 60, sizeMb, cues: cues(lista) };
}

export const VIDEOS: ModuleVideo[] = [
  video("fundamentos", 3, [
    [0, 7, "Módulo 1 · Fundamentos. As três áreas do Git: de onde vem cada comando."],
    [7, 13, "Primeiro dia na Iron Systems. A pasta projeto-rpa tem index.php e config.php, mas nenhum histórico, nenhuma memória."],
    [13, 17, "Quem mudou a porta do banco ontem? Qual versão funcionava na semana passada? Ninguém sabe. Sua primeira tarefa: colocar o projeto sob controle de versão."],
    [17, 26, "git init. Initialized empty Git repository. A pasta virou um repositório: cada mudança agora pode virar história."],
    [26, 33, "As três áreas: working dir, staging e repositório. echo cria o README.md no working dir."],
    [33, 38, "git add README.md leva o arquivo para a staging, a bandeja do próximo commit."],
    [38, 42, "git commit -m \"primeiro commit\" grava a bandeja como um commit no repositório; a branch main aponta para ele."],
    [42, 47, "Na dúvida, git status: ele diz em que área cada arquivo está. Verde, na bandeja; vermelho, ainda só no disco."],
    [47, 52, "Um commit, uma intenção: duas mudanças sem relação viram dois commits. git add aceita o nome do arquivo."],
    [52, 60, "Repositório criado, primeiro commit feito. Tudo no Git passa por três áreas. Agora é com você. Missão 1: Primeiro dia na Iron Systems."],
  ]),
  video("branches", 3, [
    [0, 7, "Módulo 2 · Branches. Linhas paralelas de trabalho, sem quebrar a main."],
    [7, 12, "Uma demanda que não cabe em um commit: a tela de login precisa de formulário, validação da senha e sessão."],
    [12, 17, "Enquanto isso, a main precisa continuar funcionando. Na Iron Systems o padrão é commitar direto na main; para o que leva vários commits, quem preferir usa uma branch local curta."],
    [17, 26, "git switch -c feature/login. Switched to a new branch. Uma branch é só um ponteiro para um commit: criar uma é instantâneo e barato."],
    [26, 33, "Branch é um ponteiro. HEAD diz onde você está. git switch -c cria a etiqueta feature/login no mesmo commit da main e move o HEAD para ela."],
    [33, 42, "git commit: só a branch onde o HEAD está avança. A main continua no mesmo commit, intacta."],
    [42, 47, "Vida curta: a branch nasce, recebe um a três commits, volta para a main com merge e some com branch -d, no mesmo dia."],
    [47, 52, "Se está demorando dias, a tarefa é grande demais: quebre em partes. Chamaram para um hotfix? git stash guarda o trabalho pela metade; git stash pop devolve."],
    [52, 60, "Branch criada, commit isolado, main intacta. Branch é um ponteiro barato: use quando precisar. Agora é com você. Missão 1: Sua primeira branch."],
  ]),
  video("merge", 3, [
    [0, 7, "Módulo 3 · Merge. Integrando o trabalho: fast-forward e merge de três vias."],
    [7, 17, "A feature ficou pronta: feature/login tem dois commits novos e a main não recebeu nenhum desde que a branch nasceu. Hora de trazer o trabalho de volta."],
    [17, 27, "git switch main, depois git merge feature/login. Fast-forward: a main não andou, então o merge é só o ponteiro avançando. Nenhum commit novo é criado."],
    [27, 33, "Dois jeitos de integrar. Fast-forward: a main só alcança a feature; o ponteiro anda e nada é criado."],
    [33, 42, "Três vias: as duas branches andaram. O Git compara a base com os dois lados e cria um commit de merge, com dois pais, que registra a união."],
    [42, 52, "Três coisas para lembrar: faça o merge estando na branch que recebe; partes diferentes do código se combinam sozinhas, a mesma linha vira conflito; --no-ff é opção, não regra."],
    [52, 60, "Trabalho integrado, histórico linear. Fast-forward quando dá, commit de merge quando precisa. Missão 1: Fast-forward."],
  ]),
  video("conflitos", 3, [
    [0, 7, "Módulo 4 · Conflitos. Quando duas pessoas mudam a mesma linha."],
    [7, 18, "Duas pessoas, uma linha: você mudou o título do README.md na feature/titulo e, ao mesmo tempo, o Carlos mudou a mesma linha na main."],
    [18, 27, "git merge feature/titulo. CONFLICT (content): Merge conflict in README.md. O Git não tem como decidir sozinho: ele pede uma decisão humana."],
    [27, 36, "Anatomia de um conflito: entre <<<<<<< HEAD e ======= está o seu lado, a branch onde você está. Depois do ======= até >>>>>>> feature/titulo está o lado que está chegando."],
    [36, 41, "O ======= é só o separador entre os dois lados."],
    [41, 51, "Resolver é decidir: edite o arquivo até ficar do jeito certo, um lado, o outro ou os dois juntos, e apague os três marcadores."],
    [51, 60, "git add README.md e git commit fecham o merge. Conflito resolvido, árvore limpa. Conflito não é erro. Agora é com você."],
  ]),
  video("trunk", 3, [
    [0, 7, "Módulo 5 · Trunk-based. O fluxo oficial da Iron Systems: commits pequenos, direto na main, várias vezes por dia."],
    [7, 13, "Alguém chegou antes: você commita a página sobre e a Ana faz push de \"ajusta título do index\" antes de você."],
    [13, 18, "git push: rejected, fetch first. O remoto só aceita push quando o que ele tem é ancestral do seu commit."],
    [18, 28, "git pull --rebase reaplica seus commits por cima dos da Ana; git push é aceito. Histórico linear, sem commit de merge."],
    [28, 33, "Uma linha só, o time inteiro: você, Ana e Carlos commitam na mesma main, que o origin acompanha."],
    [33, 42, "O ritual: commit pequeno, git pull --rebase, git push, várias vezes por dia. Quanto mais tempo um commit fica só na sua máquina, maior a chance de conflito. Pequeno e frequente vence grande e raro."],
    [42, 48, "Proibido na main: git push --force e git reset. O motivo: a main está na máquina de todo mundo; reescrever o histórico do remoto deixa os repositórios divergentes e pode perder trabalho."],
    [48, 52, "git revert <commit> desfaz com um commit novo. Nada é apagado, tudo fica auditável."],
    [52, 60, "Push aceito, histórico linear. Commit pequeno, pull --rebase, push, várias vezes por dia. Agora é com você. Missão 1: Push rejeitado."],
  ]),
  video("perigo", 3, [
    [0, 7, "Módulo 6 · Zona de Perigo. Reescrever e resgatar história, com consciência."],
    [7, 17, "Três rascunhos antes do push: wip 1, wip 2 e wip 3 ainda não saíram da sua máquina. O time merece um commit limpo, com nome que diga o que entrou."],
    [17, 27, "git reset --soft HEAD~3: a branch volta três commits e as mudanças ficam na bandeja. git commit -m \"adiciona filtro de busca\": um commit só, com nome de verdade."],
    [27, 36, "Os três resets. --soft move a branch e mantém staging e arquivos. --mixed, o padrão, move e limpa a staging. --hard move, limpa e descarta tudo."],
    [36, 41, "Só em commits que nunca saíram da sua máquina. Na main compartilhada, reset é proibido: lá o certo é git revert."],
    [41, 47, "O Git lembra de tudo: git branch -D feature/importacao apagou dois dias de trabalho. Pânico? Não. git reflog é o diário do HEAD."],
    [47, 52, "Commits perdidos continuam no repositório por semanas. git branch feature/importacao 7c1d2e3 traz tudo de volta."],
    [52, 60, "Commits juntados, branch resgatada. Poder exige consciência: reset só no local, reflog é a rede de segurança. Missão 1: Juntando commits locais."],
  ]),
];

export function videoFor(moduleId: string): ModuleVideo | undefined {
  return VIDEOS.find((v) => v.moduleId === moduleId);
}
