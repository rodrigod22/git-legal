#!/bin/bash
# Mede no Git real os cinco desvios e os comandos vizinhos.
[ -n "$1" ] || { echo "uso: bash scripts/medir-desvios-git-real.sh <pasta-temporária>"; exit 1; }
T="$1/realgit2"; rm -rf "$T"; mkdir -p "$T"; cd "$T" || exit 1
g() { git -c user.name=t -c user.email=t@t -c init.defaultBranch=main -c core.autocrlf=false -c advice.detachedHead=false "$@"; }
mk() { cd "$T"; rm -rf r; mkdir r; cd r; g init -q; printf 'a\nb\n' > a.txt; printf 'x\n' > x.txt; g add .; g commit -qm um; echo 2 > b.txt; g add .; g commit -qm dois; }
tem() { [ -f "$1" ] && echo "mantém $1" || echo "APAGOU $1"; }
div() { mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo m > m.txt; g add .; g commit -qm m; g switch -q f; }

echo "== 1 rebase + não rastreado"; div; echo u > u.txt; g rebase main 2>&1 | tail -1; tem u.txt
echo "== 1b rebase + não rastreado que colide"; div; echo outro > m.txt; g rebase main 2>&1 | tail -4; echo "rc=${PIPESTATUS[0]}"; cat m.txt
echo "== 1c rebase parado em conflito + não rastreado, depois --abort"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g switch -q f; echo u > u.txt; g rebase main 2>&1 | tail -1; tem u.txt; g rebase --abort; tem u.txt
echo "== 1d rebase --continue + não rastreado"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g switch -q f; echo u > u.txt; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; GIT_EDITOR=true g rebase --continue 2>&1 | tail -1; tem u.txt
echo "== 1e pull --rebase + não rastreado"; mk; cd ..; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g branch -q -u origin/main; cd ..; g clone -q o.git c; cd c; echo n > n.txt; g add .; g commit -qm colega; g push -q; cd ../r; echo l > l.txt; g add .; g commit -qm local; echo u > u.txt; g pull --rebase 2>&1 | tail -1; tem u.txt; cd "$T"; rm -rf o.git c
echo "== 2 reset --hard + não rastreado"; mk; echo u > u.txt; g reset -q --hard HEAD~1; tem u.txt; tem b.txt
echo "== 2b reset --hard com não rastreado que colide"; mk; g reset -q --hard HEAD~1; echo outro > b.txt; g reset --hard main@{1} 2>&1 | tail -1; cat b.txt
echo "== 3 revert + não rastreado"; mk; echo u > u.txt; g revert --no-edit HEAD 2>&1 | tail -1; tem u.txt
echo "== 3b revert que recria arquivo colidindo com não rastreado"; mk; rm b.txt; g add .; g commit -qm tira; echo outro > b.txt; g revert --no-edit HEAD 2>&1 | tail -3; echo "rc=${PIPESTATUS[0]}"; cat b.txt
echo "== 3c revert com alteração local não relacionada"; mk; echo d >> x.txt; g revert --no-edit HEAD 2>&1 | tail -2; g status -s
echo "== 4 cherry-pick + não rastreado"; div; g switch -q main; echo u > u.txt; g cherry-pick f 2>&1 | tail -1; tem u.txt
echo "== 4b cherry-pick --abort + não rastreado"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; echo u > u.txt; g cherry-pick f >/dev/null 2>&1; g cherry-pick --abort; tem u.txt
echo "== 4c revert --abort + não rastreado"; mk; echo Z > b.txt; g add .; g commit -qm z; echo u > u.txt; g revert --no-edit HEAD~1 >/dev/null 2>&1; g status -s | head -3; g revert --abort; tem u.txt
echo "== 5 reset HEAD arquivo"; mk; echo y >> a.txt; echo y >> x.txt; g add .; g reset -q HEAD a.txt; g status -s
echo "== 5b reset HEAD -- arquivo"; mk; echo y >> a.txt; echo y >> x.txt; g add .; g reset -q HEAD -- a.txt; g status -s
echo "== 5c reset -- arquivo"; mk; echo y >> a.txt; echo y >> x.txt; g add .; g reset -q -- a.txt; g status -s
echo "== 5d reset HEAD~1 arquivo"; mk; echo y >> a.txt; g add .; g reset -q HEAD~1 b.txt; g status -s
echo "== 5e reset --hard HEAD arquivo"; mk; g reset --hard HEAD a.txt 2>&1 | tail -1
echo "== 5f reset --soft HEAD arquivo"; mk; g reset --soft HEAD a.txt 2>&1 | tail -1
echo "== 6 switch hash / HEAD~1 / origin/main"; mk; h=$(g rev-parse HEAD~1); g switch "$h" 2>&1 | head -2; g switch HEAD~1 2>&1 | head -1
echo "== 6b switch --detach hash"; g switch --detach "$h" 2>&1 | tail -1; g status | head -1; g switch -q main
echo "== 6c checkout hash continua aceito"; g checkout -q "$h"; g status | head -1; g switch -q main
echo "== 6d switch para ref remota"; g update-ref refs/remotes/origin/main HEAD; g switch origin/main 2>&1 | head -2
echo "== 6e switch sem nome conhecido"; g switch naoexiste 2>&1 | head -2
echo "== 7 diff arquivo"; mk; echo y >> a.txt; echo y >> x.txt; g diff a.txt | grep -c '^diff'; g diff -- a.txt | grep -c '^diff'
echo "== 7b diff --staged arquivo"; mk; echo y >> a.txt; echo y >> x.txt; g add .; g diff --staged a.txt | grep -c '^diff'
echo "== 7c diff HEAD arquivo"; mk; echo y >> a.txt; echo y >> x.txt; g diff HEAD a.txt | grep -c '^diff'
echo "== 7d diff ref ref arquivo"; mk; g diff HEAD~1 HEAD b.txt | grep -c '^diff'; g diff HEAD~1 HEAD a.txt | grep -c '^diff'
echo "== 7e diff de arquivo inexistente"; mk; g diff nada.txt 2>&1 | head -2
echo "== 7f arquivo sem alteração"; mk; g diff a.txt | wc -l
echo "== 7g nome de arquivo igual ao de branch"; mk; g branch a.txt; g diff a.txt 2>&1 | head -2

