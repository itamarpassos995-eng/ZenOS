// O listener realtime acompanha todos os recibos da janela; não reabrir
// a consulta em toda operação. Uma lacuna permanece bloqueada por V2Session.apply.
export const V2_TAIL_WINDOW_SIZE = 100;

export function shouldRearmV2Tail(snapshotSize, capturedSequence, latestSequence) {
  return Number.isInteger(snapshotSize)
    && snapshotSize >= V2_TAIL_WINDOW_SIZE
    && Number.isFinite(capturedSequence)
    && Number.isFinite(latestSequence)
    && latestSequence >= capturedSequence + V2_TAIL_WINDOW_SIZE;
}
