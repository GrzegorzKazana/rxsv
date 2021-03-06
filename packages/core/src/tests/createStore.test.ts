import { Observable, Subject } from 'rxjs';
import { ignoreElements, mapTo } from 'rxjs/operators';
import { TestScheduler } from 'rxjs/testing';

import { createStore } from '../creators/createStore';
import { Reducer, Effect, Action } from '../types';
import { ofType } from '../operators';
import { awaitNMockCalls } from './_utils';

/* eslint-disable @typescript-eslint/no-unused-vars */

const initialState = { init: true };
type MockState = typeof initialState;

const someAction = { type: 'TEST' };
const initAction = { type: '@@INIT' };
const initStateAction = { type: '@@INIT/state' };

const reducer: Reducer<Action, MockState> = (state = initialState) => state;
const effect: Effect<Action, MockState> = action$ => action$.pipe(ignoreElements());

const scheduler = new TestScheduler((actual, expected) => expect(actual).toEqual(expected));

describe('createStore', () => {
    describe('initialization', () => {
        it('should create action$ and state$ streams', () => {
            const store = createStore(reducer, effect);

            expect(store).toBeDefined();
            expect(typeof store).toBe('object');
            expect(store.action$ instanceof Observable).toBe(true);
            expect(store.state$ instanceof Observable).toBe(true);
        });

        it('should emit @@INIT action after subscribing', () => {
            scheduler.run(({ expectObservable }) => {
                const { action$ } = createStore(reducer, effect);
                const expected$ = 'a';

                expectObservable(action$).toBe(expected$, {
                    a: initAction,
                });
            });
        });

        it('should not create effects pipeline if no effects are provided', () => {
            const spy = jest.spyOn(Subject.prototype, 'next');

            createStore(reducer, effect);
            createStore(reducer);

            expect(spy).toHaveBeenCalledTimes(1);

            spy.mockRestore();
        });
    });

    describe('reducers', () => {
        // eslint-disable-next-line functional/no-let
        let reducerMock: jest.Mock;

        beforeEach(() => {
            reducerMock = jest.fn((state = initialState, _action) => state);
        });

        it('should initialize state', () => {
            scheduler.run(({ expectObservable }) => {
                const { state$ } = createStore(reducerMock, effect);
                const expected$ = 'a';

                expectObservable(state$).toBe(expected$, {
                    a: initialState,
                });
            });
        });

        it('should call reducer on each action', () => {
            const { action$, state$ } = createStore(reducerMock, effect);

            state$.subscribe();

            action$.next(someAction);

            // init action + first subscription + someAction
            expect(reducerMock).toBeCalledTimes(3);
            expect(reducerMock).toHaveBeenNthCalledWith(3, initialState, someAction);
        });

        it('should not recalculate state for each subscriber', () => {
            const { state$ } = createStore(reducerMock, effect);

            state$.subscribe();
            state$.subscribe();
            state$.subscribe();

            // init action + first subscription
            expect(reducerMock).toBeCalledTimes(2);
            expect(reducerMock).toHaveBeenNthCalledWith(1, void 0, initStateAction);
            expect(reducerMock).toHaveBeenNthCalledWith(2, initialState, initAction);
        });
    });

    describe('effects', () => {
        it('should set up effects pipeline', () => {
            const effectMock = jest.fn(effect);

            const { action$, state$ } = createStore(reducer, effectMock);

            expect(effectMock).toBeCalledTimes(1);
            expect(effectMock).toHaveBeenCalledWith(action$, state$);
        });

        it('should send actions back to the action$ stream', async () => {
            const someOtherAction = { type: 'Other' };
            const someEffect: Effect<Action, {}> = action$ =>
                action$.pipe(ofType(someOtherAction.type), mapTo(someAction));
            const reducerMock = jest.fn((state = initialState, _action) => state);

            const store = createStore(reducerMock, someEffect);

            store.state$.subscribe();
            store.action$.next(someOtherAction);

            await awaitNMockCalls(reducerMock, 4);

            expect(reducerMock).toBeCalledTimes(4);
            expect(reducerMock).toHaveBeenLastCalledWith(initialState, someAction);
        });

        it('should send actions back to the action$ stream respecting dispatch order', async () => {
            const aAction = { type: 'A' };
            const bAction = { type: 'B' };
            const someEffect: Effect<Action, {}> = action$ =>
                action$.pipe(ofType(aAction.type), mapTo(bAction));

            const reducerMock = jest.fn((state = initialState, _action) => state);

            const store = createStore(reducerMock, someEffect);

            store.state$.subscribe();
            store.action$.next(aAction);

            await awaitNMockCalls(reducerMock, 4);

            expect(reducerMock).toHaveBeenNthCalledWith(1, undefined, initStateAction);
            expect(reducerMock).toHaveBeenNthCalledWith(2, initialState, initAction);
            expect(reducerMock).toHaveBeenNthCalledWith(3, initialState, aAction);
            expect(reducerMock).toHaveBeenNthCalledWith(4, initialState, bAction);
        });
    });
});
