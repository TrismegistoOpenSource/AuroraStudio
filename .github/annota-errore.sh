#!/usr/bin/env bash
# Rilancia la coda di un log come annotazione di errore della Action.
#
# Perché serve: i log dei job si scaricano solo con permessi di admin sul repo
# (l'API risponde 403 a chiunque altro), mentre le annotazioni sono pubbliche e
# leggibili via API. Senza questo, una build rossa dice solo "exit code 1" e per
# capire cosa sia successo bisogna aprire la pagina web a mano.
#
# Uso: bash .github/annota-errore.sh <file-di-log> "<titolo>"
set -uo pipefail

log="${1:?serve il file di log}"
titolo="${2:-Comando fallito}"

[ -f "$log" ] || { echo "::error title=$titolo::log assente: $log"; exit 0; }

# Le annotazioni sono su una riga sola: i newline vanno codificati come %0A
# (e i '%' letterali come %25, altrimenti mangiano la codifica).
python3 - "$log" "$titolo" <<'PY'
import pathlib, sys

log, titolo = sys.argv[1], sys.argv[2]
testo = pathlib.Path(log).read_text(errors="replace")[-3000:]
testo = testo.replace("%", "%25").replace("\r", "").replace("\n", "%0A")
print(f"::error title={titolo}::{testo}")
PY
