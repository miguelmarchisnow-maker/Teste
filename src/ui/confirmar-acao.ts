import { getConfig } from '../core/config';
import { confirmar } from './confirm-dialog';
import { t } from '../core/i18n/t';

/**
 * Executa `onConfirm` se o usuário confirmar via modal custom (ou direto
 * se a config `confirmarDestrutivo` estiver desabilitada).
 */
export function confirmarAcao(msg: string, onConfirm: () => void): void {
  if (!getConfig().gameplay.confirmarDestrutivo) {
    onConfirm();
    return;
  }
  void confirmar({
    title: t('confirm.confirmar'),
    message: msg,
    confirmLabel: t('confirmar.sim'),
    cancelLabel: t('confirm.cancelar'),
    danger: true,
  }).then((ok) => {
    if (ok) onConfirm();
  });
}