# ---------- Ampliação da Etapa 1B2 ----------
export GIT_EDITOR=true
st() { g status --porcelain=v1 | sed 's/^/   /'; }
rc() { "$@" 2>&1 | sed 's/^/   /'; echo "   rc=${PIPESTATUS[0]}"; }
est() { for f in .git/rebase-merge .git/MERGE_HEAD .git/CHERRY_PICK_HEAD .git/REVERT_HEAD; do [ -e "$f" ] && echo "   estado: $f"; done; true; }
# f tem um commit que cria u.txt e outro que apaga: na ponta, u.txt não é rastreado
meio() { mk; g switch -qc f; echo U > u.txt; g add .; g commit -qm cria-u; rm u.txt; g add .; g commit -qm tira-u; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo m > m.txt; g add .; g commit -qm m; g switch -q f; }
# conflito em x.txt com dois commits em f: o segundo cria p.txt
conf() { mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; echo p > p.txt; g add .; g commit -qm P; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g switch -q f; }
# conflito de merge em x.txt, com novo.txt criado pelos dois lados
mconf() { mk; g switch -qc f; echo F > x.txt; echo F > novo.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; echo M > novo.txt; g add .; g commit -qm M; }

echo "=== R1 colisão no meio do rebase"; meio; echo meu > u.txt; rc g rebase main; est; st; g log --oneline -1 | cut -d' ' -f2; g branch --show-current | sed 's/^/   branch=/'; cat u.txt
echo "--- R1b --continue com o arquivo ainda lá"; rc g rebase --continue; est; cat u.txt
echo "--- R1c tira o arquivo e --continue"; rm u.txt; rc g rebase --continue; est; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo; ls
echo "=== R2 colisão no meio, depois --abort"; meio; echo meu > u.txt; g rebase main >/dev/null 2>&1; rc g rebase --abort; est; cat u.txt; g branch --show-current
echo "=== R3 parado por colisão, git add do arquivo, --continue"; meio; echo meu > u.txt; g rebase main >/dev/null 2>&1; g add u.txt; rc g rebase --continue; est; st
echo "=== R4 colisão com conteúdo idêntico (início do rebase)"; div; echo m > m.txt; rc g rebase main; est
echo "=== R5 colisão em rebase fast-forward"; mk; g switch -qc f; g switch -q main; echo m > m.txt; g add .; g commit -qm m; g switch -q f; echo outro > m.txt; rc g rebase main; est; cat m.txt
echo "=== R6 pull --rebase com colisão: origin/main avança?"; mk; cd ..; rm -rf o.git c; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g branch -q -u origin/main; cd ..; g clone -q o.git c; cd c; echo n > n.txt; g add .; g commit -qm colega; g push -q; cd ../r; echo l > l.txt; g add .; g commit -qm local; echo outro > n.txt; rc g pull --rebase; est; g rev-parse --short origin/main main; g log --oneline -1 origin/main | cut -d' ' -f2; g status | sed -n 2,3p; cat n.txt; cd "$T"; rm -rf o.git c
echo "=== R7 parado em conflito, edita arquivo rastreado não relacionado sem add, --continue"; conf; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo sujo >> a.txt; rc g rebase --continue; est; st; tail -1 a.txt
echo "=== R7b igual, mas o último commit do todo: parado, edita, --continue conclui?"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g switch -q f; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo sujo >> a.txt; rc g rebase --continue; est; st; tail -1 a.txt
echo "=== R8 parado em conflito, cria não rastreado que colide com o próximo commit, --continue"; conf; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo meu > p.txt; rc g rebase --continue; est; st; cat p.txt
echo "=== R9 parado em conflito, não rastreado colide com a ponta original, --abort"; conf; g rebase main >/dev/null 2>&1; echo meu > p.txt; rc g rebase --abort; est; st; cat p.txt
echo "=== R10 parado em conflito, arquivo novo em staging, --abort"; conf; g rebase main >/dev/null 2>&1; echo n > n.txt; g add n.txt; rc g rebase --abort; est; st; ls
echo "=== R11 parado em conflito, reset --hard, --continue"; conf; echo u > u.txt; g rebase main >/dev/null 2>&1; rc g reset --hard HEAD; est; st; rc g rebase --continue; est; st; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo
echo "=== R12 commit já presente na base é descartado?"; mk; g switch -qc f; echo igual > i.txt; g add .; g commit -qm igual-f; g switch -q main; echo igual > i.txt; g add .; g commit -qm igual-m; g switch -q f; rc g rebase main; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo

echo "=== H1 reset --hard com arquivo novo em staging"; mk; echo n > n.txt; g add n.txt; rc g reset --hard HEAD; ls; st
echo "=== H2 reset --hard com arquivo novo em staging, alterado depois do add"; mk; echo n > n.txt; g add n.txt; echo n2 > n.txt; rc g reset --hard HEAD; ls
echo "=== H3 reset --hard em conflito de merge: arquivo criado nos dois lados, não rastreado mantido"; mconf; echo u > u.txt; g merge f >/dev/null 2>&1; st; rc g reset --hard HEAD; est; st; ls; cat novo.txt
echo "=== H4 reset --hard para commit sem o arquivo, depois de git rm --cached"; mk; g rm -q --cached b.txt; st; rc g reset --hard HEAD~1; st; ls
echo "=== H5 reset --hard: arquivo em conflito que some no alvo"; mconf; g merge f >/dev/null 2>&1; rc g reset --hard HEAD~1; ls; st
echo "=== H6 reset --hard limpa cherry-pick parado"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; echo u > u.txt; g cherry-pick f >/dev/null 2>&1; est; rc g reset --hard HEAD; est; st

echo "=== C1 cherry-pick que cria arquivo colidindo com não rastreado"; div; g switch -q main; echo outro > f.txt; rc g cherry-pick f; est; st; cat f.txt
echo "=== C2 cherry-pick, colisão com conteúdo idêntico"; div; g switch -q main; echo f > f.txt; rc g cherry-pick f; est; st
echo "=== C3 cherry-pick com conflito em um arquivo e colisão em outro"; mk; g switch -qc f; echo F > x.txt; echo c > c.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; echo meu > c.txt; rc g cherry-pick f; est; st; cat c.txt
echo "=== C4 revert com conflito em um arquivo e colisão em outro"; mk; rm b.txt; echo X > x.txt; g add .; g commit -qm tira; echo X2 > x.txt; g add .; g commit -qm muda; echo meu > b.txt; rc g revert --no-edit HEAD~1; est; st; cat b.txt
echo "=== C5 revert: conflito modify/delete em arquivo que colide"; mk; echo 3 > b.txt; g add .; g commit -qm muda-b; rm b.txt; g add .; g commit -qm tira-b; echo meu > b.txt; rc g revert --no-edit HEAD~1; est; st; cat b.txt
echo "=== C6 revert com colisão de conteúdo idêntico"; mk; rm b.txt; g add .; g commit -qm tira; echo 2 > b.txt; rc g revert --no-edit HEAD; est; st
echo "=== C7 cherry-pick parado, edita arquivo não relacionado, --abort"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g cherry-pick f >/dev/null 2>&1; echo sujo >> a.txt; rc g cherry-pick --abort; est; st
echo "=== C8 cherry-pick parado, arquivo novo em staging, --abort"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g cherry-pick f >/dev/null 2>&1; echo n > n.txt; g add n.txt; rc g cherry-pick --abort; est; st; ls
echo "=== C9 merge parado, arquivo novo em staging, --abort"; mconf; g merge f >/dev/null 2>&1; echo n > n.txt; g add n.txt; rc g merge --abort; est; st; ls
echo "=== C10 cherry-pick parado, arquivo trazido limpo pelo pick, --abort"; mk; g switch -qc f; echo F > x.txt; echo t > t.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; echo u > u.txt; g cherry-pick f >/dev/null 2>&1; st; rc g cherry-pick --abort; st; ls
echo "=== C11 revert parado, edita arquivo não relacionado, --abort"; mk; echo Z > b.txt; g add .; g commit -qm z; g revert --no-edit HEAD~1 >/dev/null 2>&1; echo sujo >> a.txt; rc g revert --abort; est; st

