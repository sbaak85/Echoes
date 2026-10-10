"""Offline chroma-key export. Originals stay untouched; geometry uses one crop per direction.
Run with Python + Pillow + NumPy, then node scripts/build-walk-metadata.mjs.
"""
from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'public/characters/walk'
# 綠幕原檔與高解析預覽圖備存在 Assets（不部署）；遊戲只讀 public 的 570x720 透明圖
SOURCE_BASE=ROOT/'Assets/Characters'
QA=ROOT/'output/walk-eight-directions'
QA.mkdir(parents=True,exist_ok=True)
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
 scale=min(size[0]/im.width,size[1]/im.height)
 w,h=round(im.width*scale),round(im.height*scale)
 resized=im.convert('RGBa').resize((w,h),Image.Resampling.LANCZOS).convert('RGBA')
 canvas=Image.new('RGBA',size);canvas.paste(resized,((size[0]-w)//2,(size[1]-h)//2));return canvas
metadata={};validation=[]
for folder,direction in DIRECTIONS.items():
 src=SOURCE_BASE/folder/'Walking_2';hi=SOURCE_BASE/folder/'Walking_2_Transparent_Preview';lo=BASE/folder/'Walking_2_Transparent_570x720'
 hi.mkdir(exist_ok=True);lo.mkdir(exist_ok=True)
 files=sorted(src.glob('*.png'));assert len(files)==26
 bounds=[];alpha_frames=[]
 for file in files:
  digest=hashlib.sha256(file.read_bytes()).hexdigest();source=Image.open(file)
  # Preserve the previously reviewed north exports byte-for-byte.
  if direction!='N':
   full=fit(key_image(source),(1280,1616));full.save(hi/file.name,optimize=True)
   small=full.convert('RGBa').resize((570,720),Image.Resampling.LANCZOS).convert('RGBA');small.save(lo/file.name,optimize=True)
  for dest,size in [(hi,(1280,1616)),(lo,(570,720))]:
   result=Image.open(dest/file.name);assert result.mode=='RGBA' and result.size==size
   assert result.getchannel('A').getextrema()==(0,255)
  assert digest==hashlib.sha256(file.read_bytes()).hexdigest()
  small=Image.open(lo/file.name);a=np.asarray(small)[:,:,3];ys,xs=np.where(a>26)
  bounds.append((int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())));alpha_frames.append(a)
  validation.append({'direction':direction,'file':file.name,'sourceSize':list(source.size),'sourceSha256':digest,'highBytes':(hi/file.name).stat().st_size,'lowBytes':(lo/file.name).stat().st_size})
 x=max(0,min(b[0] for b in bounds)-4);y=max(0,min(b[1] for b in bounds)-4)
 right=min(569,max(b[2] for b in bounds)+4);bottom=min(719,max(b[3] for b in bounds)+4)
 w,h=right-x+1,bottom-y+1;frames=[]
 for file,a in zip(files,alpha_frames):
  crop=a[y:y+h,x:x+w];columns=[]
  for xx in range(w):
   yy=np.flatnonzero(crop[int(h*.48):,xx]>=48)
   if len(yy):columns.append({'x':xx,'bottomY':int(yy[-1])+int(h*.48)})
  frames.append({'source':f'./characters/walk/{folder}/Walking_2_Transparent_570x720/{file.name}','columns':columns})
 metadata[direction]={'crop':{'x':x,'y':y,'width':w,'height':h},'frames':frames}
 print(direction, '26 frames x 2 sizes; crop',x,y,w,h,flush=True)
(QA/'geometry-input.json').write_text(json.dumps(metadata),encoding='utf-8')
(QA/'validation.json').write_text(json.dumps(validation,indent=2),encoding='utf-8')
sheet=Image.new('RGB',(1280,900),'#111820');draw=ImageDraw.Draw(sheet)
for i,(folder,direction) in enumerate(DIRECTIONS.items()):
 p=sorted((BASE/folder/'Walking_2_Transparent_570x720').glob('*.png'))[6];im=Image.open(p);im.thumbnail((300,400))
 x=(i%4)*320;y=(i//4)*450
 bg=Image.new('RGB',(320,450),'#f4f4f4' if i<4 else '#161c24');bg.paste(im,((320-im.width)//2,30),im);ImageDraw.Draw(bg).text((12,10),direction,fill='#668899');sheet.paste(bg,(x,y))
sheet.save(QA/'contact-sheet.png')
print('PASS: 416 RGBA PNGs validated; 208 original source hashes retained.')
