import { IObserver, IObservable } from '../interfaces/IObserver';

/**
 * Базовый класс для реализации паттерна Observer
 */
export abstract class Observable<T = unknown> implements IObservable<T> {
  private observers: Set<IObserver<T>> = new Set();

  subscribe(observer: IObserver<T>): void {
    this.observers.add(observer);
  }

  unsubscribe(observer: IObserver<T>): void {
    this.observers.delete(observer);
  }

  notify(event: string, data?: T): void {
    for (const observer of this.observers) {
      observer.update(event, data);
    }
  }
}