echo "=== P1 reset arquivo"; mk; echo y >> a.txt; echo y >> x.txt; g add .; rc g reset a.txt; st
echo "=== P2 reset nome desconhecido"; mk; rc g reset nada.txt
echo "=== P3 reset HEAD nome desconhecido"; mk; rc g reset HEAD nada.txt
echo "=== P4 reset HEAD -- nome desconhecido"; mk; rc g reset HEAD -- nada.txt
echo "=== P5 reset -- nome desconhecido"; mk; rc g reset -- nada.txt
echo "=== P6 reset refruim -- arquivo"; mk; rc g reset refruim -- a.txt
echo "=== P7 reset --mixed HEAD arquivo"; mk; echo y >> a.txt; g add .; rc g reset --mixed HEAD a.txt; st
echo "=== P8 reset --hard -- arquivo e --soft -- arquivo"; mk; rc g reset --hard -- a.txt; rc g reset --soft -- a.txt; rc g reset --hard HEAD -- a.txt
echo "=== P9 reset nome igual a branch e arquivo"; mk; g branch a.txt; rc g reset a.txt; rc g reset HEAD a.txt; rc g reset -- a.txt
echo "=== P10 reset de arquivo apagado da pasta, sem HEAD e com HEAD"; mk; echo y >> a.txt; g add .; rm a.txt; rc g reset a.txt; rc g reset HEAD a.txt; st
echo "=== P11 reset . e reset HEAD ."; mk; echo y >> a.txt; echo y >> x.txt; g add .; rc g reset .; st; g add .; rc g reset HEAD .; st
echo "=== P12 reset HEAD do arquivo em conflito"; mconf; echo u > u.txt; g merge f >/dev/null 2>&1; st; rc g reset HEAD x.txt; est; st; grep -c '<<<<' x.txt
echo "=== P13 reset sem nada durante conflito de merge"; mconf; g merge f >/dev/null 2>&1; rc g reset; est; st; grep -c '<<<<' x.txt
echo "=== P14 reset de dois arquivos"; mk; echo y >> a.txt; echo y >> x.txt; echo y > b.txt; g add .; rc g reset HEAD a.txt x.txt; st
echo "=== P15 reset de arquivo novo em staging"; mk; echo n > n.txt; g add .; rc g reset n.txt; st; g add .; rc g reset HEAD~1 -- n.txt; st
echo "=== P16 reset HEAD~1 -- arquivo, sem mover a branch"; mk; h=$(g rev-parse HEAD); rc g reset HEAD~1 -- b.txt; st; [ "$h" = "$(g rev-parse HEAD)" ] && echo "   HEAD parado"
echo "=== P17 reset a.txt x.txt (primeiro é arquivo) e reset a.txt nada.txt"; mk; echo y >> a.txt; echo y >> x.txt; g add .; rc g reset a.txt x.txt; st; rc g reset a.txt nada.txt
echo "=== P18 reset HEAD (só referência) continua mexendo só no index"; mk; echo y >> a.txt; g add .; rc g reset HEAD; st
echo "=== P19 reset commit em arquivo fora do commit"; mk; echo n > n.txt; rc g reset HEAD~1 n.txt; st

echo "=== S1 switch -f hash"; mk; h=$(g rev-parse HEAD~1); rc g switch -f "$h"
echo "=== S2 switch HEAD"; mk; rc g switch HEAD
echo "=== S3 switch --detach sem argumento"; mk; rc g switch --detach; g status | head -1
echo "=== S4 switch para a branch atual"; mk; rc g switch main
echo "=== S5 switch para branch que só existe no remoto"; mk; g update-ref refs/remotes/origin/nova HEAD; rc g switch nova; g status | head -2
echo "=== S6 switch -c nome hash continua aceito"; mk; h=$(g rev-parse HEAD~1); rc g switch -c novo "$h"; g status | head -1
echo "=== S7 checkout origin/main continua aceito"; mk; g update-ref refs/remotes/origin/main HEAD; rc g checkout origin/main; g status | head -1
echo "=== S8 checkout -f com não rastreado"; mk; echo u > u.txt; g switch -qc f; rc g checkout -f main; ls
echo "=== S9 switch que colidiria com não rastreado"; mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo outro > f.txt; rc g switch f; cat f.txt
echo "=== S10 switch --detach para branch"; mk; g switch -qc f; rc g switch --detach main; g status | head -1

echo "=== D1 arquivo apagado da pasta"; mk; rm b.txt; rc g diff b.txt; rc g diff -- b.txt; rc g diff HEAD b.txt; rc g diff HEAD -- b.txt
echo "=== D2 deleção em staging"; mk; g rm -q b.txt; rc g diff --staged b.txt; rc g diff --staged -- b.txt; rc g diff b.txt
echo "=== D3 -- com nome desconhecido"; mk; rc g diff -- nada.txt; rc g diff HEAD -- nada.txt; rc g diff --staged -- nada.txt; rc g diff --staged nada.txt
echo "=== D4 referência ruim antes de --"; mk; rc g diff refruim -- a.txt; rc g diff a.txt -- x.txt
echo "=== D5 dois arquivos, e um desconhecido"; mk; echo y >> a.txt; echo y >> x.txt; rc g diff a.txt x.txt; rc g diff a.txt nada.txt; rc g diff nada.txt a.txt
echo "=== D6 não rastreado"; mk; echo u > u.txt; rc g diff u.txt; rc g diff -- u.txt; rc g diff HEAD u.txt; rc g diff HEAD; rc g diff --staged u.txt
echo "=== D7 novo em staging"; mk; echo n > n.txt; g add .; rc g diff n.txt; rc g diff HEAD n.txt; rc g diff --staged n.txt
echo "=== D8 --staged com referência"; mk; echo y >> a.txt; g add .; echo z >> a.txt; rc g diff --staged HEAD~1 a.txt; rc g diff --staged HEAD~1
echo "=== D9 ambíguo com --"; mk; echo y >> a.txt; g branch a.txt; rc g diff a.txt; rc g diff -- a.txt; rc g diff a.txt --
echo "=== D10 branch e arquivo, e referência sem arquivo"; mk; echo y >> a.txt; rc g diff main a.txt; rc g diff HEAD~1 b.txt; rc g diff HEAD~1 HEAD~1 a.txt
echo "=== D11 duas referências, arquivo fora da pasta"; mk; rm b.txt; rc g diff HEAD~1 HEAD b.txt; rc g diff HEAD~1 HEAD -- b.txt
echo "=== D12 ponto"; mk; echo y >> a.txt; rc g diff .; rc g diff HEAD .; rc g diff --staged .
echo "=== D13 durante conflito"; mconf; g merge f >/dev/null 2>&1; rc g diff; rc g diff x.txt; rc g diff -- a.txt
echo "=== D14 três referências"; mk; rc g diff HEAD~1 HEAD main
echo "=== D15 pasta"; mk; mkdir src; echo 1 > src/s.txt; g add .; g commit -qm s; echo 2 > src/s.txt; rc g diff src; rc g diff src/; rc g diff -- src; rc g reset HEAD src

