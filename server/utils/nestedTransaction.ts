import type { EntityManager } from 'typeorm';

export const withNestedTransaction = <T>(
  manager: EntityManager,
  run: (manager: EntityManager) => Promise<T>
): Promise<T> =>
  // sqlite shares one query runner process-wide, so nesting collides on the savepoint counter
  manager.connection.options.type === 'sqlite'
    ? run(manager)
    : manager.transaction(run);
