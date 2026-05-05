export const KIND_TO_CLASS: Record<string, string> = {
  site: 'Site',
  building: 'Building',
  floor: 'Level',
  level: 'Level',
  space: 'Room',
  room: 'Room',
  zone: 'Zone',
  outdoorspace: 'OutdoorSpace',
  device: 'EquipmentExt',
  equipment: 'EquipmentExt',
  equipmentext: 'EquipmentExt',
  point: 'PointExt',
  pointext: 'PointExt',
};

export const INTERNAL_ROW_KEYS: ReadonlySet<string> = new Set([
  '__rowId',
  'parentId',
  'kind',
  'pointId',
  'pointName',
  'deviceId',
  'deviceName',
]);
