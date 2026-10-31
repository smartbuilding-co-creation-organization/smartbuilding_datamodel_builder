# 独立した時計入力（RI #606 draft / Builder #44）

参照契約はRI `6e0fefee8be2caaa33608d76845cbab2841cf9dd` のADR-0009、
`ClockConfigurationGraph`、`docs/design/ri-606/fixtures/clock-shapes.ttl`。
`bos:` は `http://buildingos.gutp.jp/ontology#`。この時計語彙はRI draft拡張であり、
SBCO標準や正式ontology releaseとして扱わない。

設備CSVは1行1 Pointのまま。35点 BPT-0002〜BPT-0036を保持し、
time/advanceや廃止BPT-0001を戻さない。時計定義・適用関係は別JSONとして渡す。
UIに時計行を足す方式ではなく、core API / CLIがこの入力を受け付ける。

## 入力と出力

```sh
pnpm cli -- --input points.csv --clocks clocks.json --format RDF --out model.ttl
```

```ts
const clocks = parseClockSidecar(clockJson);
const result = await runOutputPlugin('RDF', 'Turtle', {
  rows, schema, clocks, shacl: { shapeText },
});
// 同じJSONを保存・再読込可能。配列はID順で保存される。
const clockJsonForSave = serializeClockSidecar(clocks);
```

sidecarのルートは `schemaVersion: "builder-clocks/1-draft"`、`clockSources`、
`clockBindings`。これはBuilder入力形式で、RI provisioning snapshotやrun contextではない。
例は [boptest-clocks.json](../packages/core/test/fixtures/boptest-clocks.json)。
**native設定1234/analogValue/2は契約検証用の合成値で、bestest_airの実アドレスではない。**
実際の取得元・connector IDは入力者が指定する。timeという名前から推測しない。

| 入力 | RDF |
| --- | --- |
| `clockSources[].clockId` | ClockSourceの絶対IRI。そのまま保持 |
| `clockDomain`, `unit`, `readOnly`, `acquisitionMode` | `bos:clockDomain "simulation"`, `bos:clockUnit "s"`, `bos:readOnly true`, `bos:acquisitionMode "poll"` |
| `native.bindingId` | `bos:nativeBinding`のIRI先、型は`bos:BacnetClockBinding` |
| `native.gatewayId`, `connectorId` | native側の`bos:gatewayId`, `bos:connectorId` |
| `native.deviceInstance`, `objectInstance` | `bos:deviceInstance`, `bos:objectInstance`（xsd:integer） |
| `native.objectType`, `property`, `unit` | `bos:objectType`, `bos:property`, `bos:nativeUnit` |
| `clockBindings[].equipmentId` | #45の**公開Equipment ID**。RDFでは実際のEquipment IRIへ解決 |
| `clockBindings[].clockId` | Equipmentから`bos:usesClockSource`で参照する時計IRI |

`native.protocol`は`"bacnet"`必須。BacnetClockBindingという型で表すため、nativeには
`bos:protocol`を余分に付けない（RIのclosed shapeと整合）。設備PointのCSV `protocol`は
#46と同じ`bos:protocol`に写像し、入力値を保持する。プロトコルを推測・補完しない。
未知列も従来どおり保持する。

clock/nativeは明示IRIなので、nativeアドレスやrunが変わっても自動再採番しない。
Equipment IDのエスケープ規則・base IRIは既存出力と同じ。#45の`hierarchy_id_version=2`
をCSV全行に指定し、`building_id`等を明示すればBuilding IDとPoint building参照も整合する。
未指定のCSVはlegacy IDを維持する。

時計を受け付ける出力はRDF/Turtleだけ。他の形式へ`clocks`を渡すと明示エラーになり、
時計を黙って落とさない。CSVとsidecarは別々に保存する。時計なしの旧入力は従来どおり。
`clockSources: []`, `clockBindings: []` は時計なしの明示入力として利用可能。
RIからのRDF import→sidecar逆変換やUI時計エディタは今回の範囲外。

## 検証

JSONはstrict schema。未知キー（資格情報、runId、sim時刻、Point subset等も含む）、
未対応version、不正JSON、不正IRI、文字列で渡したboolean/integerを拒否する。

- clockはsimulation/s/readOnly=true/pollのみ。nativeはbacnet/seconds/presentValueのみ。
- deviceInstanceは整数0〜4194302、objectInstanceは整数0〜4194303。
  objectTypeはanalogValueまたはanalogInput。gatewayId/connectorIdは非空ID。
- clock/native IRIは相互・モデルIRIと重複不可。複数clockでnative IRIを共有する入力も拒否する。
- 各Equipmentは最大1 clock。同じclockを複数Equipmentで共有可能。Point override/subsetは拒否する。
- 参照先は存在するEquipment/ClockSourceでなければならず、EquipmentにはPointが必要。
  対象Equipmentの全PointとnativeのgatewayIdを一致させる。
- 重複Point ID、BPT-0001、graphから落ちたPoint、legacy Equipmentの曖昧な分割を拒否する。
  出力の行統合より前と統合後の両方で検査し、modelRowsによる変更も検査する。
- 型、IRI/literal、必須項目、多重値、closed property、Pointとの二重型付けはSHACL Coreで検査する。
  `CLOCK_SOURCE_SHAPES`をcoreから公開し、RDF pluginはclock入力があれば常に適用する。
  RI materialization前のBuilder出力なので、hasPointは`rec:hasPoint`へ対応させている。
- `rdf-validate-shacl`はSHACL-SPARQL未対応。RIのgateway一致と重複IDのSPARQL条件は
  `validateClockSidecar`で明示検証し、省略成功として扱わない。

CLIは時計の不整合を`--allow-issues`でも迂回しない。不正入力ではstdout/指定出力へ書かず、
既存ファイルを維持する。Pointの既存単位語彙warningは既存方針に従う（時計単位の不正は拒否）。
coreの同期`exportRdf(rows, { clocks })`は入力/意味検証付き。SHACLの結果も必要な呼出し元は
非同期`runOutputPlugin`を使用し、返されたviolationを必ずブロックする。

## 指定SHAの元SHACLによる独立検証

core/CLIテストは35点保持、ID/Building/protocol整合、JSON往復、決定性と異常入力を検査する。
追加のPython検証には#45のv2 IDを選択して出力した35点RDFを使用する。Point buildingと
祖先Building公開IDの一致も確認する。Python検証は、指定SHAから`git show`で元shapeを読取り、SHACL-SPARQLも実行する。
RI materializerのうちこのfixtureが使うREC class/property写像をローカルに投影する。
RI serviceへのimport、認可、snapshot配布、履歴queryを実行したという意味ではない。

```sh
uv run --with pyshacl==0.40.0 --with rdflib==7.6.0 python \
  packages/core/test/verify_clock_ri_contract.py \
  --ri-root ../ri-606 --rdf /tmp/builder45-clock-contract.ttl
```

Clock IRIの所有gateway変更は、過去状態を持つRIの`ValidateOwnership`で検査する。
Builderは過去snapshotを持たないため、移管・削除・rollbackはRIのatomic import契約に従う。
語彙承認、実機probe、RIへの実際の適用、Nexus/BDE結合は別gateのまま。他repoは読取専用。
