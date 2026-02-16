/**
 * Tracing utilities — 関数レベルのスパン生成とエラー追跡。
 *
 * すべての重要な関数呼び出しを OTel スパンでラップし、
 * エラー時にはスタックトレース付きの例外イベントを記録する。
 */
import { trace, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api';

const tracer = trace.getTracer('battle-tetris-server');

/**
 * 同期関数をスパンでラップして実行する。
 * エラー時はスタックトレース付きで例外を記録する。
 */
export function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => T,
): T {
  return tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes: attrs }, (span) => {
    try {
      const result = fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (err) {
      recordError(span, err);
      span.end();
      throw err;
    }
  });
}

/**
 * 非同期関数をスパンでラップして実行する。
 */
export async function withAsyncSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes: attrs }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (err) {
      recordError(span, err);
      span.end();
      throw err;
    }
  });
}

/**
 * スパンにエラーを記録する。スタックトレース・エラーメッセージ・型を含む。
 */
export function recordError(span: Span, err: unknown): void {
  const error = err instanceof Error ? err : new Error(String(err));
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  span.recordException(error);
  span.setAttribute('error.type', error.constructor.name);
  span.setAttribute('error.message', error.message);
  if (error.stack) {
    span.setAttribute('error.stack', error.stack);
  }
}

/**
 * 現在のアクティブスパンにイベントを追加する。
 */
export function addSpanEvent(
  name: string,
  attrs?: Record<string, string | number | boolean>,
): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attrs);
  }
}

export { tracer };
