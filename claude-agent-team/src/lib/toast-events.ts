/**
 * 전역 토스트 이벤트 버스
 * Context/props 없이 앱 어디서든 showErrorToast(msg) 호출 가능
 * ToastProvider가 subscribeToast()로 구독하여 렌더링
 */

type ToastListener = (msg: string) => void;

const listeners = new Set<ToastListener>();

/** 에러 토스트 표시 요청 (ToastProvider가 수신) */
export function showErrorToast(msg: string): void {
  listeners.forEach((fn) => fn(msg));
}

/** ToastProvider 내부에서 구독 등록 — 반환값으로 구독 해제 가능 */
export function subscribeToast(fn: ToastListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
