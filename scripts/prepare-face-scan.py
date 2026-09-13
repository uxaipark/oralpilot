"""Prepare the attributed Infinite head scan for the browser; no dental registration.
Retains UVs, crops the shoulder base, and refines the display surface twice.
The immutable source GLB and image maps remain beside the derivative.
"""
from pathlib import Path
import json, struct, hashlib
import numpy as np
root=Path(__file__).resolve().parents[1]/'public/anatomy/face-scan'
b=(root/'head.glb').read_bytes(); length=struct.unpack_from('<I',b,12)[0]
doc=json.loads(b[20:20+length]); offset=20+length+8
primitive=doc['meshes'][0]['primitives'][0]
def read_accessor(index):
 a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
 width={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']]
 return np.frombuffer(b,dtype={5126:'<f4',5123:'<u2'}[a['componentType']],count=a['count']*width,offset=offset+v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width).copy()
p=read_accessor(primitive['attributes']['POSITION']);n=read_accessor(primitive['attributes']['NORMAL']);uv=read_accessor(primitive['attributes']['TEXCOORD_0']);f=read_accessor(primitive['indices']).reshape(-1,3).astype(np.uint32)
# This is an exterior mask with a deliberately open neck boundary, not a closed medical surface.
f=f[np.all(p[f,1]>=-1.4,axis=1)]
for iteration in range(2):
 points=p.tolist(); normals=n.tolist(); uvs=uv.tolist(); edges={}; faces=[]
 def midpoint(a,b):
  key=(min(a,b),max(a,b))
  if key in edges:return edges[key]
  mid=(p[a]+p[b])/2
  # Project onto endpoint tangent planes; bound the silhouette correction.
  delta=-.5*(n[a]*np.dot(mid-p[a],n[a])+n[b]*np.dot(mid-p[b],n[b]))
  length=np.linalg.norm(delta)
  if length>.005:delta*=.005/length
  normal=n[a]+n[b];normal/=max(np.linalg.norm(normal),1e-9)
  idx=len(points);edges[key]=idx;points.append((mid+delta).tolist());normals.append(normal.tolist());uvs.append(((uv[a]+uv[b])/2).tolist());return idx
 for a,b,c in f:
  ab=midpoint(a,b);bc=midpoint(b,c);ca=midpoint(c,a)
  faces.extend([(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)])
 p=np.array(points,dtype='<f4');n=np.array(normals,dtype='<f4');uv=np.array(uvs,dtype='<f4');f=np.array(faces,dtype='<u4')
used,indices=np.unique(f,return_inverse=True);p=p[used];n=n[used];uv=uv[used];f=indices.reshape(-1,3).astype('<u4')
chunks=[p.tobytes(),n.tobytes(),uv.tobytes(),f.tobytes()];data=b''.join(chunks);(root/'face-mesh.bin').write_bytes(data)
meta={'schema':'oralpilot-face-display-v1','vertices':len(p),'triangles':len(f),'positionOffset':0,'normalOffset':len(chunks[0]),'uvOffset':len(chunks[0])+len(chunks[1]),'indexOffset':sum(map(len,chunks[:3])),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'sourceSha256':hashlib.sha256((root/'head.glb').read_bytes()).hexdigest(),'bounds':[p.min(0).tolist(),p.max(0).tolist()],'mouthReference':[-.09,.42,2.28],'displayScale':45,'processing':'Neck crop at source y=-1.4; two tangent-plane edge refinements, <=0.005 source unit correction per pass. UV seams retained. No dental registration.','sameSubjectAsDentalCT':False,'referenceOnly':True}
(root/'face-mesh.json').write_text(json.dumps(meta,indent=2)+'\n');print(meta)