echo "=== C12 cherry-pick parado apagou t.txt, aluno recria como não rastreado, --abort"; mk; echo t > t.txt; g add .; g commit -qm t; g switch -qc f; rm t.txt; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g cherry-pick f >/dev/null 2>&1; st; echo meu > t.txt; st; rc g cherry-pick --abort; est; st; cat t.txt
echo "=== C13 merge parado apagou t.txt, aluno recria como não rastreado, --abort"; mk; echo t > t.txt; g add .; g commit -qm t; g switch -qc f; rm t.txt; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g merge f >/dev/null 2>&1; echo meu > t.txt; rc g merge --abort; est; st; cat t.txt
echo "=== C14 revert parado apagou t.txt, aluno recria como não rastreado, --abort"; mk; g switch -qc f; echo t > t.txt; echo F > x.txt; g add .; g commit -qm F; echo G > x.txt; g add .; g commit -qm G; g revert --no-edit HEAD~1 >/dev/null 2>&1; st; echo meu > t.txt; rc g revert --abort; est; st; cat t.txt
echo "=== C15 merge parado, arquivo com add e edição posterior, --abort"; mconf; g merge f >/dev/null 2>&1; echo R > x.txt; g add x.txt; echo R2 > x.txt; rc g merge --abort; est; st; cat x.txt
echo "=== P20 restore --staged de arquivo em conflito"; mconf; g merge f >/dev/null 2>&1; rc g restore --staged x.txt; est; st
echo "=== P21 reset --hard -- sem arquivo"; mk; echo y >> a.txt; rc g reset --hard --; st
echo "=== P22 reset arquivo durante rebase parado"; conf; g rebase main >/dev/null 2>&1; rc g reset HEAD x.txt; est; st
echo "=== S5b switch para branch que só existe no remoto, com remoto configurado"; mk; cd ..; rm -rf o.git; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g push -q origin main:nova; g fetch -q; rc g switch nova; g status | head -2; cd "$T"; rm -rf o.git
echo "=== M1 pull sem rebase com colisão: origin/main avança?"; mk; cd ..; rm -rf o.git c; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g branch -q -u origin/main; cd ..; g clone -q o.git c; cd c; echo n > n.txt; g add .; g commit -qm colega; g push -q; cd ../r; echo outro > n.txt; rc g pull; g log --oneline -1 origin/main | cut -d' ' -f2; cat n.txt; cd "$T"; rm -rf o.git c
echo "=== M2 pull --rebase com alteração local: faz fetch?"; mk; cd ..; rm -rf o.git c; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g branch -q -u origin/main; cd ..; g clone -q o.git c; cd c; echo n > n.txt; g add .; g commit -qm colega; g push -q; cd ../r; echo y >> a.txt; rc g pull --rebase; g log --oneline -1 origin/main | cut -d' ' -f2; cd "$T"; rm -rf o.git c
echo "=== M3 pull --rebase com colisão no meio"; mk; cd ..; rm -rf o.git c; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g branch -q -u origin/main; cd ..; g clone -q o.git c; cd c; echo n > n.txt; g add .; g commit -qm colega; g push -q; cd ../r; echo U > u.txt; g add .; g commit -qm cria-u; rm u.txt; g add .; g commit -qm tira-u; echo meu > u.txt; rc g pull --rebase; est; st; cat u.txt; cd "$T"; rm -rf o.git c
echo "=== S11 switch com arquivo novo em staging que colide com o destino"; mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo meu > f.txt; g add .; rc g switch f; cat f.txt
echo "=== S12 switch com arquivo apagado sem add, que difere no destino"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; rm x.txt; rc g switch f; st; cat x.txt
echo "=== M4 merge com arquivo apagado sem add, que o merge toca"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo m > m.txt; g add .; g commit -qm m; rm x.txt; rc g merge --no-edit f; st; cat x.txt
echo "=== R13 rebase para branch já mesclada"; mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo m > m.txt; g add .; g commit -qm m; g merge -q --no-edit f; rc g rebase f; g log --oneline | cut -d' ' -f2- | tr '\n' ';'; echo
echo "=== T1 títulos: revert de revert e merge com HEAD desanexado"; mk; g revert --no-edit HEAD >/dev/null; g revert --no-edit HEAD >/dev/null; g log -1 --format=%s; mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo m > m.txt; g add .; g commit -qm m; g switch -q --detach HEAD; g merge -q --no-edit f; g log -1 --format=%s

