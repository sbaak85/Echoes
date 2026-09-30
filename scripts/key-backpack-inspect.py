"""Requires Pillow and NumPy. Never alters source images or canvas geometry."""
from PIL import Image,ImageFilter,ImageDraw
import numpy as np
from pathlib import Path
import os,json,hashlib
root=Path(__file__).resolve().parents[1]
import argparse
parser=argparse.ArgumentParser(description='Key original 1024px backpack sources without resizing or cropping.')
parser.add_argument('--output',type=Path,required=True)
out=parser.parse_args().output;out.mkdir(parents=True,exist_ok=True)
report=[]
for name,stem,size in [(n,s,z) for n,s in [('10kg','basic-backpack'),('30kg','survival-backpack'),('50kg','powered-backpack')] for z in [1024]]:
 src=root/'Assets/Objects'/f'{name}_{size}.png';im=Image.open(src).convert('RGB');rgb=np.asarray(im).astype(np.float32);r,g,b=rgb.transpose(2,0,1);ex=g-np.maximum(r,b)
 # Vivid chroma green only; olive fabric and cyan displays are excluded.
 bg=(g>110)&(ex>85)&(g>1.8*np.maximum(r,b))
 bg |= (g-r>120)&(g-b>35)&(g>140)
 near=np.asarray(Image.fromarray(bg.astype('uint8')*255).filter(ImageFilter.MaxFilter(7)))>0
 fg=(~bg)&(ex<22)
 # Pillow float blur is unsupported on some builds: blur normalized byte channels.
 def blur(a):return np.asarray(Image.fromarray(np.uint8(np.clip(a,0,255))).filter(ImageFilter.BoxBlur(3))).astype(np.float32)
 weight=blur(fg*255)/255
 estimated=np.stack([blur(rgb[:,:,c]*fg)/np.maximum(weight,.001) for c in range(3)],axis=-1)
 fe=estimated[:,:,1]-np.maximum(estimated[:,:,0],estimated[:,:,2]);fe=np.clip(fe,-30,18)
 key=np.median(rgb[bg],axis=0);ke=key[1]-max(key[0],key[2])
 edge=near&(~bg)&(ex>12)
 alpha=np.ones(g.shape,np.float32);alpha[bg]=0
 alpha[edge]=np.clip((ke-ex[edge])/(ke-fe[edge]),0,1)
 result=rgb.copy();a=alpha[edge,None];result[edge]=np.clip((rgb[edge]-(1-a)*key)/np.maximum(a,.02),0,255)
 # Remove remaining green spill only on the chroma-contaminated boundary.
 result[:,:,1][edge]=np.minimum(result[:,:,1][edge],np.maximum(result[:,:,0][edge],result[:,:,2][edge])+np.maximum(fe[edge],0))
 # The sources contain magenta ringing beside the green screen. Keying green
 # alone leaves that fringe opaque. Correct chroma only within four pixels of
 # the matte; retain luminance so seams and narrow straps keep their detail.
 band=np.asarray(Image.fromarray(bg.astype('uint8')*255).filter(ImageFilter.MaxFilter(9)))>0
 reliable=(~band)&(alpha>.99)
 def boxmean(arr,radius=8):
  padded=np.pad(arr,((radius,radius),(radius,radius)),mode='constant')
  integral=np.pad(padded,((1,0),(1,0))).cumsum(0).cumsum(1)
  k=radius*2+1
  return (integral[k:,k:]-integral[:-k,k:]-integral[k:,:-k]+integral[:-k,:-k])/(k*k)
 weights=boxmean(reliable.astype(float))
 local=np.stack([boxmean(rgb[:,:,c]*reliable)/np.maximum(weights,1e-8) for c in range(3)],axis=-1)
 luma=np.array([.2126,.7152,.0722])
 local_chroma=local-(local@luma)[:,:,None]
 # Fall back to neutral for sub-pixel features without a reliable interior.
 local_chroma[weights<.015]=0
 pink=band&(alpha>0)&(np.minimum(result[:,:,0],result[:,:,2])-result[:,:,1]>3)
 result[pink]=np.clip((result@luma)[pink,None]+local_chroma[pink],0,255)
 # Soften the matte with a 1px Gaussian, without blurring the item's texture.
 # Extend foreground RGB into newly translucent pixels using premultiplied
 # color, so neither transparent black nor the original green leaks in.
 def feather(arr):
  kernel=np.exp(-np.arange(-3,4,dtype=float)**2/2)
  kernel/=kernel.sum()
  padded=np.pad(arr,((0,0),(3,3)),mode='edge')
  horizontal=sum(w*padded[:,i:i+arr.shape[1]] for i,w in enumerate(kernel))
  padded=np.pad(horizontal,((3,3),(0,0)),mode='edge')
  return sum(w*padded[i:i+arr.shape[0],:] for i,w in enumerate(kernel))
 softened=feather(alpha)
 extended=(alpha==0)&(softened>0)
 for channel in range(3):
  color=feather(result[:,:,channel]*alpha)/np.maximum(softened,1e-8)
  result[:,:,channel][extended]=color[extended]
 alpha=softened
 rgba=np.dstack((np.uint8(np.rint(result)),np.uint8(np.rint(alpha*255))));rgba[alpha==0,:3]=0
 cut=Image.fromarray(rgba,'RGBA');assert cut.size==(size,size);cut.save(out/f'{name}_{size}-cutout.png')
 kind='icon' if size==280 else 'inspect';cut.save(out/f'{stem}-{kind}-{size}.png')
 feather_band=np.asarray(Image.fromarray(band.astype('uint8')*255).filter(ImageFilter.MaxFilter(7)))>0
 core=(~feather_band);assert np.array_equal(rgba[:,:,:3][core],np.asarray(im)[core]);assert np.all(rgba[:,:,3][core]==255)
 report.append(dict(source=name,size=im.size,key=key.tolist(),feather_sigma_px=1,transparent=int((rgba[:,:,3]==0).sum()),semi=int(((rgba[:,:,3]>0)&(rgba[:,:,3]<255)).sum()),bounds=cut.getbbox(),core_pixels_preserved=int(core.sum()),fringe_pixels_corrected=int(pink.sum()),source_sha256=hashlib.sha256(src.read_bytes()).hexdigest()))


(out/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
