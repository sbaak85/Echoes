"""Export eight idle sprites with the reviewed walk chroma-key settings.
Run with Pillow + NumPy, then node scripts/build-idle-metadata.mjs.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];BASE=ROOT/'public/characters';QA=ROOT/'output/idle-eight-directions'
QA.mkdir(parents=True,exist_ok=True)
HI=BASE/'idle/Transparent_1280x1616';LO=BASE/'idle/Transparent_570x720'
HI.mkdir(parents=True,exist_ok=True);LO.mkdir(parents=True,exist_ok=True)
DIRECTIONS={'01_N_Back':'N','02_NE_BackRight':'NE','03_E_Right':'E','04_SE_FrontRight':'SE','05_S_Front':'S','06_SW_FrontLeft':'SW','07_W_Left':'W','08_NW_BackLeft':'NW'}
def smooth(a,b,v):
 t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
def key_image(im):
 rgb=np.asarray(im.convert('RGB')).astype(np.float32)
 r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2];dom=g-np.maximum(r,b);ratio=dom/np.maximum(g,1)
 alpha=np.rint((1-smooth(8,58,dom)*smooth(.10,.58,ratio))*255).astype(np.uint8)
 rgb[:,:,1]=np.where((dom>0)&(ratio>.10),np.minimum(g,np.maximum(r,b)),g)
 rgba=np.dstack((np.clip(rgb,0,255).astype(np.uint8),alpha));rgba[alpha==0,:3]=0
 return Image.fromarray(rgba,'RGBA')
def fit(im,size):
 scale=min(size[0]/im.width,size[1]/im.height);w,h=round(im.width*scale),round(im.height*scale)
 resized=im.convert('RGBa').resize((w,h),Image.Resampling.LANCZOS).convert('RGBA')
 canvas=Image.new('RGBA',size);canvas.paste(resized,((size[0]-w)//2,(size[1]-h)//2));return canvas
metadata={};validation=[]
for name,d in DIRECTIONS.items():
 p=BASE/(name+'.png');digest=hashlib.sha256(p.read_bytes()).hexdigest();source=Image.open(p)
 high=fit(key_image(source),(1280,1616));high.save(HI/p.name,optimize=True)
 low=high.convert('RGBa').resize((570,720),Image.Resampling.LANCZOS).convert('RGBA');low.save(LO/p.name,optimize=True)
 for output,size in [(HI,(1280,1616)),(LO,(570,720))]:
  im=Image.open(output/p.name);assert im.size==size and im.mode=='RGBA'
  assert im.getchannel('A').getextrema()==(0,255)
 a=np.asarray(low)[:,:,3];yy,xx=np.where(a>26)
 x=max(0,int(xx.min())-4);y=max(0,int(yy.min())-4);w=min(569,int(xx.max())+4)-x+1;h=min(719,int(yy.max())+4)-y+1
 crop=a[y:y+h,x:x+w];columns=[]
 for xx in range(w):
  yy=np.flatnonzero(crop[int(h*.48):,xx]>=48)
  if len(yy):columns.append({'x':xx,'bottomY':int(yy[-1])+int(h*.48)})
 metadata[d]={'source':f'./characters/idle/Transparent_570x720/{p.name}','crop':{'x':x,'y':y,'width':w,'height':h},'columns':columns}
 assert digest==hashlib.sha256(p.read_bytes()).hexdigest()
 validation.append({'direction':d,'file':p.name,'sourceSize':list(source.size),'sourceSha256':digest,'highBytes':(HI/p.name).stat().st_size,'lowBytes':(LO/p.name).stat().st_size})
 print(d,'exported both sizes',flush=True)
(QA/'geometry-input.json').write_text(json.dumps(metadata),encoding='utf-8')
(QA/'validation.json').write_text(json.dumps(validation,indent=2),encoding='utf-8')
sheet=Image.new('RGB',(1280,900))
for i,(name,d) in enumerate(DIRECTIONS.items()):
 im=Image.open(LO/(name+'.png'));im.thumbnail((300,400))
 bg=Image.new('RGB',(320,450),'#f4f4f4' if i<4 else '#161c24');bg.paste(im,((320-im.width)//2,30),im);ImageDraw.Draw(bg).text((12,10),d,fill='#668899');sheet.paste(bg,((i%4)*320,(i//4)*450))
sheet.save(QA/'contact-sheet.png')
print('PASS: 16 RGBA sprites, both sizes verified; 8 originals unchanged.')
