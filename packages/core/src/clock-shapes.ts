// RI 6e0fefee8be2caaa33608d76845cbab2841cf9dd, clock-shapes.ttl (draft).
// REC predicates match Builder output before RI materialization. SPARQL-only gateway and
// duplicate-ID constraints are enforced by validateClockSidecar, never silently skipped.
export const CLOCK_SOURCE_SHAPES = `# Proposed extension shapes; no ontology release or product integration is implied.
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix sbco: <https://www.sbco.or.jp/ont/> .
@prefix bos: <http://buildingos.gutp.jp/ontology#> .
@prefix rec: <https://w3id.org/rec/> .
@prefix draft: <https://example.com/ri-606/shapes/> .

draft:Clock a sh:NodeShape ;
  sh:targetClass bos:ClockSource ;
  sh:nodeKind sh:IRI ;
  sh:closed true ; sh:ignoredProperties ( rdf:type ) ;
  sh:not [ sh:class sbco:PointExt ] ;
  sh:property [ sh:path bos:clockDomain ; sh:minCount 1 ; sh:maxCount 1 ; sh:in ( "simulation" ) ] ;
  sh:property [ sh:path bos:clockUnit ; sh:minCount 1 ; sh:maxCount 1 ; sh:in ( "s" ) ] ;
  sh:property [ sh:path bos:readOnly ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:boolean ; sh:hasValue true ] ;
  sh:property [ sh:path bos:acquisitionMode ; sh:minCount 1 ; sh:maxCount 1 ; sh:in ( "poll" ) ] ;
  sh:property [ sh:path bos:nativeBinding ; sh:minCount 1 ; sh:maxCount 1 ; sh:nodeKind sh:IRI ; sh:class bos:BacnetClockBinding ] .

draft:Native a sh:NodeShape ;
  sh:targetClass bos:BacnetClockBinding ;
  sh:nodeKind sh:IRI ; sh:closed true ; sh:ignoredProperties ( rdf:type ) ;
  sh:property [ sh:path bos:gatewayId ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:string ; sh:minLength 1 ] ;
  sh:property [ sh:path bos:connectorId ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:string ; sh:minLength 1 ] ;
  sh:property [ sh:path bos:deviceInstance ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:integer ; sh:minInclusive 0 ; sh:maxInclusive 4194302 ] ;
  sh:property [ sh:path bos:objectType ; sh:minCount 1 ; sh:maxCount 1 ; sh:in ( "analogValue" "analogInput" ) ] ;
  sh:property [ sh:path bos:objectInstance ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:integer ; sh:minInclusive 0 ; sh:maxInclusive 4194303 ] ;
  sh:property [ sh:path bos:property ; sh:minCount 1 ; sh:maxCount 1 ; sh:in ( "presentValue" ) ] ;
  sh:property [ sh:path bos:nativeUnit ; sh:minCount 1 ; sh:maxCount 1 ; sh:in ( "seconds" ) ] .

# Target relation subjects too, so an unknown equipment cannot evade validation.
draft:Equipment a sh:NodeShape ;
  sh:targetSubjectsOf bos:usesClockSource ;
  sh:class sbco:EquipmentExt ; sh:nodeKind sh:IRI ;
  sh:property [ sh:path sbco:id ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:string ; sh:minLength 1 ] ;
  sh:property [ sh:path bos:usesClockSource ; sh:maxCount 1 ; sh:nodeKind sh:IRI ; sh:class bos:ClockSource ] ;
  sh:property [ sh:path rec:hasPoint ; sh:minCount 1 ; sh:class sbco:PointExt ] .

draft:Point a sh:NodeShape ;
  sh:targetClass sbco:PointExt ;
  sh:property [ sh:path sbco:id ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:string ; sh:not [ sh:in ( "BPT-0001" ) ] ] ;
  sh:property [ sh:path sbco:gatewayId ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:string ] ;
  sh:property [ sh:path [ sh:inversePath rec:hasPoint ] ; sh:minCount 1 ; sh:maxCount 1 ; sh:class sbco:EquipmentExt ] ;
  sh:property [ sh:path bos:usesClockSource ; sh:maxCount 0 ] .
`;
