"""Derive geometric tooth anchors and canal centerlines from the retained source meshes.
No nerve/artery tissue segmentation is performed. Source mesh coordinates and bytes remain unchanged.
"""
from pathlib import Path
import json,hashlib
import numpy as np
import trimesh
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra,connected_components
from skimage.morphology import skeletonize
ROOT=Path(__file__).resolve().parents[1]/'public/anatomy'
b=(ROOT/'toothfairy.bin').read_bytes();manifest=json.loads((ROOT/'manifest.json').read_text())
paths=[]
for part in manifest['parts']:
 if part['group']=='canal':part['jaw']='mandible'
 elif part['group']=='sinus':part['jaw']='maxilla'
 if part['group'] not in ['tooth','canal']:continue
 vertices=np.frombuffer(b,dtype='<f4',count=part['vertexCount']*3,offset=part['positions']).reshape(-1,3).astype(float)
 faces=np.frombuffer(b,dtype='<u4',count=part['indexCount'],offset=part['indices']).reshape(-1,3)
 if part['group']=='tooth':
  up=np.array(part['axes']['up']);up/=np.linalg.norm(up);center=np.array(part['axes']['center']);projection=(vertices-center)@up
  extent=float(projection.max()-projection.min());crown_height=float(np.clip(extent*.32,5,8));plane=float(projection.max()-crown_height)
  ring=vertices[np.abs(projection-plane)<.65];origin=(ring.mean(axis=0) if len(ring)>8 else center+up*plane);origin=origin+up*(plane-(origin-center)@up)
  part['implantAnchor']={'origin':origin.tolist(),'crownHeightMm':crown_height,'cervicalProjectionMm':plane,'method':'geometric cervical-plane estimate from coronal 32% of tooth extent; not clinician annotated','basis':'source PCA side/up/out; up points toward crown','ringVertexCount':len(ring)}
 else:
  mesh=trimesh.Trimesh(vertices,faces,process=False);vox=mesh.voxelized(pitch=.35).fill();mask=vox.matrix;skel=skeletonize(mask,method='lee');ijk=np.argwhere(skel);tree=cKDTree(ijk);pairs=np.array(list(tree.query_pairs(np.sqrt(3)+.01)));length=np.linalg.norm(ijk[pairs[:,0]]-ijk[pairs[:,1]],axis=1)
  graph=coo_matrix((np.r_[length,length],(np.r_[pairs[:,0],pairs[:,1]],np.r_[pairs[:,1],pairs[:,0]])),shape=(len(ijk),len(ijk))).tocsr();n,labels=connected_components(graph,directed=False);largest=np.argmax(np.bincount(labels));indices=np.flatnonzero(labels==largest);graph=graph[indices][:,indices];ijk=ijk[indices]
  dist=dijkstra(graph,directed=False,indices=0);a=int(np.argmax(dist));dist,prev=dijkstra(graph,directed=False,indices=a,return_predecessors=True);z=int(np.argmax(dist));path=[z]
  while path[-1]!=a:path.append(int(prev[path[-1]]))
  points=vox.indices_to_points(ijk[path]);world_points=points[:,[0,2,1]]*np.array([1,1,-1])+np.array([65.296,39.29,41.081]);length_mm=float(np.linalg.norm(np.diff(points,axis=0),axis=1).sum())
  paths.append({'id':part['id'].replace('canal','corridor'),'sourcePart':part['id'],'label':'하치조 신경혈관 통로 중심선 · 관 기반 추정','side':'left' if 'left' in part['id'] else 'right','points':points.round(5).tolist(),'lengthMm':round(length_mm,3),'voxelSizeMm':.35,'pointCount':len(points),'allPointsInsideVoxelizedCanal':bool(np.all(mask[tuple(ijk[path].T)])),'tissueIdentity':'shared neurovascular corridor; not isolated nerve, artery or vein','method':'voxelized supplied canal surface, filled interior, Lee skeleton, longest geodesic path in largest skeleton component; small branches omitted'})
  print(part['id'],len(points),'points',round(length_mm,2),'mm',flush=True)
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
result={'schema':'oralpilot-neurovascular-corridors-v1','source':'ToothFairy3F_026 canal labels 3/4 via OMFAtlas','sourceMeshSHA256':hashlib.sha256(b).hexdigest(),'coordinates':'source millimeters; transform to display with [x+65.296,z+39.29,41.081-y]','clinicalStatus':'not clinically validated','paths':paths}
(ROOT/'neurovascular-paths.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
