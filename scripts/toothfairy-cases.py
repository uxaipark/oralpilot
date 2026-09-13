"""Index local ToothFairy releases and prepare one cached 3D case on demand.
No archive is extracted wholesale; only the requested image/label is read.
TF2/3 index axes are RPI, as documented by the dataset authors. Rotating
[-x, y, -z] before the viewer's [x,z,-y] transform preserves handedness.
"""
from pathlib import Path
import argparse, hashlib, io, json, re, shutil, tempfile, zipfile
ROOT = Path(__file__).resolve().parents[2]
ARCHIVES = ROOT / 'datasets/ToothFairy'
CACHE = ARCHIVES / 'oralpilot-cases'
PUBLIC = ROOT / 'web/public/cases/toothfairy'
SCHEMA = 'oralpilot-toothfairy-v1'

def inventory():
    cases = []
    raw = {}
    raw_zip = ARCHIVES/'ToothFairy_Raw_Dataset.zip'
    if raw_zip.exists():
        with zipfile.ZipFile(raw_zip) as z:
            for i in z.infolist():
                if i.filename.endswith('.dcm'):
                    key=i.filename.split('/')[0]
                    raw[key] = raw.get(key,0)+1
    for version, filename in [(1,'ToothFairy_Dataset.zip'),(2,'ToothFairy2_Dataset.zip'),(3,'ToothFairy3.zip'),(4,'toothfairy4_v03.zip')]:
        archive = ARCHIVES/filename
        if not archive.exists(): continue
        with zipfile.ZipFile(archive) as z:
            infos = {i.filename:i for i in z.infolist() if not i.is_dir()}
            for name, info in infos.items():
                if version==1:
                    m=re.fullmatch(r'ToothFairy_Dataset/Dataset/(P\d+)/data.npy',name)
                    if not m: continue
                    case=m[1]; folder=name.rsplit('/',1)[0]
                    label=next((f'{folder}/{f}' for f in ['gt_alpha.npy'] if f'{folder}/{f}' in infos),None)
                    sparse=f'{folder}/gt_sparse.npy'
                    reports=[]
                elif version in (2,3):
                    m=re.search(r'imagesTr/ToothFairy[23]([FPS]_\d+)_0000\.(mha|nii.gz)$',name)
                    if not m: continue
                    case=m[1]; label=name.replace('imagesTr/','labelsTr/').replace('_0000.','.')
                    if label not in infos: label=None
                    sparse=None; reports=[]
                else:
                    m=re.fullmatch(r'([AFPS]\d+)/cbct/volume.nii.gz',name)
                    if not m: continue
                    case=m[1]; label=None; sparse=None
                    reports=[n for n in infos if n.startswith(f'{case}/reports_en/') and n.endswith('.txt')]
                source_size=info.file_size+(infos[label].file_size if label else 0)
                cases.append(dict(id=f'tf{version}-{case}',version=version,case=case,name=f'ToothFairy{version} · {case}',archive=filename,image=name,label=label,sparse=sparse,reports=reports,sourceBytes=source_size,rawDicomFiles=raw.get(case.replace('_','').replace('P0','P'),0) if version==1 else 0,kind='segmented' if version in (2,3) and label else 'canal' if label else 'volume',ready=(PUBLIC/f'tf{version}-{case}.json').exists()))
    cases.sort(key=lambda c:(c['version'],c['case'][0],int(re.search(r'\d+',c['case'])[0])))
    result=dict(schema=SCHEMA,archives=[dict(name=p.name,bytes=p.stat().st_size) for p in sorted(ARCHIVES.glob('*.zip'))],counts={str(v):sum(c['version']==v for c in cases) for v in range(1,5)},cases=cases)
    CACHE.mkdir(parents=True,exist_ok=True); PUBLIC.mkdir(parents=True,exist_ok=True)
    (CACHE/'catalog.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    (PUBLIC/'catalog.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    return result

def prepare(case_id, publish=False):
    import numpy as np
    import SimpleITK as sitk
    import scipy.ndimage as ndi
    from skimage.measure import marching_cubes
    import trimesh
    import fast_simplification
    catalog=json.loads((CACHE/'catalog.json').read_text()) if (CACHE/'catalog.json').exists() else inventory()
    entry=next((c for c in catalog['cases'] if c['id']==case_id),None)
    if not entry: raise ValueError('Unknown case ID')
    cache=CACHE/case_id; cache.mkdir(exist_ok=True)
    dest_json=cache/'case.json'; dest_bin=cache/'surface.bin'
    if not dest_json.exists() or not dest_bin.exists() or json.loads(dest_json.read_text()).get('processingVersion') != 2:
        with zipfile.ZipFile(ARCHIVES/entry['archive']) as z, tempfile.TemporaryDirectory(prefix='oralpilot-tf-') as tmp:
            source=entry['label'] if entry['kind']=='segmented' else entry['image']
            raw=z.read(source); sha=hashlib.sha256(raw).hexdigest()
            if source.endswith('.npy'):
                volume=np.load(io.BytesIO(raw),allow_pickle=False).astype(np.float32)
                spacing=np.ones(3); physical=False
            else:
                path=Path(tmp)/Path(source).name;path.write_bytes(raw)
                im=sitk.ReadImage(str(path));volume=sitk.GetArrayFromImage(im)
                spacing=np.array(im.GetSpacing())[::-1];physical=True
            chunks=[];segments=[];offset=0;teeth=[]
            def add_surface(field,origin,step,label,kind,jaw,budget):
                nonlocal offset
                if min(field.shape)<2 or not np.any(field>=.5):return
                padded=np.pad(field.astype(np.float32),1)
                smooth=ndi.gaussian_filter(padded,.55 if kind not in ['canal','pulp'] else .35)
                if smooth.max()<=.5:return
                v,f,_,_=marching_cubes(smooth,.5,spacing=tuple(spacing*step))
                v += (np.asarray(origin)-step)*spacing
                # In voxel order Z,Y,X; RPI TF1/2/3 correction is a rotation, not mirroring.
                if entry['version']<=3: v=np.column_stack([-v[:,2],v[:,1],-v[:,0]])
                else:
                    xyz=v[:,::-1]
                    v=xyz@np.array(im.GetDirection()).reshape(3,3).T+np.array(im.GetOrigin())
                if len(f)>budget:v,f=fast_simplification.simplify(v,f,target_count=budget)
                original=v.copy()
                mesh=trimesh.Trimesh(v,f,process=False)
                trimesh.smoothing.filter_taubin(mesh,lamb=.5,nu=.53,iterations=8)
                displacement=mesh.vertices-original
                distance=np.linalg.norm(displacement,axis=1)
                # Isolated or skinny triangles can destabilize Taubin smoothing.
                # Bound every displacement to preserve the measured surface.
                limit=float(min(spacing)*.75)
                mesh.vertices=original+displacement*np.minimum(1,limit/np.maximum(distance,1e-12))[:,None]
                v=np.ascontiguousarray(mesh.vertices,dtype='<f4');f=np.ascontiguousarray(mesh.faces,dtype='<u4')
                # Marching-cubes winding changes under the odd ZYX -> XYZ permutation.
                # Repair by volume sign; all package parts have an outward orientation.
                if mesh.volume<0:f=f[:,[0,2,1]].copy()
                vb=v.tobytes();fb=f.tobytes()
                segments.append(dict(jaw=jaw,kind=kind,label=label,positions=offset,vertexCount=len(v),indices=offset+len(vb),indexCount=f.size,source=source,sourceSHA256=sha))
                chunks.extend([vb,fb]);offset+=len(vb)+len(fb)
            if entry['kind']=='segmented':
                objects=ndi.find_objects(volume.astype(np.int16))
                for label,sl in enumerate(objects,1):
                    if sl is None:continue
                    tooth=(11<=label<=48 and label%10 in range(1,9) and label//10 in range(1,5))
                    pulp=(111<=label<=148 and (label-100)%10 in range(1,9) and (label-100)//10 in range(1,5))
                    if label in [1,2]:kind='bone';jaw='mandible' if label==1 else 'maxilla';budget=24000
                    elif label in [3,4,103,104,105]:kind='canal';jaw='mandible';budget=4500
                    elif label in [5,6]:kind='sinus';jaw='maxilla';budget=3500
                    elif tooth:kind='tooth';jaw='maxilla' if label<30 else 'mandible';budget=6000;teeth.append(label)
                    elif pulp:kind='pulp';jaw='maxilla' if label<130 else 'mandible';budget=3000
                    elif label in [8,9,10]:kind='restoration';jaw='both';budget=5000
                    else:continue
                    origin=[s.start for s in sl];field=volume[sl]==label
                    add_surface(field,origin,1,label,kind,jaw,budget)
            else:
                # Only an intensity isosurface is available, never a claimed tooth segmentation.
                step=max(1,int(np.ceil(max(volume.shape)/224)))
                sampled=volume[::step,::step,::step]
                finite=sampled[np.isfinite(sampled)]
                threshold=700.0 if entry['version']==1 else float(np.percentile(finite,85))
                add_surface(sampled>=threshold,[0,0,0],step,0,'surface','both',65000)
                if entry['label']:
                    dense=np.load(io.BytesIO(z.read(entry['label'])),allow_pickle=False)
                    add_surface(dense>=.5,[0,0,0],1,1,'canal','mandible',7000)
            if not segments:raise ValueError('No displayable surface in this case')
            payload=b''.join(chunks)
            record=dict(processingVersion=2,id=case_id,name=entry['name'],dataset=f'ToothFairy{entry["version"]}',upper=any(s['jaw'] in ['maxilla','both'] for s in segments),lower=any(s['jaw'] in ['mandible','both'] for s in segments),teeth=sorted(teeth),bytes=len(payload),sha256=hashlib.sha256(payload).hexdigest(),url=f'/cases/toothfairy/{case_id}.bin',segments=segments,sourceArchive=entry['archive'],sourceImage=entry['image'],sourceLabel=entry['label'],sourceShape=list(volume.shape),spacing=spacing[::-1].tolist(),units='mm' if physical else 'voxel',kind=entry['kind'],orientation='RPI voxel axes; rigid rotation [-x,y,-z], viewer [x,z,-y]' if entry['version']<=3 else 'LPS physical coordinates from NIfTI; viewer [x,z,-y]',reports=[dict(name=Path(r).name,text=z.read(r).decode('utf-8-sig')) for r in entry['reports']],sourceUrl=f'https://ditto.ing.unimore.it/toothfairy{entry["version"] if entry["version"]>1 else ""}/',processing='Label boundary: Gaussian 0.55 voxel (canal/pulp 0.35), marching cubes 0.5, quadric decimation, Taubin 8 iterations with displacement capped at 0.75 of the smallest voxel spacing. All labeled components retained. Unlabeled images use intensity threshold preview only.')
            if entry['kind']!='segmented':record['threshold']=threshold
            dest_bin.with_suffix('.tmp').write_bytes(payload);dest_bin.with_suffix('.tmp').replace(dest_bin)
            dest_json.with_suffix('.tmp').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n');dest_json.with_suffix('.tmp').replace(dest_json)
    if publish:
        PUBLIC.mkdir(parents=True,exist_ok=True)
        shutil.copy2(dest_bin,PUBLIC/f'{case_id}.bin');shutil.copy2(dest_json,PUBLIC/f'{case_id}.json')
    return json.loads(dest_json.read_text())

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['scan','prepare']);p.add_argument('--case');p.add_argument('--publish',action='store_true');args=p.parse_args()
    if args.command=='scan':print(json.dumps(inventory()['counts']))
    else:
        record=prepare(args.case,args.publish)
        print(json.dumps(dict(id=record['id'],bytes=record['bytes'],segments=len(record['segments']),teeth=len(record['teeth']))))
