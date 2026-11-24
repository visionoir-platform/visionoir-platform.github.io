"""python3 game/art/build.py. No downloaded image inputs. Pillow required."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
from characters import draw_hero,NAMES,POSES,NFRAMES,portrait
from machines import boss_art,BOSS_STATES,SPECS
from scenery import ZONES,COLORS,sky,architecture,tile,title_scene
from objects import TYPES,object_art
from director import STATES as DIRECTOR_STATES,draw_director
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/unseen/art'
QA=Path(__file__).resolve().parent/'proof'
def emit(name,obj): (OUT/f'{name}.json').write_text(json.dumps(obj,ensure_ascii=False,indent=1)+'\n')
def sheet(w,h,keys,frames,fn):
    im=Image.new('RGBA',(w*frames,h*len(keys)))
    for row,key in enumerate(keys):
        for f in range(frames):im.alpha_composite(fn(key,f),(f*w,row*h))
    return im

def main():
    OUT.mkdir(parents=True,exist_ok=True);QA.mkdir(exist_ok=True)
    title_scene().save(OUT/'noir-city.png')
    portraits=Image.new('RGB',(320,64))
    for i in range(5):portraits.paste(portrait(i),(i*64,0))
    portraits.save(OUT/'portraits.png')
    motion=[]
    for f in range(8):
        strip=Image.new('RGB',(320,64))
        for i in range(5):strip.paste(portrait(i,f),(i*64,0))
        motion.append(strip)
    motion[0].save(OUT/'portraits-motion.png',save_all=True,append_images=motion[1:],loop=0,
                   duration=[800,140,180,90,90,220,180,550])
    spritefiles=[]
    for i,name in enumerate(NAMES):
        for form in [0,1]:
            path=f'character-{i}-{form}.png'
            sheet(64,64,POSES,NFRAMES,lambda p,f:draw_hero(i,p,f,bool(form))).save(OUT/path)
            spritefiles.append(dict(id=name,form=form,file=path))
    bossfiles=[]
    for i in range(len(SPECS)):
        path=f'machine-{i}.png'
        sheet(112,88,BOSS_STATES,6,lambda p,f:boss_art(i,p,f)).save(OUT/path)
        bossfiles.append(dict(id=i,file=path,hull=SPECS[i][0],locomotion=SPECS[i][1],armament=SPECS[i][2],zone=SPECS[i][-1]))
    for z in range(8):
        sky(z).save(OUT/f'sky-{z}.png')
        for layer in (0,1):architecture(z,layer).save(OUT/f'scenery-{z}-{layer}.png')
        tile(z).save(OUT/f'tile-{z}.png')
    sheet(40,40,TYPES,6,object_art).save(OUT/'objects.png')
    sheet(64,64,DIRECTOR_STATES,6,draw_director).save(OUT/'director.png')
    emit('director',{'file':'director.png','frame':[64,64],'pivot':[31,55],'frameCount':6,'rows':DIRECTOR_STATES})
    emit('sprites',{'frame':[64,64],'pivot':[32,56],'portraits':'portraits.png','portraitsMotion':'portraits-motion.png','characters':spritefiles})
    emit('animations',{'frameCount':8,'rows':POSES,'fps':{p:({'run':14,'max':18,'walk':8,'idle':3,'blink':6,'attack':12,'dialogue':5,'victory':6,'cinematic':4}.get(p,9)) for p in POSES}})
    emit('bosses',{'rows':BOSS_STATES,'frameCount':6,'frame':[112,88],'pivot':[55,75],'machines':bossfiles})
    emit('objects',{'rows':TYPES,'file':'objects.png','frameCount':6,'frame':[40,40],'pivot':[20,35]})
    emit('tilesets',{'zones':[dict(id=i,name=n,accent=COLORS[i],sky=f'sky-{i}.png',parallax=[f'scenery-{i}-0.png',f'scenery-{i}-1.png'],tile=f'tile-{i}.png') for i,n in enumerate(ZONES)]})
    emit('provenance',{'profile':'VISIONOIR ORIGINAL','generator':'game/art/build.py','dependencies':['Pillow'],'inputs':'Original authored pixel grids, palette, articulated poses and environment drawings from the generator. No reference image is read by the generator.','creativeDirection':'Flavio Giorgio Guarini','production':'AI-assisted procedural art for VISIONOIR','license':'Original contributions only; see project credits.','files':sorted(p.name for p in OUT.glob('*.png'))})
    # Contact and animated proof outside browser assets.
    contact=Image.new('RGB',(64*len(NAMES),64*6),'#232531')
    for i in range(5):
        for j,p in enumerate(['idle','run','jump','special','transform','superAttack']):
            a=draw_hero(i,p,2,j>=4);contact.paste(a,(i*64,j*64),a)
    contact.resize((640,768),Image.Resampling.NEAREST).save(QA/'characters.png')
    previews=[]
    for f in range(8):
        pic=Image.new('RGB',(320,128),'#202331')
        for i in range(5):
            for row,p in enumerate(['run','superAttack']):
                h=draw_hero(i,p,f,bool(row));pic.paste(h,(i*64,row*64),h)
        previews.append(pic.resize((640,256),Image.Resampling.NEAREST))
    previews[0].save(QA/'character-motion.gif',save_all=True,append_images=previews[1:],duration=110,loop=0)
    machines=Image.new('RGB',(112*6,88*4),'#262536')
    for i in range(23):
        b=boss_art(i,'attack',2);machines.paste(b,((i%6)*112,i//6*88),b)
    machines.save(QA/'boss-contact.png')
    env=Image.new('RGB',(480*2,135*4))
    for z in range(8):
        bg=sky(z).convert('RGBA');bg.alpha_composite(architecture(z,0));bg.alpha_composite(architecture(z,1));env.paste(bg.resize((240,135),Image.Resampling.NEAREST),((z%4)*240,z//4*135))
    env.crop((0,0,960,270)).save(QA/'environments.png')
    sheetobj=Image.new('RGB',(40*10,40*4),'#252536')
    for j,key in enumerate(TYPES):
        obj=object_art(key,2);sheetobj.paste(obj,(j%10*40,j//10*40),obj)
    sheetobj.resize((800,320),Image.Resampling.NEAREST).save(QA/'objects-effects.png')
    print(len(spritefiles),'character atlases;',len(POSES),'poses;',len(bossfiles),'machines;',len(TYPES),'object/FX types')
if __name__=='__main__':main()
