describe('localDatabase migrations', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('react-native');
    jest.dontMock('expo-sqlite');
  });

  test('migrates a legacy native database from user_version 0 to the current schema version', async () => {
    let userVersion = 0;
    const mockDb = {
      execSync: jest.fn((sql: string) => {
        const match = sql.match(/PRAGMA user_version = (\d+)/);
        if (match) {
          userVersion = Number(match[1]);
        }
      }),
      getFirstSync: jest.fn(() => ({ user_version: userVersion })),
    };
    const openDatabaseSync = jest.fn(() => mockDb);

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock('expo-sqlite', () => ({
      openDatabaseSync,
    }));

    let localDatabase!: typeof import('../src/database/services/localDatabase');
    jest.isolateModules(() => {
      localDatabase = require('../src/database/services/localDatabase');
    });

    await localDatabase.initializeDatabase();

    expect(await localDatabase.getDatabaseSchemaVersion()).toBe(localDatabase.DATABASE_SCHEMA_VERSION);
    expect(openDatabaseSync).toHaveBeenCalledTimes(1);
    expect(mockDb.execSync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS meals'));
    expect(mockDb.execSync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS search_vectors'));
    expect(mockDb.execSync).toHaveBeenCalledWith('PRAGMA user_version = 1');
    expect(mockDb.execSync).toHaveBeenCalledWith('PRAGMA user_version = 2');
  });

  test('does not reapply migrations after initialization is complete', async () => {
    let userVersion = 0;
    const mockDb = {
      execSync: jest.fn((sql: string) => {
        const match = sql.match(/PRAGMA user_version = (\d+)/);
        if (match) {
          userVersion = Number(match[1]);
        }
      }),
      getFirstSync: jest.fn(() => ({ user_version: userVersion })),
    };

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
    }));
    jest.doMock('expo-sqlite', () => ({
      openDatabaseSync: jest.fn(() => mockDb),
    }));

    let localDatabase!: typeof import('../src/database/services/localDatabase');
    jest.isolateModules(() => {
      localDatabase = require('../src/database/services/localDatabase');
    });

    await localDatabase.initializeDatabase();
    await localDatabase.initializeDatabase();

    expect(mockDb.execSync).toHaveBeenCalledTimes(4);
  });

  test('uses the current schema version and search-vector state in the in-memory fallback', async () => {
    const openDatabaseSync = jest.fn();

    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('expo-sqlite', () => ({
      openDatabaseSync,
    }));

    let localDatabase!: typeof import('../src/database/services/localDatabase');
    jest.isolateModules(() => {
      localDatabase = require('../src/database/services/localDatabase');
    });

    await localDatabase.initializeDatabase();
    localDatabase.setInMemorySearchVectors([
      {
        meal_id: 'meal-1',
        vector_data: '[0.1,0.2]',
        vector_model: 'local-semantic-search',
        vector_dimension: 2,
        indexed_text: '海鮮丼',
        text_version: 1,
        created_at: 1,
        updated_at: 1,
      },
    ]);

    expect(await localDatabase.getDatabaseSchemaVersion()).toBe(localDatabase.DATABASE_SCHEMA_VERSION);
    expect(localDatabase.getInMemorySearchVectors()).toHaveLength(1);

    localDatabase.resetInMemoryDatabase();

    expect(openDatabaseSync).not.toHaveBeenCalled();
    expect(localDatabase.getInMemorySearchVectors()).toEqual([]);
  });
});
