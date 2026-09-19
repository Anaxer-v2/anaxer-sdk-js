export interface PageWindow {
  from: number;
  to: number;
}

export interface PageEnvelope<T> {
  data: T[];
  next: string | null;
  window: PageWindow;
}

/**
 * First-page REST list result that is also an async iterable walking `next`
 * on the **same** endpoint until null (doc 22 decision 11).
 */
export class Page<T> implements AsyncIterable<T> {
  readonly data: T[];
  readonly next: string | null;
  readonly window: PageWindow;

  constructor(
    envelope: PageEnvelope<T>,
    private readonly fetchNext: (cursor: string) => Promise<PageEnvelope<T>>,
  ) {
    this.data = envelope.data;
    this.next = envelope.next;
    this.window = envelope.window;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    yield* this.data;
    let cursor = this.next;
    while (cursor) {
      const page = await this.fetchNext(cursor);
      yield* page.data;
      cursor = page.next;
    }
  }
}
