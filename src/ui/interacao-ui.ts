let houveInteracaoUi = false;

export function marcarInteracaoUi(): void {
  houveInteracaoUi = true;
}

export function consumirInteracaoUi(): boolean {
  if (!houveInteracaoUi) return false;
  houveInteracaoUi = false;
  return true;
}
