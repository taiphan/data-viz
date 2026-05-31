import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkbookStore } from '@/lib/store';
import { generateId } from '@/lib/data-engine';
import type { ConnectionProfile } from '@/lib/connectors/types';

describe('Profile Manager - Store Integration', () => {
  beforeEach(() => {
    useWorkbookStore.getState().resetWorkbook();
  });

  function createTestProfile(overrides?: Partial<ConnectionProfile>): ConnectionProfile {
    return {
      id: generateId(),
      name: 'Test PostgreSQL',
      connectorId: 'postgresql',
      parameters: { host: 'localhost', port: 5432, database: 'testdb' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('should add a profile to the store', () => {
    const store = useWorkbookStore.getState();
    const profile = createTestProfile();

    store.addProfile(profile);

    const state = useWorkbookStore.getState();
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0].name).toBe('Test PostgreSQL');
    expect(state.profiles[0].connectorId).toBe('postgresql');
  });

  it('should rename a profile', () => {
    const store = useWorkbookStore.getState();
    const profile = createTestProfile({ id: 'profile-1' });

    store.addProfile(profile);
    store.updateProfile('profile-1', { name: 'Production DB' });

    const state = useWorkbookStore.getState();
    expect(state.profiles[0].name).toBe('Production DB');
  });

  it('should update the updatedAt timestamp on rename', () => {
    const store = useWorkbookStore.getState();
    const profile = createTestProfile({
      id: 'profile-1',
      updatedAt: '2024-01-01T00:00:00.000Z',
    });

    store.addProfile(profile);
    store.updateProfile('profile-1', { name: 'Renamed' });

    const state = useWorkbookStore.getState();
    expect(state.profiles[0].updatedAt).not.toBe('2024-01-01T00:00:00.000Z');
  });

  it('should duplicate a profile with (copy) suffix', () => {
    const store = useWorkbookStore.getState();
    const profile = createTestProfile({ id: 'profile-1', name: 'My DB' });

    store.addProfile(profile);

    // Simulate duplication logic from the component
    const original = useWorkbookStore.getState().profiles[0];
    const duplicate: ConnectionProfile = {
      ...original,
      id: generateId(),
      name: `${original.name} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastConnectedAt: undefined,
    };
    store.addProfile(duplicate);

    const state = useWorkbookStore.getState();
    expect(state.profiles).toHaveLength(2);
    expect(state.profiles[1].name).toBe('My DB (copy)');
    expect(state.profiles[1].connectorId).toBe(original.connectorId);
    expect(state.profiles[1].parameters).toEqual(original.parameters);
    expect(state.profiles[1].lastConnectedAt).toBeUndefined();
  });

  it('should delete a profile', () => {
    const store = useWorkbookStore.getState();
    const profile = createTestProfile({ id: 'profile-to-delete' });

    store.addProfile(profile);
    expect(useWorkbookStore.getState().profiles).toHaveLength(1);

    store.removeProfile('profile-to-delete');
    expect(useWorkbookStore.getState().profiles).toHaveLength(0);
  });

  it('should clear activeConnectionId when deleting the active profile', () => {
    const store = useWorkbookStore.getState();
    const profile = createTestProfile({ id: 'active-profile' });

    store.addProfile(profile);
    store.setActiveConnection('active-profile');
    expect(useWorkbookStore.getState().activeConnectionId).toBe('active-profile');

    store.removeProfile('active-profile');
    expect(useWorkbookStore.getState().activeConnectionId).toBeNull();
  });

  it('should not affect activeConnectionId when deleting a non-active profile', () => {
    const store = useWorkbookStore.getState();
    const profile1 = createTestProfile({ id: 'profile-1' });
    const profile2 = createTestProfile({ id: 'profile-2', name: 'Other DB' });

    store.addProfile(profile1);
    store.addProfile(profile2);
    store.setActiveConnection('profile-1');

    store.removeProfile('profile-2');
    expect(useWorkbookStore.getState().activeConnectionId).toBe('profile-1');
  });

  it('should support multiple profiles', () => {
    const store = useWorkbookStore.getState();

    store.addProfile(createTestProfile({ id: 'p1', name: 'DB 1', connectorId: 'postgresql' }));
    store.addProfile(createTestProfile({ id: 'p2', name: 'DB 2', connectorId: 'mysql' }));
    store.addProfile(createTestProfile({ id: 'p3', name: 'Warehouse', connectorId: 'snowflake' }));

    const state = useWorkbookStore.getState();
    expect(state.profiles).toHaveLength(3);
  });

  it('should filter profiles by name (search logic)', () => {
    const store = useWorkbookStore.getState();

    store.addProfile(createTestProfile({ id: 'p1', name: 'Production PostgreSQL' }));
    store.addProfile(createTestProfile({ id: 'p2', name: 'Staging MySQL' }));
    store.addProfile(createTestProfile({ id: 'p3', name: 'Dev PostgreSQL' }));

    const profiles = useWorkbookStore.getState().profiles;
    const query = 'postgresql';
    const filtered = profiles.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase())
    );

    expect(filtered).toHaveLength(2);
    expect(filtered[0].name).toBe('Production PostgreSQL');
    expect(filtered[1].name).toBe('Dev PostgreSQL');
  });

  it('should return empty list when no profiles match search', () => {
    const store = useWorkbookStore.getState();

    store.addProfile(createTestProfile({ id: 'p1', name: 'Production DB' }));

    const profiles = useWorkbookStore.getState().profiles;
    const query = 'nonexistent';
    const filtered = profiles.filter((p) =>
      p.name.toLowerCase().includes(query.toLowerCase())
    );

    expect(filtered).toHaveLength(0);
  });

  it('should preserve profile parameters on select (pre-populate form)', () => {
    const store = useWorkbookStore.getState();
    const params = {
      host: 'db.example.com',
      port: 5432,
      database: 'analytics',
      username: 'admin',
      ssl: true,
    };
    const profile = createTestProfile({ id: 'p1', parameters: params });

    store.addProfile(profile);

    const saved = useWorkbookStore.getState().profiles[0];
    expect(saved.parameters).toEqual(params);
    expect(saved.parameters.host).toBe('db.example.com');
    expect(saved.parameters.port).toBe(5432);
    expect(saved.parameters.ssl).toBe(true);
  });
});
