"""Read-only producer check against pinned RI SHACL, including its SPARQL constraints.

No RI service, database, provisioning endpoint or live environment is contacted.
REC projection below covers the materializer rules exercised by this Builder fixture.
"""
import argparse
import subprocess

from pyshacl import validate
from rdflib import Graph, Literal, Namespace, RDF, URIRef

PIN = '6e0fefee8be2caaa33608d76845cbab2841cf9dd'
BOS = Namespace('http://buildingos.gutp.jp/ontology#')
SBCO = Namespace('https://www.sbco.or.jp/ont/')
REC = Namespace('https://w3id.org/rec/')


def check(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ri-root', required=True)
    parser.add_argument('--rdf', required=True)
    args = parser.parse_args()
    # git show reads the exact requested revision even if the other worktree advances.
    shape_text = subprocess.check_output([
        'git', '-C', args.ri_root, 'show',
        PIN + ':docs/design/ri-606/fixtures/clock-shapes.ttl',
    ], text=True)
    shapes = Graph().parse(data=shape_text, format='turtle')
    graph = Graph().parse(args.rdf, format='turtle')
    for source, target in [('Building', 'Building'), ('Level', 'Level'), ('Room', 'Room')]:
        for subject in list(graph.subjects(RDF.type, REC[source])):
            graph.add((subject, RDF.type, SBCO[target]))
    for prop in ['hasPart', 'hasPoint', 'locatedIn', 'name']:
        for subject, obj in list(graph.subject_objects(REC[prop])):
            graph.add((subject, SBCO[prop], obj))

    def conforms(data):
        return validate(data, shacl_graph=shapes, inference='none')[0]

    check(conforms(graph), 'Builder RDF must conform to original RI SHACL')
    points = set(graph.subjects(RDF.type, SBCO.PointExt))
    check(len(points) == 35, 'Expected exactly 35 normal Points')
    check({str(graph.value(p, SBCO.id)) for p in points} == {f'BPT-{i:04d}' for i in range(2, 37)}, 'Stable Point IDs')
    check(all(str(graph.value(p, BOS.protocol)) == 'bacnet' for p in points), 'bos:protocol preserved')
    for point in points:
        owners = list(graph.subjects(SBCO.hasPoint, point))
        check(len(owners) == 1, 'Exactly one Equipment owner')
        frontier = list(graph.objects(owners[0], SBCO.locatedIn))
        visited, buildings = set(), set()
        while frontier:
            space = frontier.pop()
            if space in visited:
                continue
            visited.add(space)
            if (space, RDF.type, SBCO.Building) in graph:
                buildings.add(str(graph.value(space, SBCO.id)))
            frontier.extend(graph.subjects(SBCO.hasPart, space))
        check(buildings == {str(graph.value(point, SBCO.building))}, 'Point building must equal topology Building public ID (#45)')
    clocks = list(graph.subjects(RDF.type, BOS.ClockSource))
    check(len(clocks) == 1, 'Expected one independent clock')
    clock = clocks[0]
    native = graph.value(clock, BOS.nativeBinding)
    equipment = list(graph.subjects(BOS.usesClockSource, clock))
    check(bool(equipment), 'Expected Equipment applications')
    check(all(set(graph.subjects(SBCO.hasPoint, p)).issubset(equipment) for p in points), 'Every Point belongs to clock-scoped Equipment')
    point = sorted(points)[0]
    mutations = [
        ('gateway mismatch', lambda g: g.set((point, SBCO.gatewayId, Literal('other')))),
        ('duplicate ID', lambda g: g.add((URIRef('urn:duplicate:point'), RDF.type, SBCO.PointExt))),
        ('dual type', lambda g: g.add((clock, RDF.type, SBCO.PointExt))),
        ('point override', lambda g: g.add((point, BOS.usesClockSource, clock))),
        ('runtime property', lambda g: g.add((clock, BOS.runId, Literal('run')))),
        ('wrong native datatype', lambda g: g.set((native, BOS.deviceInstance, Literal('1234')))),
        ('invalid native bounds', lambda g: g.set((native, BOS.objectInstance, Literal(4194304)))),
        ('literal reference', lambda g: g.set((equipment[0], BOS.usesClockSource, Literal(str(clock))))),
        ('dangling clock', lambda g: g.set((equipment[0], BOS.usesClockSource, URIRef('urn:missing:clock')))),
    ]
    for label, mutate in mutations:
        changed = Graph()
        for triple in graph:
            changed.add(triple)
        mutate(changed)
        if label == 'duplicate ID':
            # Fully formed namesake: failure must include duplicate-ID SPARQL rather than
            # only missing required Point properties.
            duplicate = URIRef('urn:duplicate:point')
            for predicate, obj in graph.predicate_objects(point):
                changed.add((duplicate, predicate, obj))
            owner = next(graph.subjects(SBCO.hasPoint, point))
            changed.add((owner, SBCO.hasPoint, duplicate))
        check(not conforms(changed), 'RI SHACL must reject ' + label)
    print(f'PASS: RI {PIN}; 35 Points, 1 ClockSource, {len(equipment)} Equipment bindings; {len(mutations)} negative cases (original SHACL/SPARQL). No RI service called.')


if __name__ == '__main__':
    main()
