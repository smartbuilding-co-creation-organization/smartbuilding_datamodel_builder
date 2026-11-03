import test from 'node:test';
import assert from 'node:assert/strict';
import { useAppStore } from '../src/state/store';

test('fallback space renames retain inspector properties, selection and expansion', () => {
  const store = useAppStore;
  store.getState().setData(
    [],
    [],
    [
      {
        id: 'P',
        pointId: 'P',
        deviceId: 'D',
        deviceName: 'Device',
        site: 'Site',
        building: 'Building',
        floor: 'Floor',
        installationArea: 'Room',
        hierarchyIdVersion: '2',
      },
    ],
  );
  const room = store.getState().modelRows.find((row) => row.kind === 'Room')!;
  const level = store.getState().modelRows.find((row) => row.kind === 'Level')!;
  store.getState().updateModelRow(room.id, { ...room, custom: 'keep room' });
  store.getState().setSelectedId(room.id);
  store.getState().setExpandedItems([level.id, room.id]);
  store.getState().updateModelRow(level.id, { ...level, name: 'Renamed floor' });
  const renamedRoom = store.getState().modelRows.find((row) => row.kind === 'Room')!;
  const renamedLevel = store.getState().modelRows.find((row) => row.kind === 'Level')!;
  assert.notEqual(renamedRoom.id, room.id);
  assert.equal(renamedRoom.custom, 'keep room');
  assert.equal(store.getState().selectedId, renamedRoom.id);
  assert.deepEqual(store.getState().expandedItems, [renamedLevel.id, renamedRoom.id]);
});

test('spatial-only v2 rows rename the source hierarchy and retain selection', () => {
  const store = useAppStore;
  store.getState().setData(
    [],
    [],
    [
      {
        id: 'X',
        site: 'Site',
        building: 'Building',
        floor: 'Floor',
        installationArea: 'Room',
        hierarchyIdVersion: '2',
      },
    ],
  );
  const room = store.getState().modelRows.find((row) => row.kind === 'Room')!;
  store.getState().setSelectedId(room.id);
  store.getState().updateModelRow(room.id, { ...room, name: 'Renamed room' });
  const renamed = store.getState().modelRows.find((row) => row.kind === 'Room')!;
  assert.equal(store.getState().rows[0].roomName, 'Renamed room');
  assert.equal(renamed.name, 'Renamed room');
  assert.notEqual(renamed.id, room.id);
  assert.equal(store.getState().selectedId, renamed.id);
});
