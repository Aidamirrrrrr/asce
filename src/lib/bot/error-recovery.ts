/**
 * Планировщик авто-восстановления упавших ботов с экспоненциальным backoff.
 *
 * Чистое, без побочных эффектов — чтобы можно было тестировать без БД и таймеров.
 * Защищает от «тесного» цикла ретраев: после неудачи следующая попытка
 * откладывается всё дальше, а после maxAttempts восстановление прекращается
 * (до явного успеха, который сбрасывает счётчик).
 */
export type RecoveryState = { attempts: number; nextAttemptAt: number };

export class RuntimeRecoveryScheduler {
  private readonly state = new Map<string, RecoveryState>();

  constructor(
    private readonly baseMs = 60_000,
    private readonly maxMs = 30 * 60_000,
    private readonly maxAttempts = 6,
  ) {}

  /** Пора ли пытаться восстановить проект (учёт backoff и лимита попыток). */
  shouldAttempt(projectId: string, now: number): boolean {
    const current = this.state.get(projectId);
    if (!current) {
      return true;
    }
    if (current.attempts >= this.maxAttempts) {
      return false;
    }
    return now >= current.nextAttemptAt;
  }

  /** Зафиксировать попытку восстановления и отодвинуть следующую. */
  recordAttempt(projectId: string, now: number): void {
    const current = this.state.get(projectId) ?? { attempts: 0, nextAttemptAt: 0 };
    const attempts = current.attempts + 1;
    const delay = Math.min(this.baseMs * 2 ** (attempts - 1), this.maxMs);
    this.state.set(projectId, { attempts, nextAttemptAt: now + delay });
  }

  /** Проект ожил — сбросить счётчик, чтобы будущие сбои ретраились с нуля. */
  recordSuccess(projectId: string): void {
    this.state.delete(projectId);
  }

  /** Отслеживаемые сейчас проекты (для очистки тех, что больше не в ошибке). */
  trackedIds(): string[] {
    return [...this.state.keys()];
  }

  /** Исчерпан ли лимит попыток (бот «сдан» до вмешательства пользователя). */
  isExhausted(projectId: string): boolean {
    const current = this.state.get(projectId);
    return current ? current.attempts >= this.maxAttempts : false;
  }
}