# ---------- Ampliação da Etapa 1B3 ----------
# f tem f.txt a mais que main
fx() { mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; }
# f e main divergem em x.txt (F / M), sem commit extra
xconf() { mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; }
echo "=== S13 checkout -f com não rastreado que colide com o destino"; fx; echo outro > f.txt; rc g checkout -f f; st; cat f.txt
echo "=== S14 checkout -f com arquivo novo em staging"; mk; g switch -qc f; echo n > n.txt; g add n.txt; rc g checkout -f main; st; ls
echo "=== S15 checkout -f com edição em rastreado e em conflito"; mconf; g merge f >/dev/null 2>&1; echo y >> a.txt; rc g checkout -f f; est; st; cat x.txt
echo "=== S16 switch -c nome outra-branch com colisão"; fx; echo outro > f.txt; rc g switch -c nova f; st; cat f.txt
echo "=== S17 merge fast-forward com colisão"; fx; echo outro > f.txt; rc g merge f; st; cat f.txt
echo "=== S18 switch com não rastreado idêntico ao destino"; fx; echo f > f.txt; rc g switch f; st
echo "=== S19 switch com arquivo novo em staging que não colide"; fx; echo n > n.txt; g add .; rc g switch f; st
echo "=== S20 switch com arquivo apagado sem add, igual no destino"; fx; rm x.txt; rc g switch f; st
echo "=== S21 switch com arquivo apagado sem add, que o destino não tem"; mk; g switch -qc f; g rm -q b.txt; g commit -qm tira; g switch -q main; rm b.txt; rc g switch f; st; ls
echo "=== S22 switch com arquivo apagado COM add, que difere no destino"; xconf; g rm -q x.txt; rc g switch f; st
echo "=== S23 checkout -f para hash mantém não rastreado"; mk; echo u > u.txt; h=$(g rev-parse HEAD~1); rc g checkout -f "$h"; ls; st
echo "=== S24 switch com edição sem add em arquivo que o destino não muda"; fx; echo y >> a.txt; rc g switch f; st
echo "=== M5 merge 3-way com arquivo apagado sem add, que o merge não toca"; mk; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo m > m.txt; g add .; g commit -qm m; rm b.txt; rc g merge --no-edit f; st
echo "=== M6 merge 3-way com arquivo apagado sem add, que o merge toca e conflita"; xconf; rm x.txt; rc g merge --no-edit f; est; st
echo "=== M7 merge ff com arquivo apagado sem add, que o destino apaga também"; mk; g switch -qc f; g rm -q b.txt; g commit -qm tira; g switch -q main; rm b.txt; rc g merge f; st
echo "=== M8 merge ff com arquivo apagado COM add, que difere no destino"; xconf; g rm -q x.txt; rc g merge f; st
echo "=== M9 merge ff com arquivo apagado sem add, que difere no destino"; mk; g switch -qc f; echo F > x.txt; echo f > f.txt; g add .; g commit -qm F; g switch -q main; rm x.txt; rc g merge f; st; cat x.txt
echo "=== R14 rebase parado em conflito, add, edição em outro arquivo, --abort"; conf; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo sujo >> a.txt; rc g rebase --abort; est; st; tail -1 a.txt
echo "=== R15 rebase parado em conflito, add em x.txt e edição depois, --continue"; conf; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo FM2 > x.txt; rc g rebase --continue; est; st; cat x.txt
echo "=== R16 rebase parado em conflito, add em x.txt e edição depois, --abort"; conf; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo FM2 > x.txt; rc g rebase --abort; est; st; cat x.txt
echo "=== R17 rebase parado em conflito, arquivo novo em staging, --continue"; conf; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo n > n.txt; g add n.txt; rc g rebase --continue; est; st; g show --stat --format=%s HEAD~1 | sed 's/^/   /'
echo "=== R18 rebase parado em conflito, não rastreado solto, --continue"; conf; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo u > u.txt; rc g rebase --continue; est; st
echo "=== R18b rebase parado em conflito, resolvido, edição sem add em arquivo não relacionado, último commit"; xconf; g switch -q f; g rebase main >/dev/null 2>&1; echo FM > x.txt; g add x.txt; echo sujo >> b.txt; rc g rebase --continue; est; st
echo "=== R19 rebase: commit fica vazio só depois de resolver o conflito"; conf; g rebase main >/dev/null 2>&1; echo M > x.txt; g add x.txt; rc g rebase --continue; est; st; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo
echo "=== R19b igual, mas é o último commit"; xconf; g switch -q f; g rebase main >/dev/null 2>&1; echo M > x.txt; g add x.txt; rc g rebase --continue; est; st; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo; g branch --show-current
echo "=== R20 rebase com commit idêntico na base e outro commit depois"; mk; g switch -qc f; echo igual > i.txt; g add .; g commit -qm igual-f; echo p > p.txt; g add .; g commit -qm P; g switch -q main; echo igual > i.txt; g add .; g commit -qm igual-m; g switch -q f; rc g rebase main; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo
echo "=== R21 rebase com todos os commits já na base: branch anda para a base?"; mk; g switch -qc f; echo igual > i.txt; g add .; g commit -qm igual-f; g switch -q main; echo igual > i.txt; g add .; g commit -qm igual-m; echo m > m.txt; g add .; g commit -qm m; g switch -q f; rc g rebase main; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo; g rev-parse --short HEAD main
echo "=== R22 rebase com commit que fica vazio sem ser idêntico (base chega ao mesmo i.txt em dois passos)"; mk; g switch -qc f; echo igual > i.txt; g add .; g commit -qm igual-f; g switch -q main; echo quase > i.txt; g add .; g commit -qm quase; echo igual > i.txt; g add .; g commit -qm igual-m; g switch -q f; rc g rebase main; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo
echo "=== R23 pull --rebase com commit local que o colega já enviou, mais um do colega"; mk; cd ..; rm -rf o.git c; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g branch -q -u origin/main; echo l > l.txt; g add .; g commit -qm local; cd ..; g clone -q o.git c; cd c; g fetch -q ../r main; g cherry-pick FETCH_HEAD >/dev/null; echo n > n.txt; g add .; g commit -qm colega; g push -q; cd ../r; rc g pull --rebase; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo; st; cd "$T"; rm -rf o.git c
echo "=== R24 pull --rebase: só o commit local já enviado, nada mais no remoto"; mk; cd ..; rm -rf o.git c; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g branch -q -u origin/main; echo l > l.txt; g add .; g commit -qm local; cd ..; g clone -q o.git c; cd c; g fetch -q ../r main; g cherry-pick FETCH_HEAD >/dev/null; g push -q; cd ../r; rc g pull --rebase; g log --oneline | cut -d' ' -f2 | tr '\n' ' '; echo; g rev-parse --short HEAD origin/main; cd "$T"; rm -rf o.git c
echo "=== R25 rebase em que o commit vazio é o do meio e o rebase para em conflito depois"; mk; g switch -qc f; echo igual > i.txt; g add .; g commit -qm igual-f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo igual > i.txt; g add .; g commit -qm igual-m; echo M > x.txt; g add .; g commit -qm M; g switch -q f; rc g rebase main; est; st
echo "=== A1 revert parado, arquivo com add e edição posterior, --abort"; mk; echo Z > b.txt; g add .; g commit -qm z; g revert --no-edit HEAD~1 >/dev/null 2>&1; st; echo R > b.txt; g add b.txt; echo R2 > b.txt; rc g revert --abort; est; st; cat b.txt
echo "=== A2 cherry-pick parado, arquivo com add e edição posterior, --abort"; xconf; g cherry-pick f >/dev/null 2>&1; echo R > x.txt; g add x.txt; echo R2 > x.txt; rc g cherry-pick --abort; est; st; cat x.txt
echo "=== A3 merge parado, outro arquivo com add e edição posterior, --abort"; mconf; g merge f >/dev/null 2>&1; echo R >> a.txt; g add a.txt; echo R2 >> a.txt; rc g merge --abort; est; st; tail -1 a.txt
echo "=== A4 merge parado, arquivo novo em staging e editado depois, --abort"; mconf; g merge f >/dev/null 2>&1; echo n > n.txt; g add n.txt; echo n2 > n.txt; rc g merge --abort; est; st; ls
echo "=== A5 merge parado, conflito resolvido com add e nada mais, --abort"; mconf; g merge f >/dev/null 2>&1; echo R > x.txt; g add x.txt; rc g merge --abort; est; st; cat x.txt
echo "=== A6 merge parado, arquivo em conflito editado sem add, --abort"; mconf; g merge f >/dev/null 2>&1; echo R > x.txt; rc g merge --abort; est; st; cat x.txt
echo "=== S25 switch com arquivo novo em staging idêntico ao destino"; fx; echo f > f.txt; g add f.txt; rc g switch f; st
echo "=== S26 switch com edição sem add idêntica ao destino"; xconf; echo F > x.txt; rc g switch f; st
echo "=== S27 switch com deleção em staging, e o destino também não tem o arquivo"; mk; g switch -qc f; g rm -q b.txt; g commit -qm tira; g switch -q main; g rm -q b.txt; rc g switch f; st; ls
echo "=== S28 switch com edição em staging idêntica ao destino"; xconf; echo F > x.txt; g add x.txt; rc g switch f; st
echo "=== S29 merge ff com deleção em staging, e o destino também não tem o arquivo"; mk; g switch -qc f; g rm -q b.txt; g commit -qm tira; g switch -q main; g rm -q b.txt; rc g merge f; st; ls
echo "=== S30 switch --detach para commit sem m.txt, com deleção de m.txt em staging e m.txt não rastreado na pasta"; mk; echo m > m.txt; g add .; g commit -qm m; g reset -q HEAD~1 m.txt; st; rc g switch --detach HEAD~1; st
echo "=== S31 merge ff com deleção em staging de arquivo igual nos dois lados, e o arquivo não rastreado na pasta"; mk; g switch -q --detach HEAD~1; g rm -q --cached a.txt; st; rc g merge main; st; g log --oneline -1 | cut -d' ' -f2; cat a.txt
echo "=== S31b igual, com switch main"; mk; g switch -qc f; g switch -q main; g rm -q --cached a.txt; rc g switch f; st
echo "=== S32 sequência do comparador: merge main em HEAD desanexado com f.txt apagado sem add"; cd "$T"; rm -rf r; mkdir r; cd r; g init -q; echo a > a.txt; echo x > x.txt; g add .; g commit -qm c0; echo b > b.txt; g add .; g commit -qm c1; g switch -qc f; echo F > x.txt; echo f > f.txt; g add .; g commit -qm c2; echo g > g.txt; g add .; g commit -qm c3; g switch -q main; echo m > m.txt; g add .; g commit -qm c4; g revert --no-edit HEAD~1 >/dev/null 2>&1; g add f.txt 2>/dev/null; g cherry-pick f~1 >/dev/null 2>&1; g switch -q --detach HEAD~1; echo v2 > x.txt; g add x.txt; rm f.txt; echo v2 > u.txt; g rebase f >/dev/null 2>&1; g commit -qm c44; st; rc g merge --no-edit main; st
echo "=== A7 merge parado, arquivo não relacionado editado sem add, --abort"; mconf; g merge f >/dev/null 2>&1; echo sujo >> a.txt; rc g merge --abort; est; st; tail -1 a.txt

