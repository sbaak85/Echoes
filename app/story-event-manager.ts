export type StoryEventMap = {
  gameReady: { currentChapter: number };
  newGameStarted: { currentChapter: number };
  chapterStarted: { chapter: number };
  storyZoneEntered: { zoneId: string };
  interactionCompleted: { interactionId: string };
  sleepCompleted: { elapsedMinutes: number };
  objectiveCompleted: { objectiveId: string };
};

type StoryEventHandler<T> = (payload: T) => void | Promise<void>;

/** A small typed event bus that keeps story triggers independent from UI. */
export class StoryEventManager {
  private readonly handlers = new Map<
    keyof StoryEventMap,
    Set<StoryEventHandler<never>>
  >();

  on<K extends keyof StoryEventMap>(
    type: K,
    handler: StoryEventHandler<StoryEventMap[K]>,
  ) {
    const handlers = this.handlers.get(type) ?? new Set();
    handlers.add(handler as StoryEventHandler<never>);
    this.handlers.set(type, handlers);
    return () => handlers.delete(handler as StoryEventHandler<never>);
  }

  async emit<K extends keyof StoryEventMap>(
    type: K,
    payload: StoryEventMap[K],
  ) {
    const handlers = [...(this.handlers.get(type) ?? [])];
    for (const handler of handlers) {
      await (handler as StoryEventHandler<StoryEventMap[K]>)(payload);
    }
  }
}
