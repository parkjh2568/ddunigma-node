/**
 * 인코딩/디코딩 연산을 워커 스레드로 오프로드하는 워커 풀 관리자.
 *
 * Node.js Worker Threads와 Web Workers를 모두 지원합니다.
 * 라운드 로빈 태스크 분배와 지연 초기화를 사용합니다.
 *
 * @module workers/WorkerPool
 */

import type { WorkerPool as IWorkerPool, EncoderConfig } from "../core/types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_POOL_SIZE = 1;
const MAX_POOL_SIZE = 64;

// ─── 워커 메시지 타입 ────────────────────────────────────────────────────────

export interface WorkerRequest {
  id: number;
  type: "encode" | "decode";
  data: Uint8Array | string;
  config: EncoderConfig;
}

export interface WorkerResponse {
  id: number;
  type: "result" | "error";
  result?: string | Uint8Array;
  error?: string;
}

// ─── 대기 중인 태스크 ────────────────────────────────────────────────────────

interface PendingTask {
  resolve: (value: string | Uint8Array) => void;
  reject: (reason: Error) => void;
}

// ─── 추상 워커 래퍼 ──────────────────────────────────────────────────────────

interface WorkerHandle {
  postMessage(message: WorkerRequest): void;
  terminate(): Promise<void>;
  onMessage(handler: (message: WorkerResponse) => void): void;
  onError(handler: (error: Error) => void): void;
}

// ─── 기본 풀 크기 ────────────────────────────────────────────────────────────

/**
 * 사용 가능한 CPU 코어 수에 기반하여 기본 풀 크기를 계산합니다.
 * CPU 코어 - 1을 반환하며, [1, 64] 범위로 클램핑됩니다.
 */
function getDefaultPoolSize(): number {
  let cpuCount = 1;

  // 브라우저: navigator.hardwareConcurrency
  if (typeof globalThis.navigator !== "undefined" && globalThis.navigator.hardwareConcurrency) {
    cpuCount = globalThis.navigator.hardwareConcurrency;
  }
  // Node.js: 동기적으로 CPU 수를 가져올 수 없으므로 합리적 기본값 사용.
  // 실제 CPU 수는 비동기 초기화 시 업데이트 가능.
  else if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    // availableParallelism은 Node.js 19.4+/20+ 에서 사용 가능
    if (typeof (globalThis.process as any).availableParallelism === "function") {
      cpuCount = (globalThis.process as any).availableParallelism();
    } else {
      // 보수적 기본값: 대부분의 환경에서 4코어 이상
      cpuCount = 4;
    }
  }

  return Math.max(MIN_POOL_SIZE, Math.min(MAX_POOL_SIZE, cpuCount - 1));
}

// ─── Node.js 워커 핸들 ───────────────────────────────────────────────────────

function createNodeWorkerHandle(): WorkerHandle | null {
  try {
    // Node.js worker_threads는 동기 생성이 필요하므로 require 사용.
    // ESM 환경에서도 Node.js 내장 모듈의 require는 동작합니다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Worker } = require("worker_threads");
    const workerPath = new URL("./nodeWorker.js", import.meta.url).pathname;

    const worker = new Worker(workerPath);

    return {
      postMessage(message: WorkerRequest) {
        worker.postMessage(message);
      },
      async terminate() {
        await worker.terminate();
      },
      onMessage(handler: (message: WorkerResponse) => void) {
        worker.on("message", handler);
      },
      onError(handler: (error: Error) => void) {
        worker.on("error", handler);
      },
    };
  } catch {
    return null;
  }
}

// ─── Web 워커 핸들 ───────────────────────────────────────────────────────────

function createWebWorkerHandle(): WorkerHandle | null {
  try {
    if (typeof globalThis.Worker === "undefined") return null;

    const workerUrl = new URL("./webWorker.js", import.meta.url);
    const worker = new globalThis.Worker(workerUrl, { type: "module" });

    return {
      postMessage(message: WorkerRequest) {
        worker.postMessage(message);
      },
      async terminate() {
        worker.terminate();
      },
      onMessage(handler: (message: WorkerResponse) => void) {
        worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
          handler(event.data);
        });
      },
      onError(handler: (error: Error) => void) {
        worker.addEventListener("error", (event: ErrorEvent) => {
          handler(new Error(event.message || "Worker error"));
        });
      },
    };
  } catch {
    return null;
  }
}

// ─── 워커 풀 구현 ────────────────────────────────────────────────────────────

export class WorkerPoolImpl implements IWorkerPool {
  private poolSize: number;
  private workers: WorkerHandle[] = [];
  private pendingTasks: Map<number, PendingTask> = new Map();
  private nextTaskId = 0;
  private roundRobinIndex = 0;
  private initialized = false;
  private terminated = false;

  constructor(poolSize?: number) {
    this.poolSize = poolSize ?? getDefaultPoolSize();
  }

  /**
   * 워커 스레드를 사용하여 인코딩합니다.
   */
  async encode(input: Uint8Array, config: EncoderConfig): Promise<string> {
    const result = await this.dispatch("encode", input, config);
    return result as string;
  }