# ---------- Ampliação da Etapa 1B4 ----------
# conflito em x.txt parado em cherry-pick, revert e rebase
cpconf() { xconf; g cherry-pick f >/dev/null 2>&1; }
rvconf() { mk; echo Z > x.txt; g add .; g commit -qm z; echo Z2 > x.txt; g add .; g commit -qm z2; g revert --no-edit HEAD~1 >/dev/null 2>&1; }
rbconf() { xconf; g switch -q f; g rebase main >/dev/null 2>&1; }
# f e main criam i.txt com o mesmo conteúdo em commits diferentes; estamos em main
noop() { mk; g switch -qc f; echo igual > i.txt; g add .; g commit -qm igual-f; g switch -q main; echo igual > i.txt; g add .; g commit -qm igual-m; }
# main tem um commit de merge de f
mrg() { mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo m > m.txt; g add .; g commit -qm m; g merge -q --no-edit f; }
# origin/nova existe, sem branch local; r tem o remoto configurado
rnova() { mk; cd ..; rm -rf o.git; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g fetch -q; g push -q origin main:nova; g fetch -q; }
pais() { g log -1 --format='%s pais=%p' | sed 's/^/   /'; }
hist() { g log --oneline | cut -d' ' -f2 | tr '\n' ' ' | sed 's/^/   hist: /'; echo; }

echo "=== N5a reset sem nada durante conflito de cherry-pick"; cpconf; est; rc g reset; est; st; grep -c '<<<<' x.txt
echo "=== N5b reset sem nada durante conflito de revert"; rvconf; est; rc g reset; est; st; grep -c '<<<<' x.txt
echo "=== N5c reset sem nada durante conflito de rebase, depois --continue"; rbconf; est; rc g reset; est; st; grep -c '<<<<' x.txt; rc g rebase --continue; est; st; hist
echo "=== N5d reset HEAD durante conflito de merge"; mconf; g merge f >/dev/null 2>&1; rc g reset HEAD; est; st
echo "=== N5e reset --soft durante conflito de merge"; mconf; g merge f >/dev/null 2>&1; rc g reset --soft; est; st
echo "=== N5f reset HEAD~1 durante conflito de merge"; mconf; g merge f >/dev/null 2>&1; rc g reset HEAD~1; est; st; hist
echo "=== N5g reset sem nada durante merge parado, conflito já resolvido com add"; mconf; g merge f >/dev/null 2>&1; echo R > x.txt; g add x.txt; rc g reset; est; st; cat x.txt
echo "=== N5h reset sem nada durante merge, com arquivo não relacionado em staging"; mconf; g merge f >/dev/null 2>&1; echo s >> a.txt; g add a.txt; rc g reset; est; st
echo "=== N5i reset sem nada com conflito e edição sem add no arquivo em conflito"; mconf; g merge f >/dev/null 2>&1; echo R > x.txt; rc g reset; est; st; cat x.txt
echo "=== N5j commit depois do reset durante conflito: vira commit comum?"; mconf; g merge f >/dev/null 2>&1; g reset -q; echo R > x.txt; g add x.txt; rc g commit -qm fim; pais
echo "=== N5k reset sem nada durante merge, sem conflito (merge --no-commit)"; mk; g switch -qc f; echo f > f.txt; g add .; g commit -qm f; g switch -q main; echo m > m.txt; g add .; g commit -qm m; g merge --no-commit f >/dev/null 2>&1; est; rc g reset; est; st; ls

