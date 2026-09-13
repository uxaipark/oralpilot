"""Package retained Open-Full-Jaw output meshes without changing source coordinates."""
from pathlib import Path
import json, re, hashlib, struct
import numpy as np
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'datasets/public-examples/cases/open-full-jaw'
DEST = ROOT / 'web/public/cases/open-full-jaw'
DEST.mkdir(parents=True, exist_ok=True)
cases=[]
for folder in sorted(SOURCE.iterdir(), key=lambda p:int(p.name.split('_')[-1])):
    if not folder.is_dir(): continue
    chunks=[]; segments=[]; offset=0; tooth_numbers=[]
    for jaw in ['maxilla','mandible']:
        axes=folder/'input'/jaw/f'teeth_axes_{jaw}.json'
        if axes.exists(): tooth_numbers += [int(n) for n in json.loads(axes.read_text())]
        for kind, filename in [('bone','bone.stl'),('tooth','teeth.stl'),('pdl','pdls.stl')]:
            f=folder/'output'/jaw/'surface_meshes'/filename
            if not f.exists(): continue
            raw=f.read_bytes()
            count=struct.unpack_from('<I',raw,80)[0] if len(raw)>=84 else 0
            if 84+count*50 == len(raw):
                tris=np.frombuffer(raw, dtype=np.dtype([('normal','<f4',3),('vertices','<f4',(3,3)),('attr','<u2')]),offset=84)['vertices'].reshape(-1,3).copy()
            else:
                tris=np.array(re.findall(rb'vertex\s+(\S+)\s+(\S+)\s+(\S+)',raw),dtype='<f4')
            if not len(tris) or len(tris)%3 or not np.isfinite(tris).all(): raise ValueError(str(f))
            vertices,indices=np.unique(tris,axis=0,return_inverse=True)
            vertices=np.ascontiguousarray(vertices,dtype='<f4');indices=np.asarray(indices,dtype='<u4')
            vb=vertices.tobytes();ib=indices.tobytes()
            segments.append(dict(jaw=jaw,kind=kind,positions=offset,vertexCount=len(vertices),indices=offset+len(vb),indexCount=len(indices),source=str(f.relative_to(ROOT/'datasets')),sourceSHA256=hashlib.sha256(raw).hexdigest()))
            chunks += [vb,ib]; offset+=len(vb)+len(ib)
    payload=b''.join(chunks);(DEST/f'{folder.name}.bin').write_bytes(payload)
    record=dict(id=folder.name,name=f'Open-Full-Jaw · Patient {folder.name.split("_")[-1]}',upper=any(s['jaw']=='maxilla' for s in segments),lower=any(s['jaw']=='mandible' for s in segments),teeth=sorted(set(tooth_numbers)),bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest(),url=f'/cases/open-full-jaw/{folder.name}.bin',segments=segments)
    cases.append(record)
    print(folder.name,len(payload),len(segments),flush=True)
(DEST/'catalog.json').write_text(json.dumps(dict(schema='oralpilot-jaw-cases-v1',source='https://github.com/diku-dk/Open-Full-Jaw',license='CC BY-NC-SA 4.0',coordinateTransform='x,z,-y; shared bounding-box center; mm',note='Published adaptive output meshes. No remeshing, no invented missing anatomy. PDL is a computational layer, not a measured periodontal examination.',cases=cases),ensure_ascii=False,indent=2)+'\n')
(DEST/'LICENSE.txt').write_text((ROOT/'datasets/public-examples/sources/open-full-jaw-pinned-LICENSE').read_text())
