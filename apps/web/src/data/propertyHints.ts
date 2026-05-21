export type PropertyHint = {
  label: string;
  desc: string;
};

export const PROPERTY_HINTS: Record<string, PropertyHint> = {
  id: { label: 'ID', desc: 'このノードを一意に識別するID。例: AC-A101' },
  kind: { label: '種別', desc: 'このノードがsite / building / floor / room / device / pointのどれかを示します。' },
  name: { label: '名称', desc: '人が読んで分かる表示名。' },
  parentId: { label: '親ID', desc: '階層上の親ノードのID。これでツリーが構築されます。' },
  site: { label: 'サイト', desc: '敷地・拠点名（例: 本社キャンパス）。' },
  building: { label: '建物', desc: '建物名（例: 本館）。' },
  floor: { label: 'フロア', desc: '階層（例: 1F, B1）。' },
  installationArea: { label: '設置エリア', desc: '部屋番号やゾーン（例: 101, 会議室A）。' },
  installation_area: { label: '設置エリア', desc: '部屋番号やゾーン（例: 101, 会議室A）。' },
  deviceId: { label: 'デバイスID', desc: '機器のシステム上のID。' },
  device_id: { label: 'デバイスID', desc: '機器のシステム上のID。' },
  deviceName: { label: 'デバイス名', desc: '機器の表示名。' },
  device_name: { label: 'デバイス名', desc: '機器の表示名。' },
  deviceType: { label: 'デバイス種別', desc: '機器のクラス（AirConditioner / Lighting など）。' },
  device_type: { label: 'デバイス種別', desc: '機器のクラス（AirConditioner / Lighting など）。' },
  pointId: { label: 'ポイントID', desc: '計測点／制御点の一意ID。BACnet等のシステム識別に使用。' },
  point_id: { label: 'ポイントID', desc: '計測点／制御点の一意ID。BACnet等のシステム識別に使用。' },
  pointName: { label: 'ポイント名', desc: '計測点の表示名（例: 室温, 設定温度）。' },
  point_name: { label: 'ポイント名', desc: '計測点の表示名（例: 室温, 設定温度）。' },
  pointType: { label: 'ポイント種別', desc: '標準ポイントタイプ。例: roomTemp, roomTempSetpoint, onOffStatus。' },
  point_type: { label: 'ポイント種別', desc: '標準ポイントタイプ。例: roomTemp, roomTempSetpoint, onOffStatus。' },
  pointSpecification: { label: 'ポイント仕様', desc: 'ポイントの詳細説明。' },
  point_specification: { label: 'ポイント仕様', desc: 'ポイントの詳細説明。' },
  writable: { label: '書込可', desc: 'true: 制御可能 / false: 読取専用。' },
  unit: { label: '単位', desc: '計測値の単位（例: ℃, %）。' },
  localId: { label: 'ローカルID', desc: 'デバイス内でのポイントローカル識別子。' },
  local_id: { label: 'ローカルID', desc: 'デバイス内でのポイントローカル識別子。' },
  interval: { label: '収集間隔', desc: 'データ収集間隔（秒）。' },
  scale: { label: 'スケール', desc: '生値→物理量の換算係数。' },
  labels: { label: 'ラベル', desc: '任意のタグ付け（カンマ区切り）。' },
  tags: { label: 'タグ', desc: '任意のタグ付け（カンマ区切り）。' },
  supplier: { label: 'サプライヤ', desc: '機器の供給元。' },
  owner: { label: '所有者', desc: '管理責任者・部署。' },
  description: { label: '説明', desc: '自由記述の説明。' },
  gatewayId: { label: 'ゲートウェイID', desc: 'データ収集ゲートウェイのID。' },
  gateway_id: { label: 'ゲートウェイID', desc: 'データ収集ゲートウェイのID。' },
};

export const REQUIRED_BY_KIND: Record<string, string[]> = {
  site: ['id', 'name', 'site'],
  building: ['id', 'name', 'building', 'site'],
  floor: ['id', 'name', 'floor', 'building', 'site'],
  room: ['id', 'name', 'installationArea', 'floor', 'building', 'site'],
  device: ['id', 'name', 'deviceId', 'deviceType', 'site', 'building', 'floor'],
  point: ['id', 'name', 'pointId', 'pointType', 'pointSpecification', 'writable', 'deviceId', 'deviceName', 'deviceType', 'site', 'building', 'floor', 'installationArea', 'localId'],
};