echo "=== N5l reset --soft durante conflito de cherry-pick, de revert e de rebase"; cpconf; rc g reset --soft; est; rvconf; rc g reset --soft; est; rbconf; rc g reset --soft; est
echo "=== N5m reset --hard HEAD~1 e reset HEAD~1 durante rebase parado, depois --continue"; conf; g rebase main >/dev/null 2>&1; rc g reset --hard HEAD~1; est; rc g rebase --continue; est; hist; conf; g rebase main >/dev/null 2>&1; rc g reset HEAD~1; est; st; g add x.txt; rc g rebase --continue; est; hist
echo "=== N5n reset --soft durante cherry-pick vazio (sem conflito)"; noop; g cherry-pick f >/dev/null 2>&1; rc g reset --soft; est

echo "=== N6a diff durante conflito de merge, um arquivo"; xconf; g merge f >/dev/null 2>&1; rc g diff; rc g diff --staged; rc g diff HEAD; rc g diff HEAD~1
echo "=== N6b diff durante conflito, dois arquivos"; mconf; g merge f >/dev/null 2>&1; st; rc g diff; rc g diff --staged; rc g diff HEAD
echo "=== N6c diff durante conflito, com staging em outro arquivo e edição sem add em um terceiro"; mconf; g merge f >/dev/null 2>&1; echo s >> a.txt; g add a.txt; echo t >> b.txt; rc g diff; rc g diff --staged; rc g diff HEAD
echo "=== N6d diff depois de editar o arquivo em conflito sem add"; xconf; g merge f >/dev/null 2>&1; echo R > x.txt; rc g diff; rc g diff --staged; rc g diff HEAD
echo "=== N6e diff depois do add que resolve"; xconf; g merge f >/dev/null 2>&1; echo R > x.txt; g add x.txt; rc g diff; rc g diff --staged; rc g diff HEAD
echo "=== N6f diff em conflito de cherry-pick, revert e rebase"; cpconf; rc g diff; rvconf; rc g diff; rbconf; rc g diff; rc g diff HEAD
echo "=== N6g diff em conflito modify/delete"; mk; g switch -qc f; g rm -q b.txt; g commit -qm tira; g switch -q main; echo B > b.txt; g add .; g commit -qm B; g merge f >/dev/null 2>&1; st; rc g diff; rc g diff --staged; rc g diff HEAD
echo "=== N6h diff com arquivo durante conflito"; xconf; g merge f >/dev/null 2>&1; rc g diff x.txt; rc g diff -- x.txt; rc g diff --staged x.txt; rc g diff HEAD x.txt; rc g diff a.txt
echo "=== N6i diff com marcadores parcialmente editados (uma linha a mais)"; xconf; g merge f >/dev/null 2>&1; echo extra >> x.txt; rc g diff
echo "=== N6j diff HEAD~1 HEAD durante conflito (duas referências ignoram o conflito?)"; xconf; g merge f >/dev/null 2>&1; rc g diff HEAD~1 HEAD

echo "=== N8a cherry-pick sem efeito: mudança já presente"; noop; rc g cherry-pick f; est; st; hist; g status | sed -n 1,8p | sed 's/^/   /'
echo "--- N8a2 git commit durante"; rc g commit -m x; est; hist
echo "--- N8a3 cherry-pick --continue durante"; noop; g cherry-pick f >/dev/null 2>&1; rc g cherry-pick --continue; est
echo "--- N8a4 cherry-pick --skip durante"; rc g cherry-pick --skip; est; st; hist
echo "--- N8a5 cherry-pick --abort durante"; noop; g cherry-pick f >/dev/null 2>&1; rc g cherry-pick --abort; est; st; hist
echo "--- N8a6 reset durante"; noop; g cherry-pick f >/dev/null 2>&1; rc g reset; est; st
echo "--- N8a7 outro cherry-pick durante"; noop; g cherry-pick f >/dev/null 2>&1; rc g cherry-pick HEAD~1; est
echo "--- N8a8 switch durante"; noop; g cherry-pick f >/dev/null 2>&1; rc g switch f; est; rc g switch -c nova; est
echo "--- N8a9 merge e rebase durante"; noop; g cherry-pick f >/dev/null 2>&1; rc g merge f; est; rc g rebase f; est
echo "--- N8a10 commit --allow-empty durante"; noop; g cherry-pick f >/dev/null 2>&1; rc g commit --allow-empty -m vazio; est; hist; pais
echo "=== N8b cherry-pick HEAD"; mk; rc g cherry-pick HEAD; est; st
echo "=== N8c cherry-pick de commit que só em parte já está presente"; mk; g switch -qc f; echo igual > i.txt; echo p > p.txt; g add .; g commit -qm ip; g switch -q main; echo igual > i.txt; g add .; g commit -qm igual-m; rc g cherry-pick f; est; st; hist
echo "=== N8d revert sem efeito"; mk; echo F > x.txt; g add .; g commit -qm F; echo x > x.txt; g add .; g commit -qm volta; rc g revert --no-edit HEAD~1; est; st; hist; g status | sed -n 1,8p | sed 's/^/   /'
echo "--- N8d2 revert --continue e --skip durante"; rc g revert --continue; est; rc g revert --skip; est; st; hist
echo "--- N8d3 revert --abort durante"; mk; echo F > x.txt; g add .; g commit -qm F; echo x > x.txt; g add .; g commit -qm volta; g revert --no-edit HEAD~1 >/dev/null 2>&1; rc g revert --abort; est; st
echo "=== N8e cherry-pick que fica vazio depois de resolver o conflito"; cpconf; echo M > x.txt; g add x.txt; st; rc g commit -m x; est; st; rc g cherry-pick --continue; est; st; hist
echo "--- N8e2 igual, com --skip"; cpconf; echo M > x.txt; g add x.txt; rc g cherry-pick --skip; est; st; hist
echo "=== N8f revert que fica vazio depois de resolver o conflito"; rvconf; echo Z2 > x.txt; g add x.txt; rc g commit -m x; est; rc g revert --continue; est; st; hist
echo "=== N8g cherry-pick sem efeito com não rastreado que colide: qual erro vem primeiro?"; noop; g switch -qc g HEAD~1; echo outro > i.txt; g switch -q main; g switch -q g; rc g cherry-pick f; est; st
echo "=== N8h cherry-pick sem efeito, depois merge --abort e revert --abort (errados)"; noop; g cherry-pick f >/dev/null 2>&1; rc g merge --abort; rc g revert --abort; est

