"""Independent source-frame sections of the example placements; no clinical clearance validation."""
from pathlib import Path
import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
root=Path(__file__).resolve().parents[1]; m=json.loads((root/'public/anatomy/manifest.json').read_text());b=(root/'public/anatomy/toothfairy.bin').read_bytes()
fig,axes=plt.subplots(2,3,figsize=(12,8));rows=[]
for col,fdi in enumerate([46,36,24]):
 tooth=next(p for p in m['parts'] if p.get('fdi')==fdi and p['group']=='tooth');anchor=np.array(tooth['implantAnchor']['origin']);up=np.array(tooth['axes']['up']);side=np.array(tooth['axes']['side']);out=np.cross(side,up);basis=np.stack([side,up,out],axis=1)
 for p in m['parts']:
  if p.get('jaw')!=tooth['jaw'] or p['group'] not in ['bone','tooth','canal','sinus']:continue
  v=np.frombuffer(b,dtype='<f4',count=p['vertexCount']*3,offset=p['positions']).reshape(-1,3);v=(v-anchor)@basis
  for row,(horizontal,cut) in enumerate([(0,2),(2,0)]):
   keep=(np.abs(v[:,cut])<2)&(np.abs(v[:,horizontal])<16)&(np.abs(v[:,1])<23)
   axes[row,col].scatter(v[keep,horizontal],v[keep,1],s=1,alpha=.3,color={'bone':'#8c8f94','tooth':'#2979af','canal':'#e29317','sinus':'#db6072'}[p['group']])
 for row in range(2):
  ax=axes[row,col];diameter=3.5 if fdi==24 else 4.2;ax.add_patch(Rectangle((-diameter/2,-10),diameter,10,color='#009e83',alpha=.55));ax.plot([0,0],[-17,12],color='#009e83',linestyle='--');ax.axhline(0,color='#aaa',linewidth=.5);ax.set(xlim=(-16,16),ylim=(-23,14),aspect='equal',title=f'#{fdi} '+['mesiodistal','buccolingual'][row],xlabel='Local mm',ylabel='Crown + / root - (mm)')
fig.suptitle('Original mesh sections and tooth-axis-aligned implant examples\nCervical origin estimated from geometry; not a surgical validation')
fig.tight_layout();outdir=root/'validation';outdir.mkdir(exist_ok=True);fig.savefig(outdir/'implant-source-sections.png',dpi=150)
