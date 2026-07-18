/** IndexedDB persistence adapterの公開APIを提供する。 */
export { IndexedDbProgressRepository } from './IndexedDbProgressRepository';
export { migrateRepositorySnapshot } from './migrateProgress';
export { openProgressDatabase } from './openProgressDatabase';
export type { ProgressDatabase, ProgressDatabaseOpener } from './openProgressDatabase';