echo "=== N8i revert e cherry-pick com efeito durante um cherry-pick vazio"; noop; g cherry-pick f >/dev/null 2>&1; rc g revert --no-edit HEAD; est; hist; noop; g switch -qc h HEAD~1; echo h > h.txt; g add .; g commit -qm h; g switch -q main; g cherry-pick f >/dev/null 2>&1; rc g cherry-pick h; est; hist
echo "=== N8j revert --abort e cherry-pick --abort trocados, com conflito e sem"; cpconf; rc g revert --abort; est; st; rvconf; rc g cherry-pick --abort; est; st
echo "=== N8k reset --soft durante revert parado com conflito resolvido (sem conflito pendente)"; rvconf; echo R > x.txt; g add x.txt; rc g reset --soft; est; st
echo "=== N8l revert e cherry-pick durante cherry-pick parado com conflito resolvido, sem commit"; cpconf; echo R > x.txt; g add x.txt; rc g revert --no-edit HEAD; est; st; hist

echo "=== N9a cherry-pick de commit de merge"; mrg; g switch -qc outra HEAD~2; rc g cherry-pick main; est; st; hist
echo "=== N9b revert de commit de merge"; mrg; rc g revert --no-edit HEAD; est; st; hist
echo "=== N9c cherry-pick -m 1 e revert -m 1 continuam valendo"; mrg; g switch -qc outra HEAD~2; rc g cherry-pick -m 1 main; hist; g switch -q main; rc g revert --no-edit -m 1 HEAD; hist
echo "=== N9d cherry-pick de merge com alteração local: qual erro vem primeiro?"; mrg; g switch -qc outra HEAD~2; echo s >> a.txt; rc g cherry-pick main; est; st
echo "=== N9e revert de merge com alteração local"; mrg; echo s >> a.txt; rc g revert --no-edit HEAD; est; st
echo "=== N9f cherry-pick de merge durante outro cherry-pick parado"; mrg; g switch -qc outra HEAD~2; echo X > x.txt; g add .; g commit -qm X; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g cherry-pick outra >/dev/null 2>&1; rc g cherry-pick HEAD~1; est
echo "=== N9g cherry-pick de merge com hash inexistente antes"; mrg; rc g cherry-pick 0000abcd

echo "=== N10a checkout nome com branch só no remoto"; rnova; rc g checkout nova; g status | sed -n 1,2p | sed 's/^/   /'; g branch -vv | sed 's/^/   /'; cd "$T"; rm -rf o.git
echo "=== N10b switch nome com branch local e remota em pontos diferentes: vale a local"; rnova; g branch -q nova HEAD~1; rc g switch nova; g rev-parse --short HEAD nova origin/nova | tr '\n' ' '; echo; g status | sed -n 1,2p | sed 's/^/   /'; cd "$T"; rm -rf o.git
echo "=== N10c switch nome com a branch no remoto, mas sem fetch"; mk; cd ..; rm -rf o.git; g clone -q --bare r o.git; cd r; g remote add origin ../o.git; g push -q origin main:nova; g branch -r | sed 's/^/   /'; rc g switch nova; cd "$T"; rm -rf o.git
echo "=== N10d switch nome só no remoto, com alteração local que o destino muda"; rnova; g switch -qc tmp; echo N > x.txt; g add .; g commit -qm N; g push -q origin tmp:nova; g switch -q main; g branch -qD tmp; g fetch -q; echo y >> x.txt; rc g switch nova; g branch | sed 's/^/   /'; st; cd "$T"; rm -rf o.git
echo "=== N10e switch nome só no remoto, com alteração local não relacionada"; rnova; echo y >> a.txt; rc g switch nova; st; cd "$T"; rm -rf o.git
echo "=== N10f switch -c nome quando origin/nome existe"; rnova; g switch -q --detach HEAD~1; rc g switch -c nova; g status | sed -n 1,2p | sed 's/^/   /'; g rev-parse --short HEAD origin/nova | tr '\n' ' '; echo; cd "$T"; rm -rf o.git
echo "=== N10g depois do switch nova: commit e push sem -u"; rnova; g switch -q nova; echo n > n.txt; g add .; g commit -qm n; g status | sed -n 1,2p | sed 's/^/   /'; rc g push; g status | sed -n 1,2p | sed 's/^/   /'; cd "$T"; rm -rf o.git
echo "=== N10h switch nova durante merge parado"; rnova; g switch -qc f; echo F > x.txt; g add .; g commit -qm F; g switch -q main; echo M > x.txt; g add .; g commit -qm M; g merge f >/dev/null 2>&1; rc g switch nova; est; g branch | sed 's/^/   /'; cd "$T"; rm -rf o.git
echo "=== N10i switch --detach nova e switch origin/nova"; rnova; rc g switch --detach nova; g status | sed -n 1p | sed 's/^/   /'; g switch -q main; rc g switch origin/nova; cd "$T"; rm -rf o.git
echo "=== N10j switch nova com não rastreado que colide com o destino"; rnova; g switch -qc tmp; echo n > n.txt; g add .; g commit -qm n; g push -q origin tmp:nova; g switch -q main; g branch -qD tmp; g fetch -q; echo outro > n.txt; rc g switch nova; g branch | sed 's/^/   /'; cd "$T"; rm -rf o.git
echo "=== N10k log e branch depois do switch nova"; rnova; g switch -q nova; g log --oneline -1 --decorate | sed 's/^/   /'; g branch -a | sed 's/^/   /'; cd "$T"; rm -rf o.git
echo "=== N10l switch nome só no remoto quando o nome também é arquivo"; rnova; echo z > nova; rc g switch nova; rm nova; cd "$T"; rm -rf o.git
echo "=== N10m checkout nome só no remoto quando o nome também é arquivo"; rnova; echo z > nova; g add nova; g commit -qm arq; rc g checkout nova; g status | sed -n 1p | sed 's/^/   /'; cd "$T"; rm -rf o.git

echo "=== N11a switch para a branch atual com alteração local"; mk; echo y >> a.txt; rc g switch main; st
echo "=== N11b checkout para a branch atual"; mk; rc g checkout main; echo y >> a.txt; rc g checkout main; st
echo "=== N11c switch para a branch atual durante merge parado"; mconf; g merge f >/dev/null 2>&1; rc g switch main; est; st
echo "=== N11d switch para a branch do rebase durante rebase parado"; rbconf; rc g switch f; est; rc g switch main; est
echo "=== N11e checkout -f e switch -f para a branch atual com alteração local"; mk; echo y >> a.txt; rc g checkout -f main; st; echo y >> a.txt; rc g switch -f main; st
echo "=== N11f switch main com HEAD desanexado no mesmo commit"; mk; g switch -q --detach main; rc g switch main; g status | sed -n 1p | sed 's/^/   /'
echo "=== N11g switch -c para branch que já existe"; mk; rc g switch -c main; rc g switch -c f; rc g switch -c f
echo "=== N11h switch para a branch atual com HEAD desanexado e alteração local"; mk; g switch -q --detach HEAD~1; echo y >> a.txt; rc g switch main; st
echo "=== N11i switch para a branch atual durante cherry-pick parado"; cpconf; rc g switch main; est