  /**
   * 워커 스레드를 사용하여 디코딩합니다.
   */
  async decode(input: string, config: EncoderConfig): Promise<Uint8Array> {
    const result = await this.dispatch("decode", input, config);
    return result as Uint8Array;
  }

  /**
   * 풀의 워커 스레드 수를 설정합니다.
   * n이 [1, 64] 범위의 정수인지 검증합니다.
   *
   * @throws n이 정수가 아니거나 [1, 64] 범위를 벗어난 경우 에러
   */
  setPoolSize(n: number): void {
    if (!Number.isInteger(n)) {
      throw new Error(
        `[WorkerPool] Pool size must be an integer. Got: ${n}. Valid range: [${MIN_POOL_SIZE}, ${MAX_POOL_SIZE}]`,
      );
    }
    if (n < MIN_POOL_SIZE || n > MAX_POOL_SIZE) {
      throw new Error(
        `[WorkerPool] Pool size must be between ${MIN_POOL_SIZE} and ${MAX_POOL_SIZE}. Got: ${n}`,
      );
    }

    const oldSize = this.poolSize;
    this.poolSize = n;

    // 이미 초기화되었고 크기가 변경되었으면 다음 사용 시 재초기화
    if (this.initialized && oldSize !== n) {
      this.terminateWorkers();
      this.initialized = false;
    }
  }

  /**
   * 모든 워커 스레드를 종료하고 리소스를 정리합니다.
   */
  async terminate(): Promise<void> {
    this.terminated = true;
    await this.terminateWorkers();

    // 모든 대기 중인 태스크를 reject
    for (const [, task] of this.pendingTasks) {
      task.reject(new Error("[WorkerPool] Pool terminated"));
    }
    this.pendingTasks.clear();
  }

  // ─── 비공개 메서드 ───────────────────────────────────────────────────────

  /**
   * 라운드 로빈 분배를 사용하여 워커에 태스크를 디스패치합니다.
   */
  private async dispatch(
    type: "encode" | "decode",
    data: Uint8Array | string,
    config: EncoderConfig,
  ): Promise<string | Uint8Array> {
    if (this.terminated) {
      throw new Error("[WorkerPool] Pool has been terminated");
    }

    this.ensureInitialized();

    if (this.workers.length === 0) {
      throw new Error(
        "[WorkerPool] No workers available. Workers may not be supported in this runtime.",
      );
    }

    const taskId = this.nextTaskId++;
    const workerIndex = this.roundRobinIndex % this.workers.length;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.workers.length;

    const worker = this.workers[workerIndex];

    return new Promise<string | Uint8Array>((resolve, reject) => {
      this.pendingTasks.set(taskId, { resolve, reject });

      const request: WorkerRequest = {
        id: taskId,
        type,
        data,
        config,
      };

      worker.postMessage(request);
    });
  }

  /**
   * 첫 사용 시 워커를 지연 초기화합니다.
   */
  private ensureInitialized(): void {
    if (this.initialized) return;

    const isNode = typeof globalThis.process !== "undefined" && !!globalThis.process.versions?.node;

    for (let i = 0; i < this.poolSize; i++) {
      const handle = isNode ? createNodeWorkerHandle() : createWebWorkerHandle();
      if (!handle) break;

      handle.onMessage((message: WorkerResponse) => {
        const task = this.pendingTasks.get(message.id);
        if (!task) return;

        this.pendingTasks.delete(message.id);

        if (message.type === "error") {
          task.reject(new Error(message.error ?? "Worker error"));
        } else {
          task.resolve(message.result!);
        }
      });

      handle.onError((error: Error) => {
        // 워커 에러 시 해당 워커의 모든 대기 태스크를 reject
        // 더 정교한 구현에서는 어떤 태스크가 어떤 워커에 할당되었는지 추적
        console.error("[WorkerPool] Worker error:", error.message);
      });

      this.workers.push(handle);
    }

    this.initialized = true;
  }

  /**
   * 현재 모든 워커를 종료합니다.
   */
  private async terminateWorkers(): Promise<void> {
    const terminatePromises = this.workers.map((w) => w.terminate());
    await Promise.all(terminatePromises);
    this.workers = [];
  }
}

// ─── 싱글톤 풀 인스턴스 ──────────────────────────────────────────────────────

let globalPool: WorkerPoolImpl | null = null;

/**
 * 전역 워커 풀 인스턴스를 가져오거나 생성합니다.
 */
export function getWorkerPool(): WorkerPoolImpl {
  if (!globalPool) {
    globalPool = new WorkerPoolImpl();
  }
  return globalPool;
}

/**
 * 전역 워커 풀 크기를 설정합니다.
 * `Ddu64.setWorkerPoolSize(n)`을 통해 노출되는 함수입니다.
 *
 * @param n - 워커 수 (정수, 1–64)
 * @throws n이 정수가 아니거나 범위를 벗어난 경우 에러
 */
export function setWorkerPoolSize(n: number): void {
  getWorkerPool().setPoolSize(n);
}
