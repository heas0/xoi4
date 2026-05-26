/**
 * Интерфейс наблюдателя (Observer Pattern)
 */
export interface IObserver<T = unknown> {
  update(event: string, data?: T): void;
}

/**
 * Интерфейс субъекта наблюдения (Observable)
 */
export interface IObservable<T = unknown> {
  subscribe(observer: IObserver<T>): void;
  unsubscribe(observer: IObserver<T>): void;
  notify(event: string, data?: T): void;
}
